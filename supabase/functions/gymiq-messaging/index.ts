// gymIQ messaging, v3 (23 Sep 2026)
//
// One send path for the whole product: email via Resend, WhatsApp and SMS via
// Twilio, plus the inbound and delivery-status webhooks Twilio calls back on.
//
// SAFETY. Messaging a LEAD OR MEMBER passes three gates, all of which must be
// true, and two of which are deliberately awkward to turn on:
//   1. MESSAGING_LIVE=true          env var, set by Paul
//   2. gyms.messaging_enabled=true  per gym, set in the database
//   3. the lead has not opted out    checked per recipient, every time
// With any gate shut the message is logged with reason 'suppressed' and the
// response says what it would have sent. Safe to exercise end to end before a
// single real person hears from it.
//
// v2: INTERNAL email (digests, alerts, and the test route) no longer sits
// behind MESSAGING_LIVE. That switch exists to protect leads and members from
// being contacted, not to stop the system emailing its own operators.
//
// v3: an inbound WhatsApp or SMS is handed to the lead engine after it is
// logged, so the AI answers it. The hand-off is fire-and-forget (Twilio gives
// a webhook 15 seconds; the engine's two-pass reply can take longer), carries
// already_logged so the engine does not write the inbound twice, and never
// happens for STOP. Whether the engine's answer actually leaves the building
// is decided by gymiq-dispatch (MESSAGING_LIVE, messaging_enabled, test mode).
//
// Routes
//   POST ?route=email            send one email            (x-desk-key)
//   POST ?route=email-test       prove email works, to one named address
//   POST ?route=whatsapp         send one WhatsApp message (x-desk-key)
//   POST ?route=sms              send one SMS              (x-desk-key)
//   POST ?route=inbound          Twilio inbound webhook    (Twilio signature)
//   POST ?route=status           Twilio delivery status    (Twilio signature)
//   GET  ?route=health           what is configured, no secrets returned

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "gymIQ <noreply@gymiq.ai>";
const EMAIL_REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "";

const TW_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TW_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TW_WA_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "";
const TW_SMS_FROM = Deno.env.get("TWILIO_SMS_FROM") ?? "";

const MESSAGING_LIVE = (Deno.env.get("MESSAGING_LIVE") ?? "").toLowerCase() === "true";
const PUBLIC_FN_URL = Deno.env.get("PUBLIC_FN_URL") ?? "";
const FN = PUBLIC_FN_URL || `${SB_URL}/functions/v1`;

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

async function deskAuth(presented: string): Promise<boolean> {
  if (!presented) return false;
  if (DESK_KEY && presented === DESK_KEY) return true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/lead_desk_auth`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: presented }),
    });
    return (await r.json()) === true;
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
const waAddr = (p: string) => (p.startsWith("whatsapp:") ? p : `whatsapp:${p}`);
const bare = (p: string) => p.replace(/^whatsapp:/, "");
const isStop = (s: string) => /^\s*(stop|stop all|unsubscribe|optout|opt out|cancel|end|quit)\s*[.!]?\s*$/i.test(s);

async function getGym(gymId: string): Promise<Row | null> {
  return await one(sb(`gyms?id=eq.${gymId}&select=id,name,messaging_enabled,whatsapp_number,sms_number,timezone,knowledge_base`));
}

async function conversationFor(gymId: string, channel: string, phone: string, leadId?: string | null): Promise<Row | null> {
  const existing = await one(sb(
    `conversations?gym_id=eq.${gymId}&channel=eq.${encodeURIComponent(channel)}&phone=eq.${encodeURIComponent(phone)}&status=neq.archived&order=last_message_at.desc&limit=1&select=*`));
  if (existing) return existing;
  return await one(sb("conversations", {
    method: "POST",
    body: JSON.stringify({
      gym_id: gymId, lead_id: leadId ?? null, channel, phone,
      status: "open", context: {}, last_message_at: new Date().toISOString(),
    }),
  }));
}

async function logMessage(conversationId: string, m: Row) {
  await sb("messages", { method: "POST", body: JSON.stringify({ conversation_id: conversationId, ...m }) });
  await sb(`conversations?id=eq.${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

// Returns null when it is safe to contact this person, or the reason it is not.
async function blockedReason(gym: Row | null, lead: Row | null): Promise<string | null> {
  if (!MESSAGING_LIVE) return "MESSAGING_LIVE is not set";
  if (!gym) return "gym not found";
  if (gym.messaging_enabled !== true) return `messaging_enabled is false for ${gym.name}`;
  if (lead) {
    if (lead.consent_marketing === false) return "lead has withdrawn marketing consent";
    const stage = String(lead.current_stage ?? "");
    if (stage === "opted_out" || stage === "dead") return `lead stage is ${stage}`;
  }
  return null;
}

// Sibling calls (engine, dispatch) are authenticated with the job secret the
// cron jobs present. It lives in Vault; internal_desk_key() hands it to the
// service role only.
let _ik = "";
async function internalKey(): Promise<string> {
  if (DESK_KEY) return DESK_KEY;
  if (_ik) return _ik;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/internal_desk_key`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  _ik = String(await r.json().catch(() => "")).replace(/^"|"$/g, "");
  return _ik;
}
async function sibling(name: string, route: string, payload: Row): Promise<void> {
  try {
    const r = await fetch(`${FN}/${name}?route=${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-desk-key": await internalKey() },
      body: JSON.stringify(payload),
    });
    if (!r.ok) console.error(`${name}/${route} hop`, r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error(`${name}/${route} hop failed`, String(e).slice(0, 200));
  }
}
const handToEngine = (payload: Row) => sibling("gymiq-lead-engine", "inbound", payload);
function background(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(p);
  else p.catch(() => {});
}

// ---- Resend ----------------------------------------------------------------
async function sendEmail(to: string, subject: string, opts: { html?: string; text?: string; from?: string; replyTo?: string }) {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY is not set" };
  const body: Row = { from: opts.from ?? EMAIL_FROM, to: [to], subject };
  if (opts.html) body.html = opts.html;
  if (opts.text) body.text = opts.text;
  if (!opts.html && !opts.text) body.text = "";
  const rt = opts.replyTo ?? EMAIL_REPLY_TO;
  if (rt) body.reply_to = rt;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: j?.message ?? j?.name ?? "resend rejected the send" };
  return { ok: true, id: j?.id };
}

