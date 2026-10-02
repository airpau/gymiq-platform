// lead-intake, v2.1 (2 Oct 2026)
//
// v2.1: reading a received email back needs a FULL ACCESS Resend key (a
// sending-only key gets 401). The key is RESEND_RECEIVING_KEY, else
// RESEND_API_KEY. If the fetch fails the email is still stored from the
// webhook (subject, sender) as parse_status 'fetch_failed', Paul is told on
// Telegram (@energie_hoddesdon_bot), and ?route=refetch (cron, every 5 min)
// retries until the key works. Nothing is lost while the key is wrong.
//
// v2: the real feed. hoddesdon@energiefitness.com has an inbox rule that
// redirects the TwoTaps "Free Trial Form Submission" emails to
// hoddesdon-leads@iaecheenex.resend.app (the gymIQ Resend team's receiving
// address); Resend posts email.received here. Until the webhook's signing
// secret is stored as RESEND_INBOUND_SECRET the webhook body is not trusted
// at all: the email is fetched back from Resend's API by id with our own key,
// so only mail that really reached our receiving address is processed, and a
// replayed id is a duplicate. Parser tuned to the TwoTaps format (Name,
// Gender, Date of birth, Email, Phone, Postcode, How did you hear about us?).
//
// THE TRIGGER. A free-trial request or an abandoned cart on the website
// produces a notification email into the club mailbox, hoddesdon@energiefitness.com.
// That email is the moment to act: this function turns it into a lead and asks
// the engine for the first touch within seconds of it arriving. This is the job
// GymGlitch did for the club; the Glofox lead pull is only a backstop for
// anything the mailbox misses.
//
// How the email reaches us: the mailbox redirects the notification emails to a
// Resend receiving address; Resend posts an `email.received` webhook here; we
// fetch the full message by id, store it verbatim, parse it, create or reopen
// the lead, and hand it to gymiq-lead-engine?route=first-touch.
//
// Nothing is ever dropped. An email the parser does not understand is stored
// with parse_status 'unparsed' and the team is emailed, so the rule can be
// added (gyms.settings.intake) and the email re-run with ?route=reparse.
//
// Routes
//   POST ?route=resend         Resend inbound webhook (Svix signature)
//   POST ?route=email          {from, to?, subject, text?, html?, message_id?, received_at?}  (x-desk-key)
//                              the same pipeline for a replayed or manually forwarded email
//   POST ?route=parse-test     {subject, text?, html?, from?}  parse only, writes nothing   (x-desk-key)
//   POST ?route=reparse        {id}  re-run a stored email after a rule change              (x-desk-key)
//   POST ?route=refetch        retry emails stored as fetch_failed                          (x-desk-key)
//   GET  ?route=health

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_RECEIVING_KEY") || Deno.env.get("RESEND_API_KEY") || "";   // must be full access
const INBOUND_SECRET = Deno.env.get("RESEND_INBOUND_SECRET") ?? "";   // whsec_… from the Resend webhook
const FN = Deno.env.get("PUBLIC_FN_URL") ?? `${SB_URL}/functions/v1`;
const GYM_ID = Deno.env.get("INTAKE_GYM_ID") ?? "d3a32b32-6930-4660-8c5b-9df3a90aeb11";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-desk-key", "Content-Type": "application/json" };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: CORS });
type Row = Record<string, any>;

