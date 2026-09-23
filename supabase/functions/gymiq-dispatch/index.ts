// gymiq-dispatch, v2 (23 Sep 2026)
//
// The ONE door every message to a lead leaves through. The lead engine decides
// what to say; this decides whether it may be said, and by which channel.
//
// CHANNEL ORDER, per Paul: WhatsApp first, SMS if that cannot go, email last.
//   WhatsApp free-form   only inside Meta's 24h window after the lead's last reply
//   WhatsApp template    for a first touch when the window is shut (fixed wording)
//   SMS                  the composed text, verbatim, when WhatsApp cannot carry it
//   email                the composed text, when there is no mobile or SMS fails
// The channel that actually worked is written to leads.last_contact_channel and
// used as the default for the rest of the conversation.
//
// v2 adds the second half of "if WhatsApp fails, back up with SMS and email":
// a send Twilio ACCEPTS can still fail minutes later (the person is not on
// WhatsApp, the number is dead, the window shut). gymiq-messaging receives that
// status callback and calls ?route=fallback here, which re-sends the same words
// down the rest of the channel order, once per failed SID. A number Meta says is
// not a WhatsApp user is remembered on the lead (metadata.whatsapp_unreachable)
// so WhatsApp is not tried again for them.
//
// GATES, all must pass or the message is logged as suppressed and nothing leaves:
//   1. MESSAGING_LIVE=true                   env var, Paul sets it
//   2. gyms.messaging_enabled=true           per gym
//   3. lead is not opted out                 consent model
//   4. TEST MODE: while gyms.settings.messaging.test_mode is true, only a lead
//      whose mobile or email is in settings.messaging.test_identities may be
//      messaged. Everything else is captured, answered in the database, and
//      suppressed. This is how gymIQ runs alongside GymGlitch until 31 Oct.
//
// Routes (x-desk-key)
//   POST ?route=send        {lead_id, body, purpose, template?, variables?, subject?, exclude?[]}
//   POST ?route=fallback    {twilio_sid, failed_channel, error_code}  re-send down the order
//   POST ?route=followups   drain lead_followups rows in status 'ready'
//   POST ?route=notify-team {lead_id, event, detail}  email + SMS to the team
//   GET  ?route=gates&lead_id=   what would happen, without sending

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";
const MESSAGING_LIVE = (Deno.env.get("MESSAGING_LIVE") ?? "").toLowerCase() === "true";
const FN = Deno.env.get("PUBLIC_FN_URL") ?? `${SB_URL}/functions/v1`;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-desk-key", "Content-Type": "application/json" };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: CORS });
type Row = Record<string, any>;

const sb = (p: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${p}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } });
const many = async (r: Promise<Response>): Promise<Row[]> => { const j = await (await r).json(); return Array.isArray(j) ? j : []; };
const one = async (r: Promise<Response>): Promise<Row | null> => (await many(r))[0] ?? null;