// ---- Twilio ----------------------------------------------------------------
async function twilioSend(from: string, to: string, body: string) {
  if (!TW_SID || !TW_TOKEN) return { ok: false, error: "Twilio credentials are not set" };
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  if (PUBLIC_FN_URL) form.set("StatusCallback", `${PUBLIC_FN_URL}/gymiq-messaging?route=status`);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: j?.message ?? "twilio rejected the send", code: j?.code };
  return { ok: true, sid: j?.sid, status: j?.status };
}

// Twilio signs each webhook: HMAC-SHA1 over the full URL plus the sorted POST
// body, keyed by the auth token. Without this check anyone could post fake
// inbound messages into the desk.
async function twilioSignatureValid(url: string, params: Record<string, string>, signature: string): Promise<boolean> {
  if (!TW_TOKEN || !signature) return false;
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(TW_TOKEN),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// ---- routes ----------------------------------------------------------------
async function routeEmailTest(b: Row) {
  const to = String(b.to ?? "").trim().toLowerCase();
  if (!to || !to.includes("@")) return J({ ok: false, error: "a valid 'to' is required" }, 400);
  const stamp = new Date().toISOString();
  const res = await sendEmail(to, "gymIQ email test", {
    text: `This is a test from the gymIQ messaging function.\n\nSent at ${stamp}\nFrom: ${EMAIL_FROM}\n\nIf this arrived, Resend, the domain and the sender address are all working.\nNo leads or members were contacted: this route only sends to the address named in the request.`,
  });
  if (!res.ok) return J({ ...res, ok: false }, 502);
  return J({ ok: true, sent: true, to, id: res.id, at: stamp });
}

async function routeEmail(b: Row) {
  const to = String(b.to ?? "").trim().toLowerCase();
  if (!to || !to.includes("@")) return J({ ok: false, error: "a valid 'to' is required" }, 400);
  const subject = String(b.subject ?? "").trim();
  if (!subject) return J({ ok: false, error: "'subject' is required" }, 400);

  // Internal mail is to our own operators, not to a lead or member. It is
  // protected by the desk key, not by MESSAGING_LIVE.
  if (b.internal === true) {
    const res = await sendEmail(to, subject, { html: b.html, text: b.text, from: b.from, replyTo: b.reply_to });
    if (!res.ok) return J({ ...res, ok: false }, 502);
    return J({ ok: true, sent: true, internal: true, id: res.id });
  }

  let gym: Row | null = null, lead: Row | null = null;
  if (b.gym_id) gym = await getGym(String(b.gym_id));
  if (b.lead_id) lead = await one(sb(`leads?id=eq.${b.lead_id}&select=id,gym_id,email,consent_marketing,current_stage`));
  if (!gym && lead?.gym_id) gym = await getGym(String(lead.gym_id));

  const blocked = await blockedReason(gym, lead);
  if (blocked) return J({ ok: true, sent: false, suppressed: blocked, would_have_sent: { to, subject } });

  const res = await sendEmail(to, subject, { html: b.html, text: b.text, from: b.from, replyTo: b.reply_to });
  if (!res.ok) return J({ ...res, ok: false }, 502);

  if (lead && gym) {
    const conv = await conversationFor(String(gym.id), "email", to, String(lead.id));
    if (conv) {
      await logMessage(String(conv.id), {
        direction: "outbound", channel: "email", content: `${subject}\n\n${b.text ?? b.html ?? ""}`,
        content_type: "text", sent_at: new Date().toISOString(),
      });
    }
  }
  return J({ ok: true, sent: true, id: res.id });
}

async function routeText(b: Row, kind: "whatsapp" | "sms") {
  const body = String(b.body ?? b.message ?? "").trim();
  if (!body) return J({ ok: false, error: "'body' is required" }, 400);

  let lead: Row | null = null;
  if (b.lead_id) lead = await one(sb(`leads?id=eq.${b.lead_id}&select=id,gym_id,phone_e164,consent_marketing,current_stage,first_name`));
  const gymId = String(b.gym_id ?? lead?.gym_id ?? "");
  if (!gymId) return J({ ok: false, error: "'gym_id' or 'lead_id' is required" }, 400);
  const gym = await getGym(gymId);

  const to = normPhone(b.to ?? lead?.phone_e164);
  if (!to) return J({ ok: false, error: "no destination number" }, 400);

  const from = kind === "whatsapp"
    ? (gym?.whatsapp_number ? waAddr(String(gym.whatsapp_number)) : TW_WA_FROM)
    : (gym?.sms_number ? String(gym.sms_number) : TW_SMS_FROM);
  if (!from) return J({ ok: false, error: `no ${kind} sender configured` }, 412);

  const conv = await conversationFor(gymId, kind, to, lead?.id ? String(lead.id) : null);

  const blocked = await blockedReason(gym, lead);
  if (blocked) {
    if (conv) {
      await logMessage(String(conv.id), {
        direction: "outbound", channel: kind, content: body, content_type: "text",
        reply_category: "suppressed", reply_rationale: blocked,
      });
    }
    return J({ ok: true, sent: false, suppressed: blocked, would_have_sent: { to, from, body } });
  }

  const res = await twilioSend(kind === "whatsapp" ? waAddr(from) : from,
                               kind === "whatsapp" ? waAddr(to) : to, body);
  if (!res.ok) return J({ ...res, ok: false }, 502);

  if (conv) {
    await logMessage(String(conv.id), {
      direction: "outbound", channel: kind, content: body, content_type: "text",
      twilio_sid: res.sid ?? null, sent_at: new Date().toISOString(),
    });
  }
  return J({ ok: true, sent: true, sid: res.sid, status: res.status });
}

async function routeInbound(req: Request, url: URL, raw: string) {
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const check = PUBLIC_FN_URL ? `${PUBLIC_FN_URL}/gymiq-messaging?route=inbound` : url.toString();
  if (!(await twilioSignatureValid(check, params, sig))) {
    return J({ ok: false, error: "bad signature" }, 403);
  }

  const fromRaw = params.From ?? "";
  const channel = fromRaw.startsWith("whatsapp:") ? "whatsapp" : "sms";
  const from = normPhone(bare(fromRaw));
  const body = params.Body ?? "";
  const twiml = () => new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
  if (!from) return twiml();

  // Newest lead on this number. The engine does its own, richer resolution
  // (same number across older leads, memory inheritance); this is only to
  // find the gym and log the message under the right conversation.
  const lead = await one(sb(`leads?phone_e164=eq.${encodeURIComponent(from)}&order=created_at.desc&limit=1&select=id,gym_id,current_stage`));
  const gymId = lead?.gym_id ? String(lead.gym_id) : "";
  if (!gymId) {
    // Nobody we know. Under this gym's consent model every inbound is a reply
    // to something we sent, so this is either a wrong number or a forwarded
    // chat. Keep a record without answering.
    console.warn("inbound from unknown number", channel, from.slice(0, 6) + "…");
    return twiml();
  }

  const conv = await conversationFor(gymId, channel, from, lead?.id ? String(lead.id) : null);
  if (conv) {
    await logMessage(String(conv.id), {
      direction: "inbound", channel, content: body, content_type: "text",
      twilio_sid: params.MessageSid ?? null, sent_at: new Date().toISOString(),
    });
  }

  // STOP is a legal obligation, not a preference. Honour it immediately and
  // do not let the AI reply to it.
  if (isStop(body) && lead?.id) {
    await sb(`leads?id=eq.${lead.id}`, {
      method: "PATCH",
      body: JSON.stringify({ consent_marketing: false, current_stage: "opted_out", updated_at: new Date().toISOString() }),
    });
    return twiml();
  }

  // Everything else goes to the engine, off the webhook's clock.
  background(handToEngine({
    lead_id: lead?.id ?? null, phone: from, channel, text: body,
    conversation_id: conv?.id ?? null, twilio_sid: params.MessageSid ?? null,
    media: Number(params.NumMedia ?? 0) > 0 ? { count: Number(params.NumMedia), type: params.MediaContentType0 ?? null } : null,
    already_logged: true,
  }));
  return twiml();
}

async function routeStatus(req: Request, url: URL, raw: string) {
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const check = PUBLIC_FN_URL ? `${PUBLIC_FN_URL}/gymiq-messaging?route=status` : url.toString();
  if (!(await twilioSignatureValid(check, params, sig))) {
    return J({ ok: false, error: "bad signature" }, 403);
  }
  const sid = params.MessageSid ?? params.SmsSid ?? "";
  const status = params.MessageStatus ?? params.SmsStatus ?? "";
  if (sid && (status === "delivered" || status === "read")) {
    await sb(`messages?twilio_sid=eq.${encodeURIComponent(sid)}`, {
      method: "PATCH",
      body: JSON.stringify({ delivered_at: new Date().toISOString() }),
    });
  } else if (sid && (status === "failed" || status === "undelivered")) {
    // Twilio accepted the message and then could not deliver it: the person
    // is not on WhatsApp (63024), the number is dead, the window shut (63016).
    // Stamp the failure, then ask dispatch to carry the same words down the
    // channel order (WhatsApp -> SMS -> email), so a silent failure never
    // strands a lead. Dispatch refuses to do it twice for the same SID.
    await sb(`messages?twilio_sid=eq.${encodeURIComponent(sid)}`, {
      method: "PATCH",
      body: JSON.stringify({ reply_category: "delivery_failed", reply_rationale: params.ErrorCode ?? status }),
    });
    const failedChannel = String(params.To ?? params.From ?? "").startsWith("whatsapp:") ? "whatsapp" : "sms";
    background(sibling("gymiq-dispatch", "fallback", { twilio_sid: sid, failed_channel: failedChannel, error_code: params.ErrorCode ?? status }));
  }
  return new Response("", { status: 204 });
}

function routeHealth() {
  return J({
    ok: true,
    live: MESSAGING_LIVE,
    email: { resend_key_set: !!RESEND_KEY, from: EMAIL_FROM, reply_to: EMAIL_REPLY_TO || null },
    twilio: {
      account_set: !!TW_SID, token_set: !!TW_TOKEN,
      whatsapp_from: TW_WA_FROM || null, sms_from: TW_SMS_FROM || null,
      inbound_webhook: PUBLIC_FN_URL ? `${PUBLIC_FN_URL}/gymiq-messaging?route=inbound` : null,
      status_webhook: PUBLIC_FN_URL ? `${PUBLIC_FN_URL}/gymiq-messaging?route=status` : null,
    },
    engine_hop: `${FN}/gymiq-lead-engine?route=inbound`,
    note: MESSAGING_LIVE
      ? "LIVE. Leads and members can be messaged, subject to per-gym messaging_enabled and per-lead consent."
      : "Not live. Leads and members cannot be messaged. Internal email still works.",
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  try {
    if (route === "health") return routeHealth();

    // Twilio webhooks authenticate by signature, not by desk key.
    if (req.method === "POST" && route === "inbound") return await routeInbound(req, url, await req.text());
    if (req.method === "POST" && route === "status") return await routeStatus(req, url, await req.text());

    if (!(await deskAuth(req.headers.get("x-desk-key") ?? "")))  return J({ ok: false, error: "forbidden" }, 403);

    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (route === "email-test") return await routeEmailTest(b);
      if (route === "email") return await routeEmail(b);
      if (route === "whatsapp") return await routeText(b, "whatsapp");
      if (route === "sms") return await routeText(b, "sms");
    }
    return J({ ok: false, error: "unknown route" }, 404);
  } catch (e) {
    console.error(e);
    return J({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