const sb = (p: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${p}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
const many = async (r: Promise<Response>): Promise<Row[]> => { const j = await (await r).json().catch(() => []); return Array.isArray(j) ? j : []; };
const one = async (r: Promise<Response>): Promise<Row | null> => (await many(r))[0] ?? null;

async function deskAuth(k: string): Promise<boolean> {
  if (!k) return false;
  if (DESK_KEY && k === DESK_KEY) return true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/lead_desk_auth`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_key: k }) });
    return (await r.json()) === true;
  } catch { return false; }
}
let _ik = "";
async function internalKey(): Promise<string> {
  if (DESK_KEY) return DESK_KEY;
  if (_ik) return _ik;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/internal_desk_key`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: "{}" });
  _ik = String(await r.json().catch(() => "")).replace(/^"|"$/g, "");
  return _ik;
}
async function sibling(name: string, route: string, payload: Row): Promise<Row> {
  try {
    const r = await fetch(`${FN}/${name}?route=${route}`, { method: "POST", headers: { "Content-Type": "application/json", "x-desk-key": await internalKey() }, body: JSON.stringify(payload) });
    return { http: r.status, ...(await r.json().catch(() => ({}))) };
  } catch (e) { return { http: 0, error: String(e).slice(0, 200) }; }
}
async function telegram(text: string) {
  // Gym alerts only ever go through the Energie Gym Monitor bot.
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/gym_alert_telegram`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: "{}" });
    const t = await r.json();
    if (!t?.token || !t?.chat_id) return;
    await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: t.chat_id, text: text.slice(0, 3500), disable_web_page_preview: true }) });
  } catch { /* alerts are best effort */ }
}
function background(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p); else p.catch(() => {});
}

// ---- text helpers -------------------------------------------------------------
function normPhone(p?: string | null): string | null {
  if (!p) return null;
  const d = String(p).replace(/[^0-9]/g, "");
  if (!d) return null;
  if (/^447\d{9}$/.test(d)) return "+" + d;
  if (/^07\d{9}$/.test(d)) return "+44" + d.slice(1);
  if (/^7\d{9}$/.test(d)) return "+44" + d;
  if (/^0[12]\d{8,9}$/.test(d)) return "+44" + d.slice(1);   // landline, kept for the record
  if (/^44\d{9,10}$/.test(d)) return "+" + d;
  if (d.length >= 10 && d.length <= 15) return "+" + d;
  return null;
}
const isUkMobile = (e164: string | null) => !!e164 && /^\+447\d{9}$/.test(e164);

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table)\s*\/?>/gi, "\n")
    .replace(/<\s*(\/td|\/th)\s*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// An Outlook "forward" wraps the original in a header block. Prefer the inner
// subject and sender when they are there. A "redirect" leaves nothing to unwrap.
function unwrapForward(text: string, subject: string, from: string): { text: string; subject: string; from: string; forwarded: boolean } {
  const m = text.match(/(?:^|\n)\s*From:\s*(.+)\n(?:[\s\S]{0,400}?)Subject:\s*(.+)\n/i);
  if (!m) return { text, subject, from, forwarded: false };
  const innerFrom = m[1].trim(); const innerSubject = m[2].trim();
  return { text, subject: innerSubject || subject.replace(/^\s*(fwd?|fw)\s*:\s*/i, ""), from: innerFrom || from, forwarded: true };
}

const OWN_DOMAINS = /@(energiefitness\.com|glofox\.com|gymiq\.ai|resend\.app|resend\.com|gymglitch\.ai)$/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

interface Parsed {
  kind: string;                      // free_trial | abandoned_cart | other
  first_name: string | null; last_name: string | null;
  phone: string | null; email: string | null;
  fields: Record<string, string>;    // every "Label: value" pair found
  plan: string | null;               // membership named in an abandoned cart, if any
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

function classify(subject: string, text: string, from: string, rules: Row[]): string {
  const hay = `${subject}\n${text.slice(0, 4000)}`.toLowerCase();
  for (const r of rules) {
    try { if (new RegExp(String(r.match), "i").test(hay)) return String(r.kind); } catch { /* bad rule, skip */ }
  }
  if (/abandon|didn.t complete|not complete|incomplete/i.test(hay)) return "abandoned_cart";
  if (/trial|day pass|guest pass/i.test(hay)) return "free_trial";
  void from;
  return "other";
}

function parse(subject: string, rawText: string, from: string, rules: Row[]): Parsed {
  const text = rawText;
  const reasons: string[] = [];
  const fields: Record<string, string> = {};
  // Label: value pairs, one per line or table cell ("Name | Jane Smith").
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z0-9 '\/()&.?-]{1,48}?)\s*(?::|\||-)\s*(.{1,200}?)\s*$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase().replace(/\?$/, "").replace(/\s+/g, " "); const val = m[2].trim().replace(/\s*\|\s*$/, "");
    if (!val || val === "|" || /^(from|to|sent|date|cc|subject)$/.test(key)) continue;
    if (!(key in fields)) fields[key] = val;
  }
  const pick = (...names: RegExp[]) => {
    for (const re of names) for (const k of Object.keys(fields)) if (re.test(k)) return fields[k];
    return null;
  };

  // email: labelled first, then any address that is not one of ours
  let email: string | null = null;
  const lab = pick(/^e-?mail( address)?$/, /e-?mail/);
  const labMatch = lab?.match(EMAIL_RE)?.[0];
  if (labMatch && !OWN_DOMAINS.test(labMatch)) { email = labMatch.toLowerCase(); reasons.push("email:label"); }
  if (!email) {
    const all = (text.match(EMAIL_RE) ?? []).map((s) => s.toLowerCase()).filter((s) => !OWN_DOMAINS.test(s) && !/noreply|no-reply|notifications?@|mailer-daemon/.test(s));
    if (all.length) { email = all[0]; reasons.push("email:body"); }
  }

  // phone: labelled first, then the first UK mobile anywhere
  let phone: string | null = null;
  const labPhone = pick(/^(mobile|phone|telephone|tel|contact( number)?|phone number|mobile number|cell)/, /mobile|phone|tel/);
  if (labPhone) { phone = normPhone(labPhone.replace(/[^\d+]/g, "")); if (phone) reasons.push("phone:label"); }
  if (!phone) {
    const m = text.match(/(?:\+44\s?7\d{3}|\(?07\d{3}\)?)[\s.-]?\d{3}[\s.-]?\d{3}/);
    if (m) { phone = normPhone(m[0]); reasons.push("phone:body"); }
  }

  // name: labelled, then the subject ("New free trial request from Jane Smith")
  let first: string | null = null, last: string | null = null;
  const full = pick(/^(full ?name|name|customer name|contact name|lead name)$/, /^first ?name/, /name/);
  const lastLab = pick(/^(last ?name|surname|family name)$/);
  const firstLab = pick(/^first ?name$/);
  if (firstLab) { first = firstLab; last = lastLab ?? null; reasons.push("name:label"); }
  else if (full && !EMAIL_RE.test(full) && !/\d{5,}/.test(full)) {
    const parts = full.replace(/\s+/g, " ").trim().split(" ");
    first = parts[0]; last = parts.length > 1 ? parts.slice(1).join(" ") : (lastLab ?? null); reasons.push("name:label");
  }
  if (!first) {
    const bm0 = subject.match(/\[\s*([^\]]{2,60}?)\s*\]\s*$/);
    if (bm0) { const parts = bm0[1].replace(/\s+/g, " ").trim().split(" "); first = parts[0]; last = parts.length > 1 ? parts.slice(1).join(" ") : null; reasons.push("name:subject_brackets"); }
  }
  if (!first) {
    const sm = subject.match(/(?:from|for|by|:)\s+([A-Z][a-zA-Z'-]+)(?:\s+([A-Z][a-zA-Z'-]+))?\s*$/) ?? subject.match(/^([A-Z][a-zA-Z'-]+)\s+([A-Z][a-zA-Z'-]+)\s+(?:has|is|wants|requested|started)/);
    if (sm) { first = sm[1]; last = sm[2] ?? null; reasons.push("name:subject"); }
  }
  if (!first) {
    // "Tom Brown started to purchase a membership but did not complete…"
    const bm = text.match(/(?:^|\n)\s*([A-Z][a-z'-]+)\s+([A-Z][a-z'-]+)\s+(?:has |have )?(?:started|requested|submitted|enquired|signed|booked|left|abandoned|began|wants|would like|is interested)/);
    if (bm) { first = bm[1]; last = bm[2]; reasons.push("name:sentence"); }
  }
  if (first) { first = first.replace(/[^A-Za-z'\- ]/g, "").trim().slice(0, 60) || null; }
  if (last) { last = last.replace(/[^A-Za-z'\- ]/g, "").trim().slice(0, 80) || null; }

  const kind = classify(subject, text, from, rules);
  const plan = pick(/^(membership|plan|product|package|tariff)/) ?? (text.match(/\b(classic|wow|epic)\b(?:\s*membership)?/i)?.[0] ?? null);

  const confidence: Parsed["confidence"] = (phone || email) && first && kind !== "other" ? "high" : (phone || email) ? "medium" : "low";
  return { kind, first_name: first, last_name: last, phone, email, fields, plan, confidence, reasons };
}

// ---- the pipeline -----------------------------------------------------------------
interface Incoming { provider: string; provider_email_id?: string | null; message_id?: string | null; from: string; to: string[]; subject: string; text?: string | null; html?: string | null; received_at?: string | null }

async function ingest(inc: Incoming): Promise<Row> {
  const gym = await one(sb(`gyms?id=eq.${GYM_ID}&select=id,name,settings`));
  const cfg: Row = gym?.settings?.intake ?? {};
  const rules: Row[] = Array.isArray(cfg.rules) ? cfg.rules : [];
  const senders: string[] = Array.isArray(cfg.senders) ? cfg.senders.map((s: string) => String(s).toLowerCase()) : [];

  // Store first, whatever happens next. Duplicate = Resend retry or a second forward of the same email.
  const text0 = (inc.text && inc.text.trim()) ? inc.text : htmlToText(inc.html ?? "");
  const un = unwrapForward(text0, inc.subject ?? "", inc.from ?? "");
  const ins = await sb("lead_intake_emails", { method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify({
    gym_id: GYM_ID, provider: inc.provider, provider_email_id: inc.provider_email_id ?? null, message_id: inc.message_id ?? null,
    from_addr: inc.from ?? null, to_addr: inc.to ?? [], subject: inc.subject ?? null, received_at: inc.received_at ?? new Date().toISOString(),
    text_body: text0.slice(0, 60000), html_body: (inc.html ?? "").slice(0, 120000), parse_status: "pending",
  }) });
  const stored = (await ins.json().catch(() => []))?.[0];
  if (!stored) return { ok: true, duplicate: true };

  const senderOk = senders.length === 0 || senders.some((s) => un.from.toLowerCase().includes(s) || String(inc.from ?? "").toLowerCase().includes(s));
  const parsed = parse(un.subject, un.text, un.from, rules);
  const finish = (patch: Row) => sb(`lead_intake_emails?id=eq.${stored.id}`, { method: "PATCH", body: JSON.stringify(patch) });

  if (!senderOk) { await finish({ parse_status: "ignored", kind: parsed.kind, parsed, error: "sender not in intake.senders" }); return { ok: true, id: stored.id, ignored: "sender" }; }
  if (parsed.kind === "other" || (!parsed.phone && !parsed.email)) {
    await finish({ parse_status: "unparsed", kind: parsed.kind, parsed });
    if (cfg.notify_unparsed !== false && gym?.settings?.alert_email) {
      background(sibling("gymiq-messaging", "email", { internal: true, to: gym.settings.alert_email, subject: `gymIQ could not read a notification email: ${un.subject.slice(0, 80)}`, text: `From: ${un.from}\nSubject: ${un.subject}\n\nNo lead was created. Stored as lead_intake_emails ${stored.id}. Paul or Claude adds a rule and re-runs it.\n\n${un.text.slice(0, 1500)}` }));
    }
    return { ok: true, id: stored.id, unparsed: true, parsed };
  }

  // Existing lead? Same mobile first, then email. A recent, still-open lead is
  // reused (they clicked twice); anyone older or closed gets a fresh lead and the
  // engine inherits their memory. This is Paul's rule: a new request is a new
  // permission to contact, whatever happened before.
  const reDays = Number(cfg.reenquiry_days ?? 30);
  let existing: Row | null = null;
  if (parsed.phone) existing = await one(sb(`leads?gym_id=eq.${GYM_ID}&phone_e164=eq.${encodeURIComponent(parsed.phone)}&order=created_at.desc&limit=1&select=id,current_stage,created_at,first_touch_at,metadata,first_name`));
  if (!existing && parsed.email) existing = await one(sb(`leads?gym_id=eq.${GYM_ID}&email=eq.${encodeURIComponent(parsed.email)}&order=created_at.desc&limit=1&select=id,current_stage,created_at,first_touch_at,metadata,first_name`));
  const openStages = ["new", "contacted", "replied", "booked", "handover"];
  const recent = existing && (Date.now() - new Date(existing.created_at).getTime()) < reDays * 86400_000;
  const reuse = !!existing && recent && openStages.includes(String(existing.current_stage));

  const f = parsed.fields;
  const intakeMeta = {
    kind: parsed.kind, email_id: stored.id, subject: un.subject, from: un.from, received_at: inc.received_at ?? new Date().toISOString(),
    form: /location free trial/i.test(un.subject + un.text) ? "location_free_trial" : /free trial/i.test(un.subject) ? "free_trial" : null,
    heard_about: f["how did you hear about us"] ?? f["how did you hear about us?"] ?? null,
    postcode: f["postcode"] ?? null, gender: f["gender"] ?? null, birth: f["date of birth"] ?? null,
    plan: parsed.plan, fields: parsed.fields, forwarded: un.forwarded,
  };
  let leadId: string; let created = false;
  if (reuse) {
    leadId = String(existing!.id);
    await sb(`leads?id=eq.${leadId}`, { method: "PATCH", body: JSON.stringify({ metadata: { ...(existing!.metadata ?? {}), intake_last: intakeMeta }, updated_at: new Date().toISOString() }) });
    await sb("lead_journey", { method: "POST", body: JSON.stringify({ lead_id: leadId, action: "enquired_again", stage: existing!.current_stage, from_stage: null, channel: "email_notification", message: `${parsed.kind} again: ${un.subject.slice(0, 200)}` }) });
  } else {
    const cfgDesk = await one(sb(`lead_desk_config?gym_id=eq.${GYM_ID}&select=first_touch_minutes,default_owner`));
    const lead = await one(sb("leads", { method: "POST", body: JSON.stringify({
      gym_id: GYM_ID, first_name: parsed.first_name ?? "there", last_name: parsed.last_name,
      phone: parsed.phone, phone_e164: parsed.phone, email: parsed.email,
      source: parsed.kind, stage: "lead", current_stage: "new", score: parsed.kind === "abandoned_cart" ? 70 : 50,
      owner: cfgDesk?.default_owner ?? null,
      due_at: new Date(Date.now() + Number(cfgDesk?.first_touch_minutes ?? 15) * 60_000).toISOString(),
      external_system: "email_notification", imported_from: "mailbox",
      metadata: { intake: intakeMeta, needs_first_touch: true, returning: !!existing, previous_lead_id: existing?.id ?? null },
    }) }));
    if (!lead) { await finish({ parse_status: "error", kind: parsed.kind, parsed, error: "lead insert failed" }); return { ok: false, id: stored.id, error: "lead insert failed" }; }
    leadId = String(lead.id); created = true;
    await sb("lead_journey", { method: "POST", body: JSON.stringify({ lead_id: leadId, action: "captured", stage: "new", from_stage: null, channel: "email_notification", message: `source=${parsed.kind}, from the club mailbox: ${un.subject.slice(0, 160)}${existing ? " (returning lead)" : ""}` }) });
  }
  await finish({ parse_status: "parsed", kind: parsed.kind, parsed, lead_id: leadId, lead_created: created });

  // The first touch, now, not at the next cron tick. Idempotent in the engine
  // (already-touched leads are skipped), and the cron sweep is the safety net.
  // due_at stays the human desk's call-back deadline; a free trial is answered
  // now (force), an abandoned cart waits for the engine's due-time sweep.
  if (created) background(sibling("gymiq-lead-engine", "first-touch", { lead_id: leadId, force: parsed.kind === "free_trial" }));
  return { ok: true, id: stored.id, lead_id: leadId, lead_created: created, reused: reuse, kind: parsed.kind, confidence: parsed.confidence };
}

// ---- Resend inbound ----------------------------------------------------------------
async function svixValid(raw: string, h: Headers): Promise<boolean> {
  if (!INBOUND_SECRET) return false;
  const id = h.get("svix-id") ?? "", ts = h.get("svix-timestamp") ?? "", sigs = h.get("svix-signature") ?? "";
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const secret = Uint8Array.from(atob(INBOUND_SECRET.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sigs.split(" ").some((s) => { const [v, sig] = s.split(","); return v === "v1" && sig === expected; });
}

async function routeResend(req: Request, raw: string) {
  // With the signing secret stored, a bad signature is refused outright. Without
  // it, nothing in the body is trusted: the email is re-fetched from Resend by id
  // with our own API key below, which only succeeds for mail our account received.
  if (INBOUND_SECRET && !(await svixValid(raw, req.headers))) return J({ ok: false, error: "bad signature" }, 401);
  const ev = JSON.parse(raw);
  if (ev.type !== "email.received") return J({ ok: true, ignored: ev.type });
  const id = String(ev.data?.email_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return J({ ok: false, error: "no email_id" }, 400);
  const f = await fetchReceived(id);
  if (f.status === 404) return J({ ok: false, error: "unknown email id" }, 404);
  if (!f.m) {
    // Keep it anyway, from what the webhook told us, and retry later. A
    // forged webhook can only ever create a fetch_failed row: no lead and no
    // message comes from it until Resend itself returns the email.
    const d: Row = ev.data ?? {};
    // One Telegram alert an hour at most, however many arrive.
    const recentFail = await one(sb(`lead_intake_emails?gym_id=eq.${GYM_ID}&parse_status=eq.fetch_failed&created_at=gte.${new Date(Date.now() - 3600_000).toISOString()}&limit=1&select=id`));
    const ins = await sb("lead_intake_emails", { method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" }, body: JSON.stringify({
      gym_id: GYM_ID, provider: "resend", provider_email_id: id, message_id: null,
      from_addr: String(d.from ?? "").slice(0, 300) || null, to_addr: Array.isArray(d.to) ? d.to.map(String).slice(0, 10) : [],
      subject: String(d.subject ?? "").slice(0, 300) || null, received_at: ev.created_at ?? new Date().toISOString(),
      parse_status: "fetch_failed", error: `resend fetch ${f.status}`,
    }) });
    const stored = (await ins.json().catch(() => []))?.[0];
    if (stored && !recentFail) background(telegram(`gymIQ lead intake: a club mailbox email arrived but could not be read back from Resend (HTTP ${f.status}${f.status === 401 ? ", the Resend key needs full access" : ""}).\nSubject: ${String(d.subject ?? "?").slice(0, 160)}\nIt is stored and will be retried every 5 minutes. The Glofox backstop also picks up free trials within about 5 minutes.`));
    return J({ ok: true, stored: stored?.id ?? null, fetch_failed: f.status });
  }
  return J(await ingestResend(id, f.m, ev));
}

async function fetchReceived(id: string): Promise<{ status: number; m: Row | null }> {
  if (!RESEND_KEY) return { status: 503, m: null };
  try {
    const r = await fetch(`https://api.resend.com/emails/receiving/${id}`, { headers: { Authorization: `Bearer ${RESEND_KEY}` } });
    if (!r.ok) return { status: r.status, m: null };
    return { status: r.status, m: await r.json() };
  } catch { return { status: 0, m: null }; }
}

