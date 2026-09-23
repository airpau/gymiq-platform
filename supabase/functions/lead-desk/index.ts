// gymIQ Lead Desk, v4 (16 Sep 2026)
//
// The in-house replacement for the GymGlitch lead layer.
//
// Design principle, set by Paul: GymGlitch automated the CONVERSATION and let
// Glofox go stale. The Lead Desk automates the ACCOUNTABILITY and leaves the
// conversation with the staff. Every lead has an owner, a due time and a
// required outcome; every outcome is reconciled against Glofox overnight; and
// anything that does not reconcile is escalated rather than quietly lost.
//
// v4 fix (16 Sep 2026): the email lookup in findExisting used `ilike`, so an
// underscore in an address acted as a single-character wildcard and matched a
// different person's address. It is now an exact match.
//
// v3 fix (14 Sep 2026): the exact-name dedupe fallback in findExisting used to
// fire even when a phone or email was present, which merged distinct people who
// happen to share a name (five different Jack Davises became one). It now only
// falls back to name matching when there is NO phone AND NO email to match on.
//
// Routes
//   POST ?route=capture    one lead in (website form, walk-in, phone, manual)
//   POST ?route=import     bulk in (the GymGlitch export, or any CSV/JSON list)
//   GET  ?route=desk       the prioritised call list
//   POST ?route=log        log a call outcome
//   GET  ?route=digest     the daily desk digest (text + numbers)
//   POST ?route=pull-meta  pull Meta lead-ads leads (needs meta_tokens token)
//
// Auth: x-desk-key on every route except capture, which is public so a website
// form can post to it directly but is rate-limited by dedupe.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";
const GYM_ID = "d3a32b32-6930-4660-8c5b-9df3a90aeb11";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-desk-key",
  "Content-Type": "application/json",
};
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: CORS });
type Row = Record<string, any>;

const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
const many = async (r: Promise<Response>): Promise<Row[]> => {
  const j = await (await r).json(); return Array.isArray(j) ? j : [];
};
const one = async (r: Promise<Response>): Promise<Row | null> => {
  const a = await many(r); return a[0] ?? null;
};
const rpc = async (fn: string, args: Row) => {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return await r.json();
};

// Auth. The presented header is checked INSIDE the database against the same
// shared secret the existing gymIQ cron jobs use, so there is one secret to
// rotate and it never travels to, or sits in, this function.
async function deskAuth(presented: string): Promise<boolean> {
  if (!presented) return false;
  if (DESK_KEY && presented === DESK_KEY) return true;
  try {
    const ok = await rpc("lead_desk_auth", { p_key: presented });
    return ok === true;
  } catch { return false; }
}

// ---- helpers ---------------------------------------------------------------
function normPhone(p?: string | null): string | null {
  if (!p) return null;
  const d = String(p).replace(/[^0-9]/g, "");
  if (!d) return null;
  if (/^447\d{9}$/.test(d)) return "+" + d;
  if (/^07\d{9}$/.test(d)) return "+44" + d.slice(1);
  if (/^7\d{9}$/.test(d)) return "+44" + d;
  if (/^0\d{10}$/.test(d)) return "+44" + d.slice(1);
  return "+" + d;
}
const splitName = (full?: string | null, first?: string | null, last?: string | null) => {
  if (first || last) return { first: (first ?? "").trim() || null, last: (last ?? "").trim() || null };
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") || null };
};
const SOURCES = ["meta", "google", "website", "walk_in", "phone", "referral",
  "free_trial", "abandoned_cart", "gymglitch_import", "other"];

async function cfg(): Promise<Row> {
  return (await one(sb(`lead_desk_config?gym_id=eq.${GYM_ID}&select=*`))) ?? { first_touch_minutes: 15 };
}

