// glofox-leads-pull, v3 (2 Oct 2026)
//
// BACKSTOP AND CONVERSION CHECK. The club mailbox (hoddesdon@energiefitness.com)
// is the trigger for a free-trial lead; this function is the safety net behind
// it, and the ONLY source for abandoned carts, and the thing that notices when
// a lead has bought a membership.
//
// Source: GET api.glofox.com/2.0/members?branch_id=&lead_status=LEAD&sort=-created
// Each row: name, phone, email, birth, leads.marketing_source(+details),
// source (UNKNOWN|MEMBER_APP|DASHBOARD|WEBPORTAL|IMPORTS), consent.sms/email.
//
// What a Glofox lead means (checked against GymGlitch's own labels, 2 Oct):
//   source UNKNOWN + marketing_source "Landing Page"  = the website free-trial form
//                                                        (TwoTaps creates the lead by API
//                                                        within a minute of the email)
//   source UNKNOWN + no marketing_source               = someone started the join
//                                                        checkout on the website and did
//                                                        not pay: an ABANDONED CART.
//                                                        GymGlitch collected these at
//                                                        05:00 the next morning; we see
//                                                        them within 5 minutes and wait
//                                                        an hour before the opener.
//   source MEMBER_APP                                  = enquiry from the Energie app
//   source DASHBOARD                                   = staff typed them in
//   source WEBPORTAL                                   = Glofox's hosted portal
//   source IMPORTS                                     = bulk history, skipped
//
// Conversion: GET api.glofox.com/2.0/members/{id} returns lead_status LEAD or
// MEMBER, leads.status_modified (when it changed) and the membership bought
// (plan_name, plan_price, start_date). ?route=conversions checks every open lead
// we hold a Glofox id for, marks the ones that have joined, and tells the lead
// engine so nurture stops and the welcome goes out. The nightly reconcile job
// still covers leads with no Glofox id, by phone, email and name.
//
// Rules
//  - A person already in gymIQ (same mobile, else same email) is NOT recreated.
//    They get the Glofox id, source and consent attached, and nothing else
//    happens: no first touch, no desk entry.
//  - A genuinely new person becomes a lead in stage 'new' with
//    metadata.needs_first_touch=true and a due_at the engine honours: now for a
//    free trial, +60 minutes for an abandoned cart (settings.lead_engine
//    .abandoned_cart_delay_minutes), +15 for anything else.
//  - Glofox's consent flags are stored as evidence, never written to
//    consent_marketing (false there means opted out).
//  - The Glofox session key never appears in any response or log.
//  - Settings are written with gym_settings_merge(), never read-modify-write.
//
// Routes
//   POST/GET ?route=pull            the scheduled pull (x-sync-secret or desk key)
//   POST/GET ?route=conversions     check open leads against Glofox (same auth)
//                                   body {limit, lead_ids[], notify_engine, force}
//   GET      ?route=health          watermark, last run, counts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GYM_ID = "d3a32b32-6930-4660-8c5b-9df3a90aeb11";
const STUDIO_ID = "6903b276e3b73cf4b00e2ab0";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FN = Deno.env.get("PUBLIC_FN_URL") ?? `${SB_URL}/functions/v1`;
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
  const msrc = String(g?.leads?.marketing_source ?? "").trim().toLowerCase();
  const src = String(g?.source ?? "").toUpperCase();
  if (code === "landing-page" || msrc === "landing page") return "free_trial";
  if (src === "WEBPORTAL") return "website";
  if (src === "MEMBER_APP") return "free_trial";
  if (src === "DASHBOARD") return "walk_in";
  if (src === "UNKNOWN" && !msrc) return "abandoned_cart";
  return "free_trial";
}

// A Glofox member record that has bought a membership, however it is flagged.
function purchased(m: Row): boolean {
  if (String(m.lead_status ?? "").toUpperCase() === "MEMBER") return true;
  if (m.MEMBERPURCHASE === true) return true;
  const ms = m.membership;
  if (ms && String(ms.status ?? "").toUpperCase() === "ACTIVE" && String(ms.type ?? "") !== "payg" && ms.trial !== true) return true;
  return false;
}

