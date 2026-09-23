// gymIQ WhatsApp, v3 (23 Sep 2026)
//
// CONSENT (public.v_messaging_consent). Someone who submits a free trial
// request, abandons a cart or enquires through the website has ASKED to be
// contacted: the form carries the consent statement, and that basis covers
// WhatsApp, email, SMS and DM. That is 'form_optin' and it is a full basis,
// not a lesser one. 'replied' is someone who has messaged us on WhatsApp
// themselves. 'member' and 'legacy_optin' are current or former members and
// the people GymGlitch was already messaging on the gym's behalf, the
// existing-customer basis. An explicit opt-out beats all of them, always.
//
// v3: the allowed-basis list now matches the vocabulary the consent views
// actually emit (replied / form_optin / member / legacy_optin). v2 was checking
// for names the views no longer use, which would have blocked WhatsApp for
// every lead except the 360 form opt-ins and pushed them all to SMS.
//
// THE 24-HOUR WINDOW is not policy and not a judgement call: outside 24 hours
// from the person's last inbound message, the WhatsApp API will not accept
// free-form text at all. Only an approved template sends. So first contact is
// always a template, however strong the consent, and this function refuses a
// free-form send outside the window rather than silently swapping it for a
// template, because a caller that believes it sent one thing and actually sent
// another is how you end up apologising to a member.
//
// Routes (all x-desk-key)
//   GET  ?route=status&gym_id=&phone=   can we message them, and how
//   GET  ?route=audience&gym_id=        who is reachable, by basis
//   POST ?route=send                    free-form, window enforced
//   POST ?route=template                approved template by key

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";
const TW_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TW_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TW_WA_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "";
const MESSAGING_LIVE = (Deno.env.get("MESSAGING_LIVE") ?? "").toLowerCase() === "true";
const PUBLIC_FN_URL = Deno.env.get("PUBLIC_FN_URL") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-desk-key",
  "Content-Type": "application/json",
};
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: CORS });
type Row = Record<string, any>;

const sb = (p: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${p}`, {
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
const one = async (r: Promise<Response>): Promise<Row | null> => (await many(r))[0] ?? null;

async function deskAuth(k: string): Promise<boolean> {
  if (!k) return false;
  if (DESK_KEY && k === DESK_KEY) return true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/lead_desk_auth`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: k }),
    });
    return (await r.json()) === true;
  } catch { return false; }
}

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
const wa = (p: string) => (p.startsWith("whatsapp:") ? p : `whatsapp:${p}`);

// The bases v_messaging_consent / v_whatsapp_optin emit, plus the two older
// names kept so nothing that still says them is refused.
const ALLOWED = ["replied", "form_optin", "member", "legacy_optin", "direct_reply", "soft_optin"];

async function reachability(gymId: string, phone: string) {
  const row = await one(sb(
    `v_whatsapp_optin?gym_id=eq.${gymId}&phone=eq.${encodeURIComponent(phone)}&select=*`));
  const consent = await one(sb(
    `v_messaging_consent?gym_id=eq.${gymId}&phone_e164=eq.${encodeURIComponent(phone)}&limit=1&select=lead_id,first_name,last_name,consent_basis,source`));
  const gym = await one(sb(`gyms?id=eq.${gymId}&select=id,name,messaging_enabled,whatsapp_number`));

  const basis = String(consent?.consent_basis ?? row?.consent_basis ?? "unknown");
  const reasons: string[] = [];
  if (!MESSAGING_LIVE) reasons.push("MESSAGING_LIVE is not set");
  if (!gym) reasons.push("gym not found");
  else if (gym.messaging_enabled !== true) reasons.push(`messaging_enabled is false for ${gym.name}`);
  if (basis === "opted_out") reasons.push("this person has opted out");
  else if (!ALLOWED.includes(basis)) {
    reasons.push("no lawful basis on record: they never submitted a form, replied to us, or held a membership");
  }

  const windowOpen = row?.session_window_open === true;
  return {
    phone,
    consent_basis: basis,
    gym: gym ? { id: gym.id, name: gym.name, sender: gym.whatsapp_number ?? TW_WA_FROM ?? null } : null,
    lead: consent?.lead_id
      ? { id: consent.lead_id, name: [consent.first_name, consent.last_name].filter(Boolean).join(" "), source: consent.source }
      : null,
    last_inbound_at: row?.last_inbound_at ?? null,
    session_window_open: windowOpen,
    can_send_free_form: reasons.length === 0 && windowOpen,
    can_send_template: reasons.length === 0,
    blocked_by: reasons,
    note: reasons.length === 0 && !windowOpen
      ? "Consent is fine. The 24-hour window is closed, so only an approved template will send."
      : undefined,
  };
}