async function deskAuth(k: string): Promise<boolean> {
  if (!k) return false;
  if (DESK_KEY && k === DESK_KEY) return true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/lead_desk_auth`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_key: k }) });
    return (await r.json()) === true;
  } catch { return false; }
}

// Calls to sibling functions carry the same desk key the caller presented.
let PRESENTED_KEY = "";
async function fn(name: string, route: string, body?: Row, method = "POST"): Promise<Row> {
  const r = await fetch(`${FN}/${name}?route=${route}${method === "GET" && body ? "&" + new URLSearchParams(body as Record<string, string>).toString() : ""}`, {
    method, headers: { "Content-Type": "application/json", "x-desk-key": PRESENTED_KEY },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { http: r.status, ...j };
}

function normPhone(p?: string | null): string | null {
  if (!p) return null;
  const d = String(p).replace(/[^0-9]/g, "");
  if (!d) return null;
  if (/^447\d{9}$/.test(d)) return "+" + d;
  if (/^07\d{9}$/.test(d)) return "+44" + d.slice(1);
  if (/^7\d{9}$/.test(d)) return "+44" + d;
  return "+" + d;
}

const CANONICAL = ["whatsapp", "sms", "email"];
// Twilio/Meta codes that mean "this number will never take WhatsApp".
const WA_UNREACHABLE_CODES = new Set(["63003", "63024", "63032"]);

// ---- gates -----------------------------------------------------------------
interface Gate { allowed: boolean; reasons: string[]; test_mode: boolean; is_test_identity: boolean }
async function gates(gym: Row, lead: Row): Promise<Gate> {
  const reasons: string[] = [];
  const msg: Row = gym?.settings?.messaging ?? {};
  const testMode = msg.test_mode === true;
  const ids: string[] = (msg.test_identities ?? []).map((s: string) => String(s).trim().toLowerCase());
  const phone = normPhone(lead.phone_e164 ?? lead.phone);
  const email = String(lead.email ?? "").toLowerCase();
  const isTest = ids.length > 0 && ((phone && ids.includes(phone.toLowerCase())) || (email && ids.includes(email)));

  if (!MESSAGING_LIVE) reasons.push("MESSAGING_LIVE is not set");
  if (gym?.messaging_enabled !== true) reasons.push(`messaging_enabled is false for ${gym?.name ?? "gym"}`);
  if (lead.consent_marketing === false || lead.current_stage === "opted_out") reasons.push("lead has opted out");
  if (lead.metadata?.is_test === true && !isTest) reasons.push("lead is flagged is_test but is not a configured test identity");
  if (testMode && !isTest) reasons.push("TEST MODE: only configured test identities may be messaged until 31 October");
  return { allowed: reasons.length === 0, reasons, test_mode: testMode, is_test_identity: !!isTest };
}

// ---- conversation + log ----------------------------------------------------
async function conversationFor(gymId: string, leadId: string, channel: string, address: string): Promise<Row | null> {
  const hit = await one(sb(`conversations?gym_id=eq.${gymId}&lead_id=eq.${leadId}&channel=eq.${channel}&status=neq.archived&order=last_message_at.desc&limit=1&select=id`));
  if (hit) return hit;
  return await one(sb("conversations", { method: "POST", body: JSON.stringify({ gym_id: gymId, lead_id: leadId, channel, phone: address, status: "open", context: {}, last_message_at: new Date().toISOString() }) }));
}
async function log(gymId: string, lead: Row, channel: string, address: string, m: Row) {
  const conv = await conversationFor(gymId, String(lead.id), channel, address);
  if (!conv) return;
  await sb("messages", { method: "POST", body: JSON.stringify({ conversation_id: conv.id, direction: "outbound", channel, content_type: "text", ...m }) });
  await sb(`conversations?id=eq.${conv.id}`, { method: "PATCH", body: JSON.stringify({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
}
async function journey(leadId: string, action: string, stage: string | null, channel: string | null, message: string) {
  await sb("lead_journey", { method: "POST", body: JSON.stringify({ lead_id: leadId, action, stage, from_stage: null, channel, message: message.slice(0, 500) }) });
}

// ---- the send ---------------------------------------------------------------
async function dispatch(b: Row) {
  const lead = await one(sb(`leads?id=eq.${b.lead_id}&select=*`));
  if (!lead) return J({ ok: false, error: "unknown lead" }, 404);
  const gym = await one(sb(`gyms?id=eq.${lead.gym_id}&select=id,name,settings,messaging_enabled,whatsapp_number,sms_number`));
  const body = String(b.body ?? "").trim();
  const purpose = String(b.purpose ?? "reply");
  const phone = normPhone(lead.phone_e164 ?? lead.phone);
  const email = String(lead.email ?? "").trim().toLowerCase() || null;
  const gymId = String(lead.gym_id);

  const g = await gates(gym!, lead);
  const attempts: Row[] = [];

  if (!g.allowed) {
    const why = g.reasons.join("; ");
    if (phone || email) await log(gymId, lead, phone ? "whatsapp" : "email", phone ?? email!, { content: body || `[template:${b.template}]`, reply_category: "suppressed", reply_rationale: why });
    return J({ ok: true, sent: false, suppressed: why, gates: g, would_have_sent: { body, purpose, to: phone ?? email } });
  }

  // Order: the channel that last worked for this lead first, then the rest in
  // canonical order. A caller may exclude channels (the fallback route does,
  // for the one that just failed and anything ahead of it).
  const preferred = String(lead.last_contact_channel ?? "");
  let order = [...CANONICAL];
  if (preferred === "sms" || preferred === "email") { order.splice(order.indexOf(preferred), 1); order.unshift(preferred); }
  const exclude: string[] = Array.isArray(b.exclude) ? b.exclude.map(String) : [];
  if (lead.metadata?.whatsapp_unreachable === true) exclude.push("whatsapp");
  order = order.filter((c) => !exclude.includes(c));
  for (const c of exclude) attempts.push({ channel: c, skipped: c === "whatsapp" && lead.metadata?.whatsapp_unreachable === true ? "number is not on WhatsApp" : "excluded by caller" });

  let sent: Row | null = null;
  for (const ch of order) {
    if ((ch === "whatsapp" || ch === "sms") && !phone) { attempts.push({ channel: ch, skipped: "no mobile" }); continue; }
    if (ch === "email" && !email) { attempts.push({ channel: ch, skipped: "no email" }); continue; }

    if (ch === "whatsapp") {
      const st = await fn("gymiq-whatsapp", "status", { gym_id: gymId, phone: phone! }, "GET");
      if (st.can_send_free_form && body) {
        const r = await fn("gymiq-whatsapp", "send", { gym_id: gymId, to: phone, body });
        attempts.push({ channel: ch, mode: "free_form", ok: !!r.sent, error: r.error ?? r.suppressed ?? null });
        if (r.sent) { sent = { channel: ch, mode: "free_form", sid: r.sid }; break; }
      } else if (st.can_send_template && (b.template || purpose === "first_touch")) {
        const key = String(b.template ?? "trial_invite");
        const r = await fn("gymiq-whatsapp", "template", { gym_id: gymId, to: phone, template: key, variables: b.variables ?? { "1": lead.first_name ?? "there", "2": gym?.settings?.staff_name ?? "the team" } });
        attempts.push({ channel: ch, mode: "template", template: key, ok: !!r.sent, error: r.error ?? r.suppressed ?? null });
        if (r.sent) { sent = { channel: ch, mode: "template", template: key, sid: r.sid }; break; }
      } else {
        attempts.push({ channel: ch, skipped: st.blocked_by?.length ? st.blocked_by.join("; ") : "24h window closed and no template for this purpose" });
      }
      continue;
    }
    if (ch === "sms") {
      const r = await fn("gymiq-messaging", "sms", { gym_id: gymId, lead_id: lead.id, to: phone, body });
      attempts.push({ channel: ch, ok: !!r.sent, error: r.error ?? r.suppressed ?? null });
      if (r.sent) { sent = { channel: ch, sid: r.sid }; break; }
      continue;
    }
    if (ch === "email") {
      const subject = String(b.subject ?? (purpose === "first_touch" ? `Your free trial at ${gym?.name}` : `${gym?.name}`));
      const r = await fn("gymiq-messaging", "email", { gym_id: gymId, lead_id: lead.id, to: email, subject, text: body });
      attempts.push({ channel: ch, ok: !!r.sent, error: r.error ?? r.suppressed ?? null });
      if (r.sent) { sent = { channel: ch, id: r.id }; break; }
    }
  }

  if (!sent) {
    await journey(String(lead.id), "send_failed", lead.current_stage, null, `${purpose}: ${attempts.map((a) => `${a.channel}=${a.skipped ?? a.error ?? "failed"}`).join("; ")}`);
    return J({ ok: false, sent: false, error: "no channel could carry the message", attempts });
  }

  // The sibling functions already logged the message; record the channel on the lead.
  await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({
    last_contact_channel: sent.channel, last_contact_at: new Date().toISOString(),
    contact_attempts: Number(lead.contact_attempts ?? 0) + 1,
    first_touch_at: lead.first_touch_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }) });
  await journey(String(lead.id), `sent_${purpose}`, lead.current_stage, sent.channel, sent.mode === "template" ? `[template:${sent.template}]` : body);
  return J({ ok: true, sent: true, ...sent, attempts, gates: g });
}

// ---- asynchronous delivery failure -> next channel ---------------------------
async function fallback(b: Row) {
  const sid = String(b.twilio_sid ?? "").trim();
  if (!sid) return J({ ok: false, error: "twilio_sid is required" }, 400);
  const msg = await one(sb(`messages?twilio_sid=eq.${encodeURIComponent(sid)}&direction=eq.outbound&limit=1&select=id,conversation_id,channel,content,content_type`));
  if (!msg) return J({ ok: true, fallback: false, reason: "no outbound message with that SID" });
  const conv = await one(sb(`conversations?id=eq.${msg.conversation_id}&select=id,lead_id,gym_id`));
  if (!conv?.lead_id) return J({ ok: true, fallback: false, reason: "message is not tied to a lead" });
  const lead = await one(sb(`leads?id=eq.${conv.lead_id}&select=*`));
  if (!lead) return J({ ok: true, fallback: false, reason: "lead gone" });

  // Once per SID. Twilio may deliver the same terminal status more than once.
  const already = await many(sb(`lead_journey?lead_id=eq.${lead.id}&action=eq.channel_fallback&message=like.${encodeURIComponent(sid)}*&limit=1&select=id`));
  if (already.length) return J({ ok: true, fallback: false, reason: "already handled" });

  const failed = String(b.failed_channel ?? msg.channel ?? "whatsapp");
  const code = String(b.error_code ?? "");
  if (failed === "whatsapp" && WA_UNREACHABLE_CODES.has(code)) {
    await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({ metadata: { ...(lead.metadata ?? {}), whatsapp_unreachable: true, whatsapp_unreachable_code: code }, updated_at: new Date().toISOString() }) });
  }

  // The words to carry on: a free-form body verbatim; a template's text with
  // its placeholders filled the way the template send filled them.
  let body = String(msg.content ?? "");
  const tplMatch = body.match(/^\[template:([a-z0-9_]+)\]\s*/i);
  if (tplMatch) {
    body = body.slice(tplMatch[0].length);
    const gym = await one(sb(`gyms?id=eq.${lead.gym_id}&select=settings`));
    body = body.replace(/\{\{\s*1\s*\}\}/g, lead.first_name ?? "there").replace(/\{\{\s*2\s*\}\}/g, gym?.settings?.staff_name ?? "the team");
  }
  if (!body.trim()) return J({ ok: true, fallback: false, reason: "nothing to re-send" });

  const idx = CANONICAL.indexOf(failed);
  const exclude = idx >= 0 ? CANONICAL.slice(0, idx + 1) : [failed];
  await journey(String(lead.id), "channel_fallback", lead.current_stage, failed, `${sid} ${failed} ${code || "undelivered"} -> trying ${CANONICAL.filter((c) => !exclude.includes(c)).join(", ") || "nothing left"}`);

  const res = await dispatch({ lead_id: lead.id, body, purpose: `fallback_${failed}`, exclude });
  const j = await res.json();
  return J({ ok: true, fallback: true, failed, code, ...j });
}

// ---- post-visit follow-ups composed by lead_followups_process --------------
async function drainFollowups(b: Row) {
  const rows = await many(sb(`lead_followups?status=eq.ready&order=due_at.asc&limit=${Number(b.limit ?? 20)}&select=*`));
  const out: Row[] = [];
  for (const f of rows) {
    const res = await dispatch({ lead_id: f.lead_id, body: f.body, purpose: `followup_${f.trigger_event}` });
    const j = await res.json();
    await sb(`lead_followups?id=eq.${f.id}`, { method: "PATCH", body: JSON.stringify(
      j.sent ? { status: "sent", sent_at: new Date().toISOString(), channel: j.channel }
             : { status: j.suppressed ? "skipped" : "failed", skipped_reason: (j.suppressed ?? j.error ?? "").slice(0, 300) }) });
    out.push({ followup: f.id, template: f.template_key, result: j.sent ? j.channel : (j.suppressed ?? j.error) });
  }
  return J({ ok: true, processed: out.length, out });
}

// ---- the team ---------------------------------------------------------------
async function notifyTeam(b: Row) {
  const lead = await one(sb(`leads?id=eq.${b.lead_id}&select=id,gym_id,first_name,last_name,phone_e164,email,source`));
  if (!lead) return J({ ok: false, error: "unknown lead" }, 404);
  const gym = await one(sb(`gyms?id=eq.${lead.gym_id}&select=id,name,settings`));
  const s: Row = gym?.settings ?? {};
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "a lead";
  const headline = String(b.headline ?? `${String(b.event ?? "update").toUpperCase()}: ${name}`);
  const text = `${headline}\n${b.detail ?? ""}\n\nMobile: ${lead.phone_e164 ?? "none"}\nEmail: ${lead.email ?? "none"}\nSource: ${lead.source}`;
  const out: Row = {};
  if (s.alert_email) {
    out.email = await fn("gymiq-messaging", "email", { internal: true, to: s.alert_email, subject: headline, text: text + (b.mark_url ? `\n\nMark the outcome: ${b.mark_url}` : "") });
  }
  for (const num of (s.staff_mobiles ?? []) as string[]) {
    const to = normPhone(num); if (!to) continue;
    out[`sms_${to}`] = await fn("gymiq-messaging", "sms", { gym_id: gym!.id, to, body: text.slice(0, 600) });
  }
  return J({ ok: true, notified: Object.keys(out), out });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  PRESENTED_KEY = req.headers.get("x-desk-key") ?? "";
  try {
    if (!(await deskAuth(PRESENTED_KEY))) return J({ ok: false, error: "forbidden" }, 403);
    if (req.method === "GET" && route === "gates") {
      const lead = await one(sb(`leads?id=eq.${url.searchParams.get("lead_id")}&select=*`));
      if (!lead) return J({ ok: false, error: "unknown lead" }, 404);
      const gym = await one(sb(`gyms?id=eq.${lead.gym_id}&select=id,name,settings,messaging_enabled`));
      return J({ ok: true, live: MESSAGING_LIVE, ...(await gates(gym!, lead)) });
    }
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (route === "send") return await dispatch(b);
      if (route === "fallback") return await fallback(b);
      if (route === "followups") return await drainFollowups(b);
      if (route === "notify-team") return await notifyTeam(b);
    }
    return J({ ok: false, error: "unknown route" }, 404);
  } catch (e) {
    console.error(e);
    return J({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