function ingestResend(id: string, m: Row, ev: Row = {}) {
  return ingest({ provider: "resend", provider_email_id: id, message_id: m.message_id ?? ev.data?.message_id ?? null, from: String(m.from ?? ev.data?.from ?? ""), to: (m.to ?? ev.data?.to ?? []) as string[], subject: String(m.subject ?? ev.data?.subject ?? ""), text: m.text ?? null, html: m.html ?? null, received_at: m.created_at ?? ev.created_at ?? null });
}

// Retry every email whose body could not be fetched, oldest first.
async function routeRefetch() {
  const rows = await many(sb(`lead_intake_emails?gym_id=eq.${GYM_ID}&parse_status=eq.fetch_failed&provider=eq.resend&order=received_at.asc&limit=20&select=id,provider_email_id,received_at`));
  const out: Row[] = [];
  for (const e of rows) {
    const f = await fetchReceived(String(e.provider_email_id));
    if (!f.m) {
      if (f.status === 404) await sb(`lead_intake_emails?id=eq.${e.id}`, { method: "PATCH", body: JSON.stringify({ parse_status: "error", error: "resend 404 on refetch" }) });
      out.push({ id: e.id, status: f.status });
      if (f.status === 401 || f.status === 403 || f.status === 503) break;   // the key, not the email
      continue;
    }
    await sb(`lead_intake_emails?id=eq.${e.id}`, { method: "DELETE" });
    out.push({ id: e.id, ...(await ingestResend(String(e.provider_email_id), f.m, { created_at: e.received_at })) });
  }
  return { ok: true, pending: rows.length, results: out };
}