async function glofoxHeaders(sb: any): Promise<Record<string, string> | Response> {
  const { data: tok } = await sb.from("glofox_tokens").select("access_token, expires_at").eq("gym_id", GYM_ID).maybeSingle();
  if (!tok) return json({ ok: false, error: "no stored Glofox session" }, 503);
  if (new Date(tok.expires_at as string).getTime() <= Date.now()) {
    return json({ ok: false, error: "the Glofox login needs redoing on the desktop" }, 503);
  }
  return { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json", "User-Agent": UA };
}

let _ik = "";
async function internalKey(): Promise<string> {
  if (DESK_KEY) return DESK_KEY;
  if (_ik) return _ik;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/internal_desk_key`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: "{}" });
  _ik = String(await r.json().catch(() => "")).replace(/^"|"$/g, "");
  return _ik;
}
async function tellEngine(route: string, payload: Row): Promise<Row> {
  try {
    const r = await fetch(`${FN}/gymiq-lead-engine?route=${route}`, { method: "POST", headers: { "Content-Type": "application/json", "x-desk-key": await internalKey() }, body: JSON.stringify(payload) });
    return { http: r.status, ...(await r.json().catch(() => ({}))) };
  } catch (e) { return { http: 0, error: String(e).slice(0, 200) }; }
}

// ---------------------------------------------------------------------------
async function routePull(sb: any, settings: Row) {
  const state: Row = settings.glofox_leads ?? {};
  const hdr = await glofoxHeaders(sb); if (hdr instanceof Response) return hdr;

  // Watermark: unix seconds of the newest Glofox lead we have seen. First run
  // looks back 30 days so the desk starts with the live backlog, not history.
  const firstRun = !state.watermark;
  const watermark = Number(state.watermark ?? Math.floor(Date.now() / 1000) - 30 * 86400);
  const pages = firstRun ? 5 : 2;

  const fresh: Row[] = [];
  for (let page = 1; page <= pages; page++) {
    const r = await fetch(`https://api.glofox.com/2.0/members?branch_id=${STUDIO_ID}&lead_status=LEAD&sort=-created&limit=100&page=${page}`, { headers: hdr });
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
  const cartDelayMin = Number(settings?.lead_engine?.abandoned_cart_delay_minutes ?? 60);
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
      checked_at: new Date().toISOString(),
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
    const delayMin = source === "abandoned_cart" ? cartDelayMin : source === "free_trial" ? 0 : firstTouchMin;
    const dueAt = new Date(Math.max(Date.now(), new Date(createdAt).getTime()) + delayMin * 60_000).toISOString();
    const { data: lead, error } = await sb.from("leads").insert({
      gym_id: GYM_ID,
      first_name: String(g.first_name ?? "").trim() || null,
      last_name: String(g.last_name ?? "").trim() || null,
      phone, phone_e164: phone, email,
      source,
      external_id: String(g._id), external_system: "glofox", imported_from: "glofox",
      stage: "lead", current_stage: "new", owner,
      score: source === "abandoned_cart" ? 70 : 50,
      due_at: dueAt,
      created_at: createdAt,
      metadata: { glofox, needs_first_touch: true },
    }).select("id").single();
    if (error) { skipped++; continue; }

    await sb.from("lead_journey").insert({
      lead_id: lead.id, action: "captured", stage: "new", from_stage: null, channel: "glofox",
      message: source === "abandoned_cart"
        ? `source=abandoned_cart: started the join checkout on the website and did not pay (Glofox lead, no marketing source); opener due ${dueAt}`
        : `source=${source}, glofox ${glofox.marketing_source ?? glofox.source ?? "lead"}${glofox.marketing_source_details ? ", heard via " + glofox.marketing_source_details : ""}`,
    });
    created++;
    createdNames.push(`${String(g.first_name ?? "?")} (${source})`);
  }

  const result = { ran_at: new Date().toISOString(), seen: fresh.length, created, attached, skipped, first_run: firstRun };
  await sb.rpc("gym_settings_merge", {
    p_gym_id: GYM_ID,
    p_patch: { glofox_leads: { watermark: newest, last_run: result.ran_at, last_result: result } },
  });
  return json({ ok: true, ...result, created_first_names: createdNames.slice(0, 20) });
}