// Find an existing lead by phone, then email, then exact name. Never create a
// duplicate: a duplicate lead is how a member ends up called twice and logged
// nowhere. BUT the exact-name fallback only runs when there is nothing better
// to match on, otherwise two different people with the same name get merged.
async function findExisting(phone: string | null, email: string | null,
                            first: string | null, last: string | null): Promise<Row | null> {
  if (phone) {
    const hit = await one(sb(`leads?gym_id=eq.${GYM_ID}&phone_e164=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=1&select=*`));
    if (hit) return hit;
  }
  if (email) {
    // NB: exact match, not ilike. PostgREST passes `_` and `%` through to SQL
    // LIKE, so an address such as jason_yeend@gmail.com was matching
    // jason.yeend@gmail.com and silently merging two people. Emails are
    // lowercased on write, so eq is both correct and case-safe.
    const hit = await one(sb(`leads?gym_id=eq.${GYM_ID}&email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1&select=*`));
    if (hit) return hit;
  }
  // Exact-name match is a LAST resort, only when we have no phone and no email.
  // With a phone or email present, two rows sharing a name are two people.
  if (!phone && !email && first && last) {
    const hit = await one(sb(`leads?gym_id=eq.${GYM_ID}&first_name=ilike.${encodeURIComponent(first)}&last_name=ilike.${encodeURIComponent(last)}&order=created_at.desc&limit=1&select=*`));
    if (hit) return hit;
  }
  return null;
}