async function routeHealth() {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const rows = await many(sb(`lead_intake_emails?gym_id=eq.${GYM_ID}&received_at=gte.${since}&select=parse_status,kind,received_at&order=received_at.desc&limit=500`));
  const by: Record<string, number> = {};
  for (const r of rows) by[`${r.parse_status}/${r.kind ?? "?"}`] = (by[`${r.parse_status}/${r.kind ?? "?"}`] ?? 0) + 1;
  return J({ ok: true, webhook: `${FN}/lead-intake?route=resend`, inbound_secret_set: !!INBOUND_SECRET, resend_key_set: !!RESEND_KEY, receiving_key_set: !!Deno.env.get("RESEND_RECEIVING_KEY"), last_7_days: rows.length, by_status: by, last_received: rows[0]?.received_at ?? null });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url); const route = url.searchParams.get("route") ?? "";
  try {
    if (route === "health") return await routeHealth();
    if (req.method === "POST" && route === "resend") return await routeResend(req, await req.text());
    if (!(await deskAuth(req.headers.get("x-desk-key") ?? ""))) return J({ ok: false, error: "forbidden" }, 403);
    if (req.method !== "POST") return J({ ok: false, error: "unknown route" }, 404);
    const b = await req.json().catch(() => ({}));
    if (route === "email") return J(await ingest({ provider: String(b.provider ?? "manual"), provider_email_id: b.provider_email_id ?? null, message_id: b.message_id ?? null, from: String(b.from ?? ""), to: Array.isArray(b.to) ? b.to : (b.to ? [String(b.to)] : []), subject: String(b.subject ?? ""), text: b.text ?? null, html: b.html ?? null, received_at: b.received_at ?? null }));
    if (route === "refetch") return J(await routeRefetch());
    if (route === "parse-test") {
      const gym = await one(sb(`gyms?id=eq.${GYM_ID}&select=settings`));
      const text0 = (b.text && String(b.text).trim()) ? String(b.text) : htmlToText(String(b.html ?? ""));
      const un = unwrapForward(text0, String(b.subject ?? ""), String(b.from ?? ""));
      return J({ ok: true, unwrapped: { subject: un.subject, from: un.from, forwarded: un.forwarded }, parsed: parse(un.subject, un.text, un.from, gym?.settings?.intake?.rules ?? []), text: un.text.slice(0, 1500) });
    }
    if (route === "reparse") {
      const e = await one(sb(`lead_intake_emails?id=eq.${b.id}&select=*`));
      if (!e) return J({ ok: false, error: "unknown id" }, 404);
      if (e.lead_id) return J({ ok: true, already: e.lead_id });
      await sb(`lead_intake_emails?id=eq.${e.id}`, { method: "DELETE" });
      return J(await ingest({ provider: e.provider, provider_email_id: e.provider_email_id, message_id: e.message_id, from: e.from_addr ?? "", to: e.to_addr ?? [], subject: e.subject ?? "", text: e.text_body, html: e.html_body, received_at: e.received_at }));
    }
    return J({ ok: false, error: "unknown route" }, 404);
  } catch (e) {
    console.error(e);
    return J({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
