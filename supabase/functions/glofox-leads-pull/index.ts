// glofox-leads-pull, v2 (23 Sep 2026)
//
// The ingestion GymGlitch did by parsing notification emails, done properly:
// every few minutes, read Glofox's own lead list through the saved session and
// land anything new in gymIQ. From the moment this runs, a free-trial request
// on the website is on the Lead Desk within five minutes, with the person's
// own "how did you hear about us" answer and Glofox's consent flags attached.
//
// Source: GET api.glofox.com/2.0/members?branch_id=&lead_status=LEAD&sort=-created
// Each row: name, phone, email, birth, leads.marketing_source(+details),
// source (UNKNOWN|MEMBER_APP|DASHBOARD|WEBPORTAL|IMPORTS), consent.sms/email.
//
// Rules
//  - A person already in gymIQ (same mobile, else same email) is NOT recreated.
//    They get the Glofox id, source and consent attached, and nothing else
//    happens: no first touch, no desk entry. Most of Glofox's 4,591 leads are
//    already here from the GymGlitch import.
//  - A genuinely new person becomes a lead in stage 'new' with a first-touch
//    deadline, exactly as the website capture route does, so the human desk
//    sees them immediately even before AI messaging is switched on. The lead
//    engine's first-touch-due job picks them up from metadata.needs_first_touch.
//  - Glofox's consent flags are stored on the lead as evidence. They are NOT
//    written to consent_marketing: a trial request is permission to be
//    contacted about that trial, and consent_marketing=false means opted out.
//  - IMPORTS-sourced rows older than the watermark are skipped: they are
//    historic bulk loads, not enquiries.
//  - The Glofox session key never appears in any response or log.
//
// v2: the watermark is written with gym_settings_merge() (a JSONB merge in the
// database) instead of read-modify-write of the whole settings blob, so a pull
// can no longer clobber a test identity or alert address saved while it ran.
//
// Routes
//   POST/GET ?route=pull            the scheduled pull (x-sync-secret or desk key)
//   GET      ?route=health          watermark, last run, counts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GYM_ID = "d3a32b32-6930-4660-8c5b-9df3a90aeb11";
const STUDIO_ID = "6903b276e3b73cf4b00e2ab0";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { "Content-Type": "application/json" } });
type Row = Record<string, any>;

function normPhone(p?: string | null): string | null {
  if (!p) return null;
  const d = String(p).replace(/[^0-9]/g, "");
  if (!d) return null;
  if (/^447\d{9}$/.test(d)) return "+" + d;
  if (/^07\d{9}$/.test(d)) return "+44" + d.slice(1);
  if (/^7\d{9}$/.test(d)) return "+44" + d;
  if (/^0\d{10}$/.test(d)) return "+44" + d.slice(1);
  if (/^44\d{10}$/.test(d)) return "+" + d;
  return "+" + d;
}