async function upsertLead(b: Row, opts: { source?: string; imported_from?: string } = {}) {
  const { first, last } = splitName(b.name ?? b.full_name, b.first_name, b.last_name);
  const phone = normPhone(b.phone ?? b.phone_number ?? b.mobile);
  const email = (b.email ?? "").toString().trim().toLowerCase() || null;
  if (!phone && !email && !(first && last)) return { skipped: "no identifier" };

  const source = SOURCES.includes(String(b.source)) ? String(b.source) : (opts.source ?? "other");
  const existing = await findExisting(phone, email, first, last);

  const payload: Row = {
    gym_id: GYM_ID, first_name: first, last_name: last, phone, email,
    source, platform: b.platform ?? null,
    campaign_id: b.campaign_id ?? null, campaign_name: b.campaign_name ?? null,
    adset_name: b.adset_name ?? null,
    external_id: b.external_id ?? null, external_system: b.external_system ?? null,
    imported_from: opts.imported_from ?? b.imported_from ?? null,
    consent_marketing: typeof b.consent_marketing === "boolean" ? b.consent_marketing : null,
    notes: b.notes ?? b.message ?? null,
    metadata: { ...(b.metadata ?? {}), raw: b.raw ?? undefined },
  };

  if (existing) {
    // keep the earliest created_at, enrich blanks only, never overwrite a human's work
    const patch: Row = { updated_at: new Date().toISOString() };
    for (const k of ["last_name", "email", "phone", "campaign_id", "campaign_name",
                     "adset_name", "platform", "external_id", "external_system"]) {
      if (!existing[k] && payload[k]) patch[k] = payload[k];
    }
    if (Object.keys(patch).length > 1) {
      await sb(`leads?id=eq.${existing.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    }
    return { lead_id: existing.id, duplicate: true };
  }

  const c = await cfg();
  payload.current_stage = "new";
  payload.stage = "lead";
  payload.due_at = new Date(Date.now() + Number(c.first_touch_minutes ?? 15) * 60_000).toISOString();
  payload.owner = c.default_owner ?? null;
  if (b.created_at) payload.created_at = b.created_at;

  const lead = await one(sb("leads", { method: "POST", body: JSON.stringify(payload) }));
  if (lead) {
    await sb("lead_journey", {
      method: "POST",
      body: JSON.stringify({
        lead_id: lead.id, action: "captured", stage: "new", from_stage: null,
        channel: source, message: `source=${source}${payload.campaign_name ? ", campaign=" + payload.campaign_name : ""}`,
      }),
    });
  }
  return { lead_id: lead?.id, duplicate: false };
}

// ---- routes ----------------------------------------------------------------
async function routeCapture(b: Row) {
  const r = await upsertLead(b, { source: b.source ?? "website" });
  return J({ ok: true, ...r });
}

async function routeImport(b: Row) {
  const rows: Row[] = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return J({ ok: false, error: "rows[] required" }, 400);
  let created = 0, dupes = 0, skipped = 0;
  for (const row of rows) {
    const r = await upsertLead(row, {
      source: b.source ?? "gymglitch_import",
      imported_from: b.imported_from ?? "gymglitch",
    });
    if ((r as Row).skipped) skipped++;
    else if ((r as Row).duplicate) dupes++;
    else created++;
  }
  return J({ ok: true, received: rows.length, created, duplicates: dupes, skipped });
}

async function routeDesk(url: URL) {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const owner = url.searchParams.get("owner");
  const q = `v_lead_desk?gym_id=eq.${GYM_ID}` +
    (owner ? `&owner=eq.${encodeURIComponent(owner)}` : "") +
    `&order=priority.asc,created_at.asc&limit=${limit}&select=*`;
  const list = await many(sb(q));
  const outcomes = await many(sb("lead_outcomes?order=sort.asc&select=code,label"));
  return J({ ok: true, count: list.length, outcomes, leads: list });
}

async function routeLog(b: Row) {
  if (!b.lead_id || !b.outcome) return J({ ok: false, error: "lead_id and outcome required" }, 400);
  const out = await rpc("lead_log_call", {
    p_lead: b.lead_id, p_outcome: b.outcome, p_staff: b.staff ?? null,
    p_notes: b.notes ?? null, p_channel: b.channel ?? "call",
    p_next_action: b.next_action ?? null, p_next_due: b.next_due_at ?? null,
  });
  if (out?.message) return J({ ok: false, error: out.message }, 400);
  return J({ ok: true, lead: out });
}

async function routeDigest() {
  const desk = await many(sb(`v_lead_desk?gym_id=eq.${GYM_ID}&select=*&order=priority.asc&limit=500`));
  const sla = await many(sb(`v_lead_sla?gym_id=eq.${GYM_ID}&order=day.desc&limit=7&select=*`));
  const open = await many(sb(`v_lead_reconcile_open?gym_id=eq.${GYM_ID}&select=*&limit=200`));
  const since = new Date(Date.now() - 86400_000).toISOString();
  const calls = await many(sb(`lead_calls?gym_id=eq.${GYM_ID}&called_at=gte.${since}&select=outcome,staff`));

  const byOutcome: Record<string, number> = {};
  for (const c of calls) byOutcome[String(c.outcome)] = (byOutcome[String(c.outcome)] ?? 0) + 1;
  const kind = (k: string) => open.filter((o) => o.kind === k).length;
  const today = sla[0] ?? {};

  const lines: string[] = [];
  lines.push("LEAD DESK");
  lines.push(`Open leads ${desk.length}, of which ${desk.filter((d) => d.priority === 1).length} past the first-touch SLA and ${desk.filter((d) => d.priority === 2).length} due a call back now.`);
  lines.push(`Yesterday: ${today.leads_in ?? 0} in, ${today.touched_in_sla ?? 0} touched inside SLA (${today.pct_in_sla ?? 0}%), median ${today.median_minutes ?? "-"} min.`);
  if (calls.length) {
    lines.push("Calls logged 24h: " + Object.entries(byOutcome).map(([k, v]) => `${k} ${v}`).join(", "));
  } else {
    lines.push("Calls logged 24h: none. If the team called anyone, it is not on the record.");
  }
  lines.push("");
  lines.push("GLOFOX RECONCILIATION");
  lines.push(`Joins with no lead behind them: ${kind("member_without_lead")}`);
  lines.push(`Marked joined but not in Glofox: ${kind("claimed_not_in_glofox")}`);
  lines.push(`Leads untouched 7 days+: ${kind("stale_lead")}`);

  const top = desk.slice(0, 10).map((d) =>
    `${d.name || "(no name)"} · ${d.source} · ${d.age_minutes}m old · ${d.call_attempts} attempts · ${d.owner ?? "unowned"}`);
  if (top.length) { lines.push(""); lines.push("NEXT TEN CALLS"); lines.push(...top); }

  return J({
    ok: true,
    text: lines.join("\n"),
    numbers: {
      open: desk.length,
      sla_breached: desk.filter((d) => d.priority === 1).length,
      due_now: desk.filter((d) => d.priority === 2).length,
      calls_24h: calls.length,
      member_without_lead: kind("member_without_lead"),
      claimed_not_in_glofox: kind("claimed_not_in_glofox"),
      stale: kind("stale_lead"),
      sla_7d: sla,
    },
  });
}

// Meta lead ads. Dormant until meta_tokens.access_token is set.
async function routePullMeta(b: Row) {
  const tok = await one(sb("meta_tokens?account_key=eq.ef-hoddesdon&select=access_token,page_id,ad_account_id"));
  if (!tok || !tok.access_token || tok.access_token === "PENDING") {
    return J({ ok: false, error: "meta token not set, paste the system user token into meta_tokens first" }, 412);
  }
  const pageId = b.page_id ?? tok.page_id;
  if (!pageId) return J({ ok: false, error: "page_id not set on meta_tokens" }, 412);
  const v = "v23.0";
  const since = b.since ?? new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

  const formsRes = await fetch(`https://graph.facebook.com/${v}/${pageId}/leadgen_forms?limit=100&access_token=${tok.access_token}`);
  const forms = await formsRes.json();
  if (forms.error) return J({ ok: false, error: forms.error.message }, 502);

  let created = 0, dupes = 0, seen = 0;
  for (const f of forms.data ?? []) {
    const url = `https://graph.facebook.com/${v}/${f.id}/leads?limit=200` +
      `&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":"${since}"}]` +
      `&access_token=${tok.access_token}`;
    const lr = await (await fetch(url)).json();
    for (const l of lr.data ?? []) {
      seen++;
      const fields: Row = {};
      for (const fd of l.field_data ?? []) fields[fd.name] = (fd.values ?? [])[0];
      const r = await upsertLead({
        first_name: fields.first_name, last_name: fields.last_name,
        name: fields.full_name, email: fields.email,
        phone: fields.phone_number, source: "meta", platform: l.platform ?? "facebook",
        campaign_id: l.campaign_id, campaign_name: l.campaign_name, adset_name: l.adset_name,
        external_id: l.id, external_system: "meta_leadgen",
        created_at: l.created_time, consent_marketing: true,
        metadata: { form_id: f.id, form_name: f.name },
      }, { source: "meta", imported_from: "meta_leadgen" });
      if ((r as Row).duplicate) dupes++; else if ((r as Row).lead_id) created++;
    }
  }
  return J({ ok: true, forms: (forms.data ?? []).length, seen, created, duplicates: dupes });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  try {
    if (req.method === "POST" && route === "capture") return await routeCapture(await req.json().catch(() => ({})));
    const presented = req.headers.get("x-desk-key") ?? req.headers.get("x-sync-secret") ?? "";
    if (!(await deskAuth(presented))) return J({ ok: false, error: "forbidden" }, 403);
    if (req.method === "GET" && route === "desk") return await routeDesk(url);
    if (req.method === "GET" && route === "digest") return await routeDigest();
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (route === "import") return await routeImport(b);
      if (route === "log") return await routeLog(b);
      if (route === "pull-meta") return await routePullMeta(b);
      if (route === "digest") return await routeDigest();
    }
    return J({ ok: false, error: "unknown route" }, 404);
  } catch (e) {
    console.error(e);
    return J({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