async function twilioSend(from: string, to: string, extra: Record<string, string>) {
  if (!TW_SID || !TW_TOKEN) return { ok: false, error: "Twilio credentials are not set" };
  const form = new URLSearchParams({ From: from, To: to, ...extra });
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

async function conversationFor(gymId: string, phone: string, leadId?: string | null) {
  const hit = await one(sb(
    `conversations?gym_id=eq.${gymId}&channel=eq.whatsapp&phone=eq.${encodeURIComponent(phone)}&status=neq.archived&order=last_message_at.desc&limit=1&select=*`));
  if (hit) return hit;
  return await one(sb("conversations", {
    method: "POST",
    body: JSON.stringify({
      gym_id: gymId, lead_id: leadId ?? null, channel: "whatsapp", phone,
      status: "open", context: {}, last_message_at: new Date().toISOString(),
    }),
  }));
}

async function log(convId: string, m: Row) {
  await sb("messages", { method: "POST", body: JSON.stringify({ conversation_id: convId, ...m }) });
  await sb(`conversations?id=eq.${convId}`, {
    method: "PATCH",
    body: JSON.stringify({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
}

async function routeSend(b: Row) {
  const gymId = String(b.gym_id ?? "");
  const phone = normPhone(b.to);
  const body = String(b.body ?? "").trim();
  if (!gymId || !phone || !body) return J({ ok: false, error: "gym_id, to and body are required" }, 400);

  const r = await reachability(gymId, phone);
  const conv = await conversationFor(gymId, phone, r.lead?.id ?? null);

  if (!r.can_send_free_form) {
    const why = r.blocked_by.length
      ? r.blocked_by.join("; ")
      : "the 24-hour window is closed: send an approved template instead";
    if (conv) {
      await log(String(conv.id), {
        direction: "outbound", channel: "whatsapp", content: body, content_type: "text",
        reply_category: "suppressed", reply_rationale: why,
      });
    }
    return J({ ok: true, sent: false, suppressed: why, reachability: r, would_have_sent: body });
  }

  const res = await twilioSend(wa(String(r.gym?.sender ?? TW_WA_FROM)), wa(phone), { Body: body });
  if (!res.ok) return J({ ...res, ok: false, reachability: r }, 502);
  if (conv) {
    await log(String(conv.id), {
      direction: "outbound", channel: "whatsapp", content: body, content_type: "text",
      twilio_sid: res.sid ?? null, sent_at: new Date().toISOString(),
    });
  }
  return J({ ok: true, sent: true, sid: res.sid, status: res.status });
}

async function routeTemplate(b: Row) {
  const gymId = String(b.gym_id ?? "");
  const phone = normPhone(b.to);
  const key = String(b.template ?? "").trim();
  if (!gymId || !phone || !key) return J({ ok: false, error: "gym_id, to and template are required" }, 400);

  const tpl = await one(sb(
    `message_templates?gym_id=eq.${gymId}&key=eq.${encodeURIComponent(key)}&channel=eq.whatsapp&active=is.true&limit=1&select=*`));
  if (!tpl) return J({ ok: false, error: `no active WhatsApp template '${key}' for this gym` }, 404);
  if (!tpl.provider_sid) {
    return J({ ok: false, error: `template '${key}' has no Twilio Content SID yet, so Meta has not approved it` }, 412);
  }

  const r = await reachability(gymId, phone);
  const conv = await conversationFor(gymId, phone, r.lead?.id ?? null);

  // Consent and the gates still apply to a template. Only the 24-hour window
  // does not, which is the entire reason templates exist.
  if (!r.can_send_template) {
    const why = r.blocked_by.join("; ");
    if (conv) {
      await log(String(conv.id), {
        direction: "outbound", channel: "whatsapp", content: `[template:${key}]`, content_type: "template",
        reply_category: "suppressed", reply_rationale: why,
      });
    }
    return J({ ok: true, sent: false, suppressed: why, reachability: r });
  }

  const res = await twilioSend(wa(String(r.gym?.sender ?? TW_WA_FROM)), wa(phone), {
    ContentSid: String(tpl.provider_sid),
    ContentVariables: JSON.stringify(b.variables ?? {}),
  });
  if (!res.ok) return J({ ...res, ok: false, reachability: r }, 502);
  if (conv) {
    await log(String(conv.id), {
      direction: "outbound", channel: "whatsapp",
      content: `[template:${key}] ${tpl.body}`, content_type: "template",
      twilio_sid: res.sid ?? null, sent_at: new Date().toISOString(),
    });
  }
  return J({ ok: true, sent: true, template: key, sid: res.sid, status: res.status });
}

async function routeAudience(url: URL) {
  const gymId = url.searchParams.get("gym_id") ?? "";
  if (!gymId) return J({ ok: false, error: "gym_id is required" }, 400);
  const basis = url.searchParams.get("basis");
  const q = `v_whatsapp_optin?gym_id=eq.${gymId}` +
    (basis ? `&consent_basis=eq.${encodeURIComponent(basis)}` : "") +
    `&order=last_activity_at.desc&select=phone,contact_name,lead_id,consent_basis,inbound_messages,last_inbound_at,session_window_open`;
  const rows = await many(sb(q));
  const by: Record<string, number> = {};
  for (const r of rows) by[String(r.consent_basis)] = (by[String(r.consent_basis)] ?? 0) + 1;
  return J({
    ok: true,
    live: MESSAGING_LIVE,
    reachable: rows.length,
    by_basis: by,
    window_open_now: rows.filter((r) => r.session_window_open === true).length,
    template_required: rows.filter((r) => r.session_window_open !== true).length,
    people: rows.slice(0, 200),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  try {
    if (!(await deskAuth(req.headers.get("x-desk-key") ?? ""))) return J({ ok: false, error: "forbidden" }, 403);

    if (req.method === "GET" && route === "status") {
      const gymId = url.searchParams.get("gym_id") ?? "";
      const phone = normPhone(url.searchParams.get("phone"));
      if (!gymId || !phone) return J({ ok: false, error: "gym_id and phone are required" }, 400);
      return J({ ok: true, ...(await reachability(gymId, phone)) });
    }
    if (req.method === "GET" && route === "audience") return await routeAudience(url);
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (route === "send") return await routeSend(b);
      if (route === "template") return await routeTemplate(b);
    }
    return J({ ok: false, error: "unknown route" }, 404);
  } catch (e) {
    console.error(e);
    return J({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