// ---------------------------------------------------------------------------
async function routeConversions(sb: any, settings: Row, opts: { limit: number; lead_ids?: string[]; notify_engine?: boolean; force?: boolean }) {
  const hdr = await glofoxHeaders(sb); if (hdr instanceof Response) return hdr;
  const since = new Date(Date.now() - 120 * 86400_000).toISOString();
  const staleBefore = new Date(Date.now() - 20 * 60_000).toISOString();
  const notify = opts.notify_engine !== false;

  // Open leads we hold a Glofox id for: the ones named, else the ones not
  // checked for 20 minutes, never-checked first.
  let q = sb.from("leads")
    .select("id, first_name, last_name, current_stage, metadata, created_at, last_contact_at")
    .eq("gym_id", GYM_ID)
    .is("joined_at", null)
    .not("metadata->glofox->>id", "is", null)
    .not("current_stage", "in", "(joined,dead,opted_out)");
  if (opts.lead_ids?.length) q = q.in("id", opts.lead_ids.slice(0, 100));
  else {
    q = q.gte("created_at", since);
    if (!opts.force) q = q.or(`metadata->glofox->>checked_at.is.null,metadata->glofox->>checked_at.lt.${staleBefore}`);
    q = q.order("metadata->glofox->>checked_at", { ascending: true, nullsFirst: true }).limit(opts.limit);
  }
  const { data: candidates, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  let checked = 0, joined = 0, gone = 0;
  const joinedNames: string[] = [];
  for (const lead of (candidates ?? []) as Row[]) {
    const gid = String(lead.metadata?.glofox?.id ?? "");
    if (!gid) continue;
    const r = await fetch(`https://api.glofox.com/2.0/members/${gid}?branch_id=${STUDIO_ID}`, { headers: hdr });
    if (r.status === 401 || r.status === 403) return json({ ok: false, error: "Glofox session rejected", checked, joined }, 502);
    const m: Row | null = r.ok ? await r.json().catch(() => null) : null;
    checked++;
    const now = new Date().toISOString();
    const prev: Row = lead.metadata?.glofox ?? {};
    if (!m) {
      gone++;
      await sb.from("leads").update({ metadata: { ...lead.metadata, glofox: { ...prev, checked_at: now, missing: r.status } }, updated_at: now }).eq("id", lead.id);
      continue;
    }
    const ms: Row = m.membership ?? {};
    const glofox = {
      ...prev,
      lead_status: m.lead_status ?? prev.lead_status ?? null,
      status_modified: m?.leads?.status_modified?.sec ? new Date(Number(m.leads.status_modified.sec) * 1000).toISOString() : prev.status_modified ?? null,
      membership: ms?._id ? { plan_name: ms.plan_name ?? null, membership_name: ms.membership_name ?? null, type: ms.type ?? null, status: ms.status ?? null, trial: ms.trial ?? null, price: ms.plan_price ?? ms?.subscription?.price ?? null, start_date: ms.start_date ? new Date(Number(ms.start_date) * 1000).toISOString() : null } : prev.membership ?? null,
      consent: { sms: m?.consent?.sms?.active ?? prev?.consent?.sms ?? null, email: m?.consent?.email?.active ?? prev?.consent?.email ?? null },
      checked_at: now,
    };
    if (!purchased(m)) {
      await sb.from("leads").update({ metadata: { ...lead.metadata, glofox }, updated_at: now }).eq("id", lead.id);
      continue;
    }

    // Joined. The date Glofox moved them to MEMBER, else the membership start, else now.
    const joinedIso = glofox.status_modified ?? glofox.membership?.start_date ?? now;
    const joinedDate = String(joinedIso).slice(0, 10);
    const value = glofox.membership?.price != null ? Number(glofox.membership.price) : null;
    await sb.from("leads").update({
      joined_at: joinedDate, converted_at: joinedIso, glofox_member_key: gid,
      join_value_monthly: value, current_stage: "joined", closed_at: now,
      metadata: { ...lead.metadata, glofox: { ...glofox, converted_detected_at: now }, needs_first_touch: false },
      updated_at: now,
    }).eq("id", lead.id);
    await sb.from("lead_journey").insert({
      lead_id: lead.id, action: "glofox_member", stage: "joined", from_stage: lead.current_stage, channel: "glofox",
      message: `Bought ${glofox.membership?.plan_name ?? "a membership"}${value != null ? ` at £${value}/mo` : ""}, Glofox status MEMBER since ${joinedDate}`,
    });
    await sb.from("lead_reconcile").insert({
      gym_id: GYM_ID, kind: "lead_joined", lead_id: lead.id, member_key: gid,
      detail: `Glofox shows MEMBER (${glofox.membership?.plan_name ?? "?"}, ${value != null ? "£" + value + "/mo" : "?"}), detected ${now}`,
    });
    // The engine stops nurture, queues nothing further and sends the welcome
    // (which gymiq-dispatch still gates: test mode, consent, live switches).
    const eng = notify ? await tellEngine("outcome", { lead_id: lead.id, outcome: "joined", by: "glofox", plan: glofox.membership?.plan_name ?? null }) : { http: 0, skipped: true };
    joined++;
    joinedNames.push(`${lead.first_name ?? "?"} (${glofox.membership?.plan_name ?? "member"})${!notify ? "" : eng.http === 200 ? "" : ` [engine ${eng.http}]`}`);
  }

  const result = { ran_at: new Date().toISOString(), candidates: (candidates ?? []).length, checked, joined, gone };
  await sb.rpc("gym_settings_merge", { p_gym_id: GYM_ID, p_patch: { glofox_conversions: { last_run: result.ran_at, last_result: result } } });
  return json({ ok: true, ...result, joined_names: joinedNames });
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "pull";
  const sb: any = createClient(SB_URL, SB_KEY);

  const { data: gym } = await sb.from("gyms").select("id, settings").eq("id", GYM_ID).maybeSingle();
  const settings: Row = gym?.settings ?? {};

  if (route === "health") {
    const s: Row = settings.glofox_leads ?? {};
    return json({ ok: true, watermark: s.watermark ?? null, last_run: s.last_run ?? null, last_result: s.last_result ?? null, conversions: settings.glofox_conversions ?? null });
  }

  // auth: the shared job secret (same as the other pulls) or the desk key
  const presented = req.headers.get("x-sync-secret") ?? req.headers.get("x-desk-key") ?? "";
  let authed = !!DESK_KEY && presented === DESK_KEY;
  if (!authed && presented) {
    const { data: ok } = await sb.rpc("lead_desk_auth", { p_key: presented });
    authed = ok === true;
  }
  if (!authed) return json({ ok: false, error: "forbidden" }, 403);

  try {
    if (route === "pull") return await routePull(sb, settings);
    if (route === "conversions") {
      const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
      return await routeConversions(sb, settings, {
        limit: Math.min(Number(b.limit ?? url.searchParams.get("limit") ?? 40), 100),
        lead_ids: Array.isArray(b.lead_ids) ? b.lead_ids.map(String) : undefined,
        notify_engine: b.notify_engine !== false, force: b.force === true,
      });
    }
    return json({ ok: false, error: "unknown route" }, 404);
  } catch (e) {
    console.error("[glofox-leads-pull]", String(e).slice(0, 300));
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