function mapSource(g: Row): string {
  const code = String(g?.leads?.marketing_source_code ?? "").toLowerCase();
  const src = String(g?.source ?? "").toUpperCase();
  if (code === "landing-page") return "free_trial";
  if (src === "WEBPORTAL") return "website";
  if (src === "MEMBER_APP") return "free_trial";
  if (src === "DASHBOARD") return "walk_in";
  return "free_trial";
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "pull";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: gym } = await sb.from("gyms").select("id, settings").eq("id", GYM_ID).maybeSingle();
  const settings: Row = gym?.settings ?? {};
  const state: Row = settings.glofox_leads ?? {};

  if (route === "health") {
    return json({ ok: true, watermark: state.watermark ?? null, last_run: state.last_run ?? null, last_result: state.last_result ?? null });
  }

  // auth: the shared job secret (same as the other pulls) or the desk key
  const presented = req.headers.get("x-sync-secret") ?? req.headers.get("x-desk-key") ?? "";
  let authed = !!DESK_KEY && presented === DESK_KEY;
  if (!authed && presented) {
    const { data: ok } = await sb.rpc("lead_desk_auth", { p_key: presented });
    authed = ok === true;
  }
  if (!authed) return json({ ok: false, error: "forbidden" }, 403);

  const { data: tok } = await sb.from("glofox_tokens").select("access_token, expires_at").eq("gym_id", GYM_ID).maybeSingle();
  if (!tok) return json({ ok: false, error: "no stored Glofox session" }, 503);
  if (new Date(tok.expires_at as string).getTime() <= Date.now()) {
    return json({ ok: false, error: "the Glofox login needs redoing on the desktop" }, 503);
  }
  const headers = { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json", "User-Agent": UA };

  // Watermark: unix seconds of the newest Glofox lead we have seen. First run
  // looks back 30 days so the desk starts with the live backlog, not history.
  const firstRun = !state.watermark;
  const watermark = Number(state.watermark ?? Math.floor(Date.now() / 1000) - 30 * 86400);
  const pages = firstRun ? 5 : 2;

  const fresh: Row[] = [];
  for (let page = 1; page <= pages; page++) {
    const r = await fetch(`https://api.glofox.com/2.0/members?branch_id=${STUDIO_ID}&lead_status=LEAD&sort=-created&limit=100&page=${page}`, { headers });
    if (r.status === 401 || r.status === 403) return json({ ok: false, error: "Glofox session rejected" }, 502);
    const j = await r.json().catch(() => null);
    const rows: Row[] = j?.data ?? [];
    let older = false;
    for (const g of rows) {
      if (Number(g.created) <= watermark) { older = true; continue; }
      fresh.push(g);
    }
    if (older || !j?.has_more) break;
  }

  const { data: cfg } = await sb.from("lead_desk_config").select("first_touch_minutes, default_owner").eq("gym_id", GYM_ID).maybeSingle();
  const firstTouchMin = Number(cfg?.first_touch_minutes ?? 15);
  const owner = cfg?.default_owner ?? null;

  let created = 0, attached = 0, skipped = 0, newest = watermark;
  const createdNames: string[] = [];

  // oldest first so created_at ordering on the desk matches reality
  fresh.sort((a, b) => Number(a.created) - Number(b.created));

  for (const g of fresh) {
    newest = Math.max(newest, Number(g.created));
    const src = String(g.source ?? "").toUpperCase();
    if (src === "IMPORTS") { skipped++; continue; }

    const phone = normPhone(g.phone);
    const email = String(g.email ?? g.contact_email ?? "").trim().toLowerCase() || null;
    if (!phone && !email) { skipped++; continue; }

    const glofox = {
      id: String(g._id),
      created: new Date(Number(g.created) * 1000).toISOString(),
      source: g.source ?? null,
      marketing_source: g?.leads?.marketing_source ?? null,
      marketing_source_details: g?.leads?.marketing_source_details ?? null,
      lead_status: g.lead_status ?? null,
      trial_pass: g?.membership ? { type: g.membership.type, status: g.membership.status, start: g.membership.start_date ?? null } : null,
      consent: { sms: g?.consent?.sms?.active ?? null, email: g?.consent?.email?.active ?? null },
      birth: g.birth ?? null,
    };

    // already here? mobile first, then email
    let existing: Row | null = null;
    if (phone) {
      const { data } = await sb.from("leads").select("id, metadata, external_id").eq("gym_id", GYM_ID).eq("phone_e164", phone).order("created_at", { ascending: false }).limit(1).maybeSingle();
      existing = data ?? null;
    }
    if (!existing && email) {
      const { data } = await sb.from("leads").select("id, metadata, external_id").eq("gym_id", GYM_ID).eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
      existing = data ?? null;
    }

    if (existing) {
      const meta = { ...(existing.metadata ?? {}), glofox };
      await sb.from("leads").update({ metadata: meta, updated_at: new Date().toISOString() }).eq("id", existing.id);
      attached++;
      continue;
    }

    const source = mapSource(g);
    const createdAt = glofox.created;
    const dueAt = new Date(Math.max(Date.now(), new Date(createdAt).getTime()) + firstTouchMin * 60_000).toISOString();
    const { data: lead, error } = await sb.from("leads").insert({
      gym_id: GYM_ID,
      first_name: String(g.first_name ?? "").trim() || null,
      last_name: String(g.last_name ?? "").trim() || null,
      phone, phone_e164: phone, email,
      source,
      external_id: String(g._id), external_system: "glofox", imported_from: "glofox",
      stage: "lead", current_stage: "new", owner,
      due_at: dueAt,
      created_at: createdAt,
      metadata: { glofox, needs_first_touch: true },
    }).select("id").single();
    if (error) { skipped++; continue; }

    await sb.from("lead_journey").insert({
      lead_id: lead.id, action: "captured", stage: "new", from_stage: null, channel: "glofox",
      message: `source=${source}, glofox ${glofox.marketing_source ?? glofox.source ?? "lead"}${glofox.marketing_source_details ? ", heard via " + glofox.marketing_source_details : ""}`,
    });
    created++;
    createdNames.push(String(g.first_name ?? "?"));
  }

  const result = { ran_at: new Date().toISOString(), seen: fresh.length, created, attached, skipped, first_run: firstRun };
  await sb.rpc("gym_settings_merge", {
    p_gym_id: GYM_ID,
    p_patch: { glofox_leads: { watermark: newest, last_run: result.ran_at, last_result: result } },
  });

  return json({ ok: true, ...result, created_first_names: createdNames.slice(0, 20) });
});
