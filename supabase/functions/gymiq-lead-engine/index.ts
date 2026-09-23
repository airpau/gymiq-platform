// gymIQ Lead Engine, v6 (23 Sep 2026)
//
// v6: production wiring. The brain is unchanged; what changed is how messages
// leave and arrive.
//   * Demo leads (metadata.demo=true) still write to the 'sim' channel.
//   * Every other lead's message goes through gymiq-dispatch, the one door that
//     applies MESSAGING_LIVE, gyms.messaging_enabled, consent and TEST MODE, then
//     tries WhatsApp, SMS, email in that order. This engine never sends directly.
//   * New routes: first-touch (an ingested lead by id), inbound (a reply arriving
//     from the Twilio webhook, by phone), outcome by token (a link the team taps
//     from the booking email, no login).
//   * History is loaded across ALL of a lead's conversations, so a reply on SMS
//     after a WhatsApp opener is one thread, not two.
//   * Pricing comes from gyms.knowledge_base, so it cannot drift again.
//   * Follow-up timing uses the sequence's wait_minutes for real leads; demo
//     leads keep the 60-second cadence.
//   * Outcomes enqueue the rule-based follow-ups (lead_followups_enqueue) which
//     gymiq-dispatch drains on the half hour.
//
// v5: the assistant has memory. Every lead carries a state record
// (leads.memory) with the live booking, any proposal waiting for a yes, what
// the lead has asked, what they have told us and what staff recorded after the
// visit. Every turn runs in two passes: UNDERSTAND (the model reads the
// conversation and the state and returns an intent) then the SERVER resolves
// that intent against real availability and the stored booking, then WRITE
// (the model words a reply from a resolution it cannot contradict). The model
// never books anything; the server does, and only after the lead has said yes
// to a specific slot. Rescheduling reads the stored booking, cancels it and
// books the new slot in one step. Cancelling asks first too.
//
// HARD SAFETY RAILS (unchanged from v4):
//   * No message reaches a real person unless gymiq-dispatch's gates all pass:
//     MESSAGING_LIVE, gyms.messaging_enabled, consent, and test mode.
//   * messaging_optouts honoured on every send, simulated or real.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TG_TOKEN = Deno.env.get("TELEGRAM_TOKEN") ?? "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DESK_KEY = Deno.env.get("DESK_KEY") ?? "";
const FN = Deno.env.get("PUBLIC_FN_URL") ?? `${SB_URL}/functions/v1`;

// The key this engine presents to its sibling functions. Read once from the
// database (service role only), never from an env var pasted around.
let _ik = "";
async function internalKey(): Promise<string> {
  if (DESK_KEY) return DESK_KEY;
  if (_ik) return _ik;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/internal_desk_key`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: "{}" });
  _ik = String(await r.json().catch(() => "")).replace(/^"|"$/g, "");
  return _ik;
}

const MODEL = "claude-haiku-4-5-20251001";
const DEMO_KEY = "dan-demo-2026";
const GYM_SLUG = "energie-hoddesdon";
const MAX_FOLLOWUPS = 2;
const TZ = "Europe/London";
const CLUB = "Energie Fitness Hoddesdon";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-gymiq-demo", "Content-Type": "application/json" };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: CORS });

type Row = Record<string, unknown>;
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
const one = async (r: Promise<Response>) => { const j = await (await r).json(); return Array.isArray(j) ? j[0] : j; };
const many = async (r: Promise<Response>) => { const j = await (await r).json(); return Array.isArray(j) ? j : []; };

async function gymRow(): Promise<Row> { return await one(sb(`gyms?slug=eq.${GYM_SLUG}&select=id,settings,name,knowledge_base,messaging_enabled`)); }

// ---------------- time helpers (all in the club's timezone) ----------------

function partsIn(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, wd: p.weekday.toLowerCase().slice(0, 3), ymd: `${p.year}-${p.month}-${p.day}` };
}
function offsetMinutes(d: Date): number {
  const p = partsIn(d);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return Math.round((asUtc - d.getTime()) / 60000);
}
// Build a Date for a wall clock time in the club's timezone.
function localDate(ymd: string, h: number, min: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const off = offsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}
function isoLocal(d: Date): string {
  const p = partsIn(d); const off = offsetMinutes(d);
  const sign = off >= 0 ? "+" : "-"; const a = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function fmtSlot(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function fmtDay(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
}
function fmtTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
function calendarBlock(): string {
  const out: string[] = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(Date.now() + i * 86400_000);
    out.push(`${i === 0 ? "TODAY: " : i === 1 ? "TOMORROW: " : ""}${fmtDay(d)} = ${partsIn(d).ymd}`);
  }
  return out.join("\n");
}

// ---------------- availability ----------------

interface Hours { [wd: string]: [string, string] }
function hoursFor(gym: Row): { hours: Hours; cap: number; step: number; lead: number } {
  const s = (gym.settings ?? {}) as Row;
  const hours = (s.staffed_hours as Hours) ?? { mon: ["06:00", "22:00"], tue: ["06:00", "22:00"], wed: ["06:00", "22:00"], thu: ["06:00", "22:00"], fri: ["06:00", "21:00"], sat: ["08:00", "18:00"], sun: ["08:00", "18:00"] };
  return { hours, cap: Number(s.trial_capacity_per_slot ?? 2), step: Number(s.trial_slot_minutes ?? 30), lead: Number(s.trial_lead_minutes ?? 60) };
}
function hoursText(h: Hours): string {
  return Object.entries(h).map(([d, [o, c]]) => `${d} ${o}-${c}`).join(", ");
}
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };

async function bookedCounts(gym_id: string, from: Date, to: Date): Promise<Map<string, number>> {
  const rows = await many(sb(`bookings?gym_id=eq.${gym_id}&status=eq.booked&slot_at=gte.${from.toISOString()}&slot_at=lt.${to.toISOString()}&select=slot_at`));
  const m = new Map<string, number>();
  for (const r of rows) { const k = new Date(String(r.slot_at)).toISOString(); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

type Check = { ok: true; at: Date } | { ok: false; why: "past" | "closed" | "full" | "too_far"; alternatives: Date[]; open?: [string, string] };

// Is this exact slot bookable? If not, why, and what is close by.
async function checkSlot(gym: Row, want: Date): Promise<Check> {
  const { hours, cap, step, lead } = hoursFor(gym);
  const gym_id = String(gym.id);
  const now = new Date();
  // snap to the slot grid
  const p = partsIn(want);
  const snappedMin = Math.round(p.min / step) * step;
  want = localDate(p.ymd, p.h + Math.floor(snappedMin / 60), snappedMin % 60);
  const dayStart = localDate(p.ymd, 0, 0), dayEnd = new Date(dayStart.getTime() + 86400_000);
  const counts = await bookedCounts(gym_id, dayStart, new Date(dayEnd.getTime() + 86400_000 * 2));
  const open = hours[p.wd] as [string, string] | undefined;
  const free = (d: Date) => {
    const q = partsIn(d); const o = hours[q.wd]; if (!o) return false;
    const t = q.h * 60 + q.min;
    if (t < hm(o[0]) || t + step > hm(o[1])) return false;
    if (d.getTime() < now.getTime() + lead * 60000) return false;
    return (counts.get(d.toISOString()) ?? 0) < cap;
  };
  const alternatives = (around: Date): Date[] => {
    const out: Date[] = [];
    const cands: Date[] = [];
    for (let day = 0; day < 3 && cands.length < 400; day++) {
      const base = new Date(dayStart.getTime() + day * 86400_000);
      const q = partsIn(base); const o = hours[q.wd]; if (!o) continue;
      for (let t = hm(o[0]); t + step <= hm(o[1]); t += step) cands.push(localDate(q.ymd, Math.floor(t / 60), t % 60));
    }
    cands.sort((a, b) => Math.abs(a.getTime() - around.getTime()) - Math.abs(b.getTime() - around.getTime()));
    for (const c of cands) { if (free(c)) out.push(c); if (out.length >= 3) break; }
    return out.sort((a, b) => a.getTime() - b.getTime());
  };
  if (want.getTime() > now.getTime() + 21 * 86400_000) return { ok: false, why: "too_far", alternatives: [] };
  if (want.getTime() < now.getTime() + lead * 60000) return { ok: false, why: "past", alternatives: alternatives(new Date(Math.max(want.getTime(), now.getTime()))) };
  if (!open) return { ok: false, why: "closed", alternatives: alternatives(want) };
  const t = p.h * 60 + snappedMin;
  if (t < hm(open[0]) || t + step > hm(open[1])) return { ok: false, why: "closed", alternatives: alternatives(want), open };
  if ((counts.get(want.toISOString()) ?? 0) >= cap) return { ok: false, why: "full", alternatives: alternatives(want) };
  return { ok: true, at: want };
}

// ---------------- notifications ----------------

async function tgTo(chatId: number | string, text: string) {
  if (!TG_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
  }).catch(() => {});
}
async function alertStaff(gym: Row, text: string) {
  const admins = await many(sb(`bot_roles?role=eq.admin&select=chat_id`));
  for (const a of admins) await tgTo(a.chat_id, text);
  const grp = (gym.settings as Row)?.staff_group_chat_id;
  if (grp) await tgTo(String(grp), text);
}

// ---------------- lead state ----------------

interface Memory {
  booking: { id: string; slot_iso: string; booked_at: string; rescheduled_times?: number } | null;
  pending: { kind: "book" | "reschedule" | "cancel"; slot_iso?: string; proposed_at: string; nudged?: boolean } | null;
  preferences: { dayparts: string[]; days: string[]; notes: string[] };
  answered: string[];
  facts: string[];
  objections: string[];
  outcomes: { booking_id: string | null; outcome: string; at: string }[];
  reminders: string[];
  summary: string;
  last_intent?: string;
  turns: number;
}
function memoryOf(lead: Row): Memory {
  const m = (lead.memory ?? {}) as Partial<Memory>;
  return {
    booking: m.booking ?? null, pending: m.pending ?? null,
    preferences: m.preferences ?? { dayparts: [], days: [], notes: [] },
    answered: m.answered ?? [], facts: m.facts ?? [], objections: m.objections ?? [],
    outcomes: m.outcomes ?? [], reminders: m.reminders ?? [], summary: m.summary ?? "", last_intent: m.last_intent, turns: m.turns ?? 0,
  };
}
async function saveMemory(lead: Row, mem: Memory) {
  await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({ memory: mem, updated_at: new Date().toISOString() }) });
  lead.memory = mem;
}
function stateBlock(lead: Row, mem: Memory): string {
  const lines: string[] = [];
  lines.push(`Lead: ${lead.first_name}, source ${lead.source}, stage ${lead.current_stage}, turns so far ${mem.turns}.`);
  lines.push(mem.booking ? `CURRENT BOOKING: free trial ${fmtSlot(mem.booking.slot_iso)} (booking ${mem.booking.id.slice(0, 8)}).` : "CURRENT BOOKING: none.");
  if (mem.pending) {
    lines.push(mem.pending.kind === "cancel"
      ? "WAITING FOR: the lead to confirm they want to cancel the booking above."
      : `WAITING FOR: a yes or no to the proposed ${mem.pending.kind === "reschedule" ? "new time" : "time"} ${fmtSlot(mem.pending.slot_iso!)}.`);
  } else lines.push("WAITING FOR: nothing.");
  if (mem.preferences.dayparts.length || mem.preferences.days.length || mem.preferences.notes.length) lines.push(`Preferences: ${[...mem.preferences.days, ...mem.preferences.dayparts, ...mem.preferences.notes].join("; ")}.`);
  if (mem.answered.length) lines.push(`Already answered: ${mem.answered.join(", ")}.`);
  if (mem.facts.length) lines.push(`What they told us: ${mem.facts.join("; ")}.`);
  if (mem.objections.length) lines.push(`Objections raised: ${mem.objections.join("; ")}.`);
  if (mem.outcomes.length) lines.push(`Visit history: ${mem.outcomes.map((o) => `${o.outcome} on ${fmtDay(o.at)}`).join("; ")}.`);
  if (mem.summary) lines.push(`Summary so far: ${mem.summary}`);
  return lines.join("\n");
}

async function journey(lead_id: string, action: string, stage: string, from_stage: string | null, message?: string, metadata: Row = {}) {
  await sb("lead_journey", { method: "POST", body: JSON.stringify({ lead_id, action, stage, from_stage, channel: "sim", message: message?.slice(0, 500), metadata }) });
}
async function setStage(lead: Row, to: string, action: string, msg?: string) {
  const from = String(lead.current_stage ?? "new");
  if (from === to) return;
  await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({ current_stage: to, updated_at: new Date().toISOString() }) });
  await journey(String(lead.id), action, to, from, msg);
  lead.current_stage = to;
}

const isDemo = (lead: Row) => (lead.metadata as Row | undefined)?.demo === true;

async function sendToLead(_gym_id: string, lead: Row, conversation_id: string, body: string, meta: { ai_model?: string; purpose?: string; template?: string } = {}) {
  const phone = String(lead.phone_e164 ?? lead.phone ?? "");
  const opted = phone ? await many(sb(`messaging_optouts?phone=eq.${encodeURIComponent(phone)}&select=phone`)) : [];
  if (opted.length) return { sent: false, reason: "opted_out" };

  if (isDemo(lead)) {
    await sb("messages", { method: "POST", body: JSON.stringify({ conversation_id, direction: "outbound", content: body, channel: "sim", ai_model: meta.ai_model ?? null, sent_at: new Date().toISOString() }) });
    await sb(`conversations?id=eq.${conversation_id}`, { method: "PATCH", body: JSON.stringify({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
    return { sent: true, channel: "sim" };
  }

  // Real person: the only way out is gymiq-dispatch, which owns the gates and the
  // WhatsApp > SMS > email order. It logs the message itself on success, and logs
  // it as suppressed on refusal, so the thread is complete either way.
  const r = await fetch(`${FN}/gymiq-dispatch?route=send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-desk-key": await internalKey() },
    body: JSON.stringify({ lead_id: lead.id, body, purpose: meta.purpose ?? "reply", template: meta.template }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.sent) return { sent: true, channel: j.channel, mode: j.mode };
  return { sent: false, reason: j.suppressed ?? j.error ?? "dispatch refused", attempts: j.attempts };
}

// Every message the lead has exchanged with us, across every channel, oldest first.
async function historyFor(lead: Row, limit = 40): Promise<{ role: string; content: string }[]> {
  const convs = await many(sb(`conversations?lead_id=eq.${lead.id}&select=id`));
  if (!convs.length) return [];
  const ids = convs.map((c: Row) => c.id).join(",");
  const rows = await many(sb(`messages?conversation_id=in.(${ids})&reply_category=is.null&order=created_at.desc&limit=${limit}&select=direction,content,content_type`));
  return rows.reverse()
    .filter((m: Row) => m.direction === "inbound" || m.direction === "outbound")
    .map((m: Row) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: String(m.content) }));
}

// Any conversation for this lead to hang sim messages and bookings on; create one if none.
// deno-lint-ignore no-explicit-any
async function anyConversation(gym_id: string, lead: Row): Promise<any> {
  const c = await one(sb(`conversations?lead_id=eq.${lead.id}&order=last_message_at.desc&limit=1&select=id`));
  if (c) return c;
  return await one(sb("conversations", { method: "POST", body: JSON.stringify({ gym_id, lead_id: lead.id, phone: lead.phone_e164 ?? lead.phone ?? `lead:${lead.id}`, channel: isDemo(lead) ? "sim" : "ai", status: "open", context: {} }) }));
}

function firstTouch(lead: Row): string {
  const name = String(lead.first_name ?? "there");
  const opener = String(lead.source) === "abandoned_cart"
    ? `Hi ${name}, it looks like you started joining ${CLUB} online but didn't finish. No problem at all, I've saved where you got to.`
    : `Hi ${name}, thanks for your interest in ${CLUB}! I've reserved a free trial visit for you.`;
  return `${opener}\n\nWould you like to come in for a look around? We have availability tomorrow morning, afternoon and evening. What works best for you?\n\n${CLUB}\nReply STOP to opt out.`;
}

// Pricing is read from gyms.knowledge_base.pricing so a price change is a row
// update, not a redeploy. The literal below is only the fallback.
function pricingLine(gym: Row): string {
  const kb = (gym.knowledge_base ?? {}) as Row;
  const plans = (kb.pricing as Row | undefined)?.plans as { name: string; monthly: number; includes?: string }[] | undefined;
  if (plans && plans.length) {
    const parts = plans.map((p) => `${p.name} £${Number(p.monthly).toFixed(2)}/month${p.includes ? ", " + p.includes : ""}`);
    return `- Memberships: ${parts.join(". ")}. No-contract, cancel-anytime culture. Annual/paid-up-front options, joining fees and current promotions: DO NOT quote, say the team will confirm.`;
  }
  return `- Memberships: Classic £31.99/month. WOW £36.99/month, adds all classes, Recovery Zone and multi-gym access. EPIC £49.99/month. No-contract, cancel-anytime culture. Annual/paid-up-front options, joining fees and current promotions: DO NOT quote, say the team will confirm.`;
}
const knowledge = (gym: Row) => `FACTS ABOUT ${CLUB.toUpperCase()} (never invent beyond these):
${pricingLine(gym)}
- Free trial visits available; tours take about 20 minutes. Bring yourself, water and trainers.
- Recovery Zone: dedicated in-club space for performance recovery and relaxation between sessions.
- Website: https://energiefitness.com/gym/hoddesdon
- If asked about anything not listed (parking, sauna, pool, specific classes, PT prices): say you'll have a team member confirm, never guess.`;

// ---------------- pass 1: understand ----------------

interface Understanding {
  intent: "answer" | "request_slot" | "confirm" | "decline" | "cancel_booking" | "ask_availability" | "bot_question" | "handover" | "optout" | "not_interested" | "small_talk";
  slot_iso?: string | null;
  slot_precision?: "exact" | "daypart" | "date_only" | "time_only" | "none";
  question_topics?: string[];
  facts_learned?: string[];
  preferences?: { dayparts?: string[]; days?: string[]; notes?: string[] };
  objection?: string | null;
  note?: string | null;
  summary?: string;
}

function understandSystem(gym: Row, lead: Row, mem: Memory): string {
  const { hours } = hoursFor(gym);
  return `You read one chat message from a potential gym member and classify it. You do not write replies. Output ONLY a JSON object.

STATE OF THIS LEAD (authoritative; the conversation below may be older than this):
${stateBlock(lead, mem)}

CALENDAR (authoritative; use ONLY these dates, never compute weekdays yourself):
${calendarBlock()}
Staffed hours: ${hoursText(hours)}. Current time: ${isoLocal(new Date())} (${TZ}).

INTENTS:
- "request_slot": the lead names a day and/or a time or daypart they want for the trial, including changing an existing booking ("can I do 8am instead", "make it Thursday", "tomorrow morning"). Fill slot_iso as an ISO8601 datetime with the local offset from the calendar. Daypart defaults: morning=10:00, afternoon=14:00, evening=18:00. If they give a time but no day: if there is a CURRENT BOOKING or a proposed time, use that date; otherwise precision="time_only" and give the time on TOMORROW's date. If they give a day but no time: precision="date_only", slot_iso at 10:00 that day. If both: "exact" (or "daypart" when they said morning/afternoon/evening).
- "confirm": a yes to what we are WAITING FOR (yes, ok, that works, go ahead, perfect, book it). Only when something is waiting.
- "decline": a no to what we are WAITING FOR without offering a new time.
- "cancel_booking": they want to cancel or not come to the CURRENT BOOKING (not a membership).
- "ask_availability": asking what times or days are free, without naming one.
- "bot_question": asking if this is a bot, AI, automated, a real person.
- "handover": unhappy, complaint, refund, cancelling an existing membership, asks whether it is safe to train with a condition or needs medical clearance, wants a human or manager. An injury mentioned in passing is NOT a handover; record it in facts_learned.
PRIORITY: if the message asks to cancel, move or book the trial, that intent wins over everything except optout, even when they also mention an injury, a question or a complaint; put the rest in facts_learned, question_topics or objection.
- "optout": asks not to be messaged again.
- "not_interested": says no thanks, not interested, no longer looking.
- "answer": a question about the club (price, hours, classes, facilities, parking, PT, joining) or a message that needs a reply and none of the above.
- "small_talk": thanks, greetings, ok with nothing waiting.
A message can carry a question AND a slot request; then intent is "request_slot" and question_topics lists the question.

ALSO EXTRACT:
- question_topics: short tags for anything asked (price, hours, classes, parking, pt, joining_fee, contract, facilities).
- facts_learned: things the lead told us about themselves (goal, schedule, injuries, who they train with, where they heard of us). Short phrases. Empty if none.
- preferences: dayparts (morning/afternoon/evening), days (weekday names), notes (e.g. "after 6pm only", "not Mondays").
- objection: a reason they hesitate (too expensive, too far, no time, contract) or null.
- note: one line for staff when intent is handover, else null.
- summary: one sentence, the whole relationship so far, updated to include this message.

Output exactly: {"intent":"...","slot_iso":null|"...","slot_precision":"none|exact|daypart|date_only|time_only","question_topics":[],"facts_learned":[],"preferences":{"dayparts":[],"days":[],"notes":[]},"objection":null,"note":null,"summary":"..."}`;
}

// ---------------- pass 2: write ----------------

const KNOWN_TOPICS = ["price", "cost", "membership", "fee", "class", "hour", "open", "trial", "tour", "contract", "recovery", "cancel", "bring", "join"];

function writeSystem(gym: Row, lead: Row, mem: Memory, resolution: string): string {
  const { hours } = hoursFor(gym);
  return `You are the assistant for ${CLUB}, a well-trusted community gym, replying to a potential member over chat (SMS-style: short).

IDENTITY RULES: You represent the club team. Do not volunteer that you are automated and never sign with a personal name or invent one. If the person DIRECTLY asks whether they are talking to a bot or an AI, do not lie: say you are the club's automated assistant and a real team member is available any time, then carry on. Friendly, natural, concise. No emojis. Never use em dashes or en dashes; use commas, colons or full stops. UK English. Under 60 words. Use the lead's first name at most once.

${knowledge(gym)}
- Staffed hours: ${hoursText(hours)}.

WHAT WE KNOW ABOUT THIS LEAD:
${stateBlock(lead, mem)}

WHAT JUST HAPPENED ON OUR SIDE (authoritative; your reply must say exactly this and nothing more about bookings):
${resolution}

Never say a trial is booked, moved or cancelled unless the line above says it was. Never invent times or availability beyond the line above. For health, injury or medical questions give no advice: say the team will talk it through on the day and they can go at their own pace. If it says to ask a question, ask it once and stop. Output the reply text only, no JSON, no quotes.`;
}

async function claude(system: string, messages: { role: string; content: string }[], gym_id: string, task: string, max_tokens = 400): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens, system, messages }),
  });
  const ai = await res.json();
  const raw = ai?.content?.[0]?.text ?? "";
  const inTok = ai?.usage?.input_tokens ?? 0, outTok = ai?.usage?.output_tokens ?? 0;
  await sb("ai_cost_log", { method: "POST", body: JSON.stringify({ gym_id, model: MODEL, task, input_tokens: inTok, output_tokens: outTok, cost_usd: (inTok * 1 + outTok * 5) / 1e6 }) });
  return String(raw);
}
function extractJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json?/gi, "").replace(/```/g, "");
  const s = cleaned.indexOf("{"), e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)) as T; } catch { /* fall through */ } }
  return null;
}
const clean = (s: string) => s.replace(/—|–/g, ",").replace(/^["']|["']$/g, "").trim();

// Deterministic fallbacks so the lead always gets a correct message even if the writer fails.
function fallbackReply(res: Resolution, lead: Row): string {
  const n = String(lead.first_name ?? "");
  switch (res.kind) {
    case "proposed": return `I can do ${fmtSlot(res.slot!)}. Shall I book that for you, ${n}?`;
    case "proposed_reschedule": return `I can move you from ${fmtSlot(res.from!)} to ${fmtSlot(res.slot!)}. Shall I make that change?`;
    case "booked": return `Done, you are booked in for ${fmtSlot(res.slot!)}. Just bring yourself, water and trainers, and ask for the team at reception. See you then, ${n}.`;
    case "rescheduled": return `All changed. Your free trial is now ${fmtSlot(res.slot!)}, and the ${fmtSlot(res.from!)} slot is released. See you then, ${n}.`;
    case "cancel_proposed": return `No problem. Just to check, shall I cancel your trial on ${fmtSlot(res.from!)}? You can rebook any time.`;
    case "cancelled": return `Your trial on ${fmtSlot(res.from!)} is cancelled. Whenever you would like to come in, just reply with a day and I will sort it.`;
    case "unavailable": return `${res.reason} ${res.alternatives!.length ? `Closest I can do: ${res.alternatives!.map(fmtSlot).join(", ")}. Any of those?` : "Which other day would suit?"}`;
    case "need_time": return `${fmtDay(res.slot!)} works. Morning, afternoon or evening, or a time if you have one?`;
    case "need_day": return `Which day suits you for ${fmtTime(res.slot!)}?`;
    case "nothing_pending": return `Happy to sort that. Which day suits you, and morning, afternoon or evening?`;
    case "declined": return `No problem. Which day and time would suit better?`;
    default: return `Happy to help. Which day suits you for a free look around, and morning, afternoon or evening?`;
  }
}

interface Resolution {
  kind: "proposed" | "proposed_reschedule" | "booked" | "rescheduled" | "cancel_proposed" | "cancelled" | "unavailable" | "need_time" | "need_day" | "nothing_pending" | "declined" | "answer" | "availability" | "bot" | "handover" | "optout" | "not_interested";
  slot?: Date; from?: Date; alternatives?: Date[]; reason?: string; text?: string;
}
function describe(res: Resolution, mem: Memory): string {
  switch (res.kind) {
    case "proposed": return `We can offer ${fmtSlot(res.slot!)} and it is free. NOTHING IS BOOKED YET. Ask the lead to confirm that time with a yes before it is booked. One short question.`;
    case "proposed_reschedule": return `The lead has a booking at ${fmtSlot(res.from!)}. The new time ${fmtSlot(res.slot!)} is free. NOTHING HAS CHANGED YET. Ask them to confirm the move with a yes.`;
    case "booked": return `The trial IS NOW BOOKED for ${fmtSlot(res.slot!)}. Confirm it as done, say to bring themselves, water and trainers and ask for the team at reception. Tours take about 20 minutes.`;
    case "rescheduled": return `The booking HAS BEEN MOVED from ${fmtSlot(res.from!)} to ${fmtSlot(res.slot!)}. Confirm the new time as done and that the old slot is released. Nothing else.`;
    case "cancel_proposed": return `The lead has a booking at ${fmtSlot(res.from!)} and seems to want to cancel. NOTHING IS CANCELLED YET. Ask them to confirm the cancellation, and mention they can rebook any time.`;
    case "cancelled": return `The booking at ${fmtSlot(res.from!)} IS NOW CANCELLED. Confirm that, no guilt, and say they can reply with a day whenever they want to come in.`;
    case "unavailable": return `The time they asked for is not available: ${res.reason} ${res.alternatives!.length ? `The closest free times are: ${res.alternatives!.map(fmtSlot).join("; ")}. Offer exactly these and ask which they prefer.` : "Ask which other day would suit."} NOTHING IS BOOKED.`;
    case "need_time": return `They named ${fmtDay(res.slot!)} but not a time. Ask morning, afternoon or evening, or an exact time. NOTHING IS BOOKED.`;
    case "need_day": return `They named ${fmtTime(res.slot!)} but not a day and there is no booking to attach it to. Ask which day. NOTHING IS BOOKED.`;
    case "nothing_pending": return `They said yes but there was nothing waiting to confirm. Ask which day and time of day they would like. NOTHING IS BOOKED.`;
    case "declined": return `They turned down the proposed time. Nothing is booked or changed. Ask what would suit better.`;
    case "availability": return `They asked what is free. Say we have mornings, afternoons and evenings across the week within staffed hours; do not list exact slots. Ask which day and time of day suits. ${mem.booking ? `Remind them they already have ${fmtSlot(mem.booking.slot_iso)} booked if relevant.` : ""}`;
    case "bot": return `They asked if this is a bot. Answer honestly per the identity rules, then bring it back to ${mem.booking ? "their booking or any questions" : "getting a day and time for a free visit"}.`;
    case "handover": return `A team member will call them today. Apologise briefly if they are unhappy, say a person will be in touch today, stop selling.`;
    case "optout": return `They asked not to be messaged. Acknowledge in one line and stop. No questions.`;
    case "not_interested": return `They are not interested. Thank them, leave the door open in one line, no questions, no pressure.`;
    default: {
      const pendingLine = mem.pending?.kind === "cancel" && mem.booking ? `The cancellation of ${fmtSlot(mem.booking.slot_iso)} is NOT done yet; it is still waiting for their yes or no, say so.`
        : mem.pending?.slot_iso ? `Then remind them ${fmtSlot(mem.pending.slot_iso)} is still waiting for their yes; nothing is booked or changed yet.`
        : mem.booking ? `They are booked for ${fmtSlot(mem.booking.slot_iso)}; do not ask them to book again.`
        : "Then ask which day and time of day suits for a free visit, once.";
      return `Answer their message from the facts. Nothing about the booking changed on this turn. ${pendingLine}`;
    }
  }
}

// ---------------- bookings ----------------

function makeIcs(lead: Row, slotIso: string, bookingId: string, summary: string): string {
  const dt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(slotIso), end = new Date(start.getTime() + 30 * 60_000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//gymIQ//lead-engine//EN", "METHOD:REQUEST", "BEGIN:VEVENT",
    `UID:${bookingId}@gymiq.ai`, `SEQUENCE:${Math.floor(Date.now() / 1000) % 100000}`, `DTSTAMP:${dt(new Date())}`, `DTSTART:${dt(start)}`, `DTEND:${dt(end)}`,
    `SUMMARY:${summary}`, `DESCRIPTION:Booked by gymIQ. Phone ${lead.phone}. Source ${lead.source}.`,
    `LOCATION:${CLUB}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
// One-tap links the team can use from the booking email to mark the outcome. No login.
async function markLinks(lead: Row, bookingId: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  await sb("outcome_tokens", { method: "POST", body: JSON.stringify({ token, lead_id: lead.id, booking_id: bookingId, expires_at: new Date(Date.now() + 14 * 86400_000).toISOString() }) });
  const base = `${FN}/gymiq-lead-engine?route=mark&token=${token}&outcome=`;
  return `Attended: ${base}showed\nNo-show: ${base}no_show\nJoined: ${base}joined`;
}

async function fanOut(gym: Row, lead: Row, slotIso: string, bookingId: string, what: "booked" | "rescheduled" | "cancelled", fromIso?: string) {
  const nice = fmtSlot(slotIso);
  const headline = what === "booked" ? `BOOKED: ${lead.first_name}, free trial ${nice}.`
    : what === "rescheduled" ? `MOVED: ${lead.first_name}, free trial now ${nice} (was ${fmtSlot(fromIso!)}).`
    : `CANCELLED: ${lead.first_name}, free trial ${nice}. Slot released.`;
  await alertStaff(gym, `gymIQ${isDemo(lead) ? " (SIM)" : ""}\n${headline}\nConfirmed by the lead in chat. Booking ${bookingId.slice(0, 8)}.`);
  if (!isDemo(lead)) {
    // Real lead: email + SMS to the team through dispatch, with the mark-outcome links.
    const links = what === "cancelled" ? "" : await markLinks(lead, bookingId);
    await fetch(`${FN}/gymiq-dispatch?route=notify-team`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-desk-key": await internalKey() },
      body: JSON.stringify({ lead_id: lead.id, event: what, headline, detail: `Confirmed by the lead in chat.${links ? "\n\nAfter the visit, tap one:\n" + links : ""}` }),
    }).catch(() => null);
    if (what === "cancelled" || what === "rescheduled") {
      await fetch(`${SB_URL}/rest/v1/rpc/lead_followups_enqueue`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_gym: gym.id, p_lead: lead.id, p_booking: bookingId, p_event: what }) }).catch(() => null);
    }
  }
  const settings = (gym.settings ?? {}) as Row;
  const to = settings.alert_email ? String(settings.alert_email) : "";
  if (RESEND_KEY && to) {
    const ics = makeIcs(lead, slotIso, bookingId, `${what === "cancelled" ? "CANCELLED: " : ""}Free trial: ${lead.first_name} (gymIQ)`);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: String(settings.alert_from ?? "gymIQ <alerts@gymiq.ai>"), to: [to],
        subject: `${what === "booked" ? "Free trial booked" : what === "rescheduled" ? "Free trial moved" : "Free trial cancelled"}: ${lead.first_name}, ${nice}`,
        text: `${headline}\n\nName: ${lead.first_name}\nPhone: ${lead.phone}\nSource: ${lead.source}\n\nCalendar file attached. Mark the outcome on the gymIQ board after the visit.`,
        attachments: [{ filename: "free-trial.ics", content: btoa(ics) }],
      }),
    }).catch(() => null);
    await journey(String(lead.id), r && r.ok ? "email_alert_sent" : "email_alert_failed", String(lead.current_stage), null, `${what} to ${to}`);
  }
}

async function createBooking(gym: Row, lead: Row, conv_id: string, slot: Date, rescheduledFrom?: string): Promise<Row> {
  return await one(sb("bookings", { method: "POST", body: JSON.stringify({ gym_id: gym.id, lead_id: lead.id, conversation_id: conv_id, slot_at: slot.toISOString(), kind: "free_trial", source: "ai", status: "booked", confirmed_by_lead: true, rescheduled_from: rescheduledFrom ?? null }) }));
}

// Parse the model's slot into a Date, defensively.
function slotDate(u: Understanding): Date | null {
  if (!u.slot_iso) return null;
  const d = new Date(u.slot_iso);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ---------------- routes ----------------

async function routeLead(b: Row) {
  if (b.company_url_hp) return J({ ok: true });
  const gym = await gymRow(); const gym_id = String(gym.id);
  const first_name = String(b.first_name ?? "").slice(0, 80) || "there";
  const phone = String(b.phone ?? "").slice(0, 30) || `+44700900${String(Date.now()).slice(-4)}`;
  const source = ["free_trial", "abandoned_cart", "website", "walk_in", "phone"].includes(String(b.source)) ? String(b.source) : "free_trial";
  // Memory of a returning lead: same phone, same club.
  const previous = await one(sb(`leads?gym_id=eq.${gym_id}&phone=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=1&select=id,memory,current_stage`));
  const inherited: Partial<Memory> = previous?.memory ? { facts: previous.memory.facts ?? [], objections: previous.memory.objections ?? [], outcomes: previous.memory.outcomes ?? [], preferences: previous.memory.preferences, summary: previous.memory.summary ? `Returning lead. Previously: ${previous.memory.summary}` : "" } : {};
  const mem: Memory = { ...memoryOf({ memory: inherited }), booking: null, pending: null, turns: 0 };
  const lead = await one(sb("leads", { method: "POST", body: JSON.stringify({ gym_id, first_name, phone, email: b.email ? String(b.email).slice(0, 200) : null, source, stage: "lead", current_stage: "new", score: source === "abandoned_cart" ? 70 : 50, memory: mem, metadata: { demo: true, interest: String(b.interest ?? "").slice(0, 200), returning: !!previous } }) }));
  await journey(lead.id, "created", "new", null, `source=${source}${previous ? ", returning lead, memory inherited" : ""}`);
  const conv = await one(sb("conversations", { method: "POST", body: JSON.stringify({ gym_id, lead_id: lead.id, phone, channel: "sim", context: { demo: true } }) }));
  const ft = firstTouch(lead);
  await sendToLead(gym_id, lead, conv.id, ft);
  await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({ current_stage: "contacted", contact_attempts: 1, last_contact_at: new Date().toISOString(), last_contact_channel: "sim" }) });
  await journey(lead.id, "first_touch", "contacted", "new", ft.slice(0, 200));
  await startNoReplySequence(gym_id, lead);
  await alertStaff(gym, `gymIQ lead engine (SIM)\nNew lead: ${first_name} · ${source}${previous ? " (returning, history loaded)" : ""}\nFirst touch sent instantly. Watching for a reply.`);
  return J({ ok: true, lead_id: lead.id, conversation_id: conv.id, first_touch: ft, returning: !!previous });
}

// A lead that already exists (Glofox pull, website capture) gets its opener.
// Real leads: the opener goes out as the WhatsApp trial_invite template when the
// window is shut (always, on a first touch), falling to SMS then email.
async function routeFirstTouch(b: Row) {
  const gym = await gymRow(); const gym_id = String(gym.id);
  const lead = await one(sb(`leads?id=eq.${b.lead_id}&select=*`));
  if (!lead) return J({ ok: false, error: "unknown lead" }, 404);
  if (lead.first_touch_at && !b.force) return J({ ok: true, skipped: "already touched", at: lead.first_touch_at });
  if (["opted_out", "joined", "dead"].includes(String(lead.current_stage))) return J({ ok: true, skipped: `stage ${lead.current_stage}` });

  // Memory of a returning lead: same mobile, same club, an earlier record.
  const phone = String(lead.phone_e164 ?? lead.phone ?? "");
  const previous = phone ? await one(sb(`leads?gym_id=eq.${gym_id}&phone_e164=eq.${encodeURIComponent(phone)}&id=neq.${lead.id}&order=created_at.desc&limit=1&select=id,memory`)) : null;
  const inherited: Partial<Memory> = previous?.memory ? { facts: previous.memory.facts ?? [], objections: previous.memory.objections ?? [], outcomes: previous.memory.outcomes ?? [], preferences: previous.memory.preferences, summary: previous.memory.summary ? `Returning lead. Previously: ${previous.memory.summary}` : "" } : {};
  const mem: Memory = { ...memoryOf({ memory: inherited }), ...memoryOf(lead), booking: null, pending: null, turns: 0 };
  await saveMemory(lead, mem);

  const conv = await anyConversation(gym_id, lead);
  const ft = firstTouch(lead);
  const r = await sendToLead(gym_id, lead, conv.id, ft, { purpose: "first_touch", template: "trial_invite" });
  if (!r.sent) {
    await journey(String(lead.id), "first_touch_suppressed", String(lead.current_stage), null, String(r.reason ?? "").slice(0, 200));
    return J({ ok: true, sent: false, reason: r.reason, attempts: r.attempts });
  }
  await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({ current_stage: "contacted", metadata: { ...(lead.metadata ?? {}), needs_first_touch: false } }) });
  await journey(String(lead.id), "first_touch", "contacted", String(lead.current_stage), `${r.channel}${r.mode ? " " + r.mode : ""}`);
  await startNoReplySequence(gym_id, lead);
  await alertStaff(gym, `gymIQ\nNew lead: ${lead.first_name ?? "?"} · ${lead.source}${previous ? " (returning, history loaded)" : ""}\nFirst touch sent by ${r.channel}. Watching for a reply.`);
  return J({ ok: true, sent: true, channel: r.channel, mode: r.mode });
}

async function startNoReplySequence(gym_id: string, lead: Row) {
  const seq = await one(sb("sequences?name=eq.lead-no-reply&select=id,steps")) ??
    await one(sb("sequences", { method: "POST", body: JSON.stringify({ gym_id, name: "lead-no-reply", status: "active", description: "Nudge leads who never replied to the first touch", steps: [{ wait_minutes: 60 }, { wait_minutes: 1440 }] }) }));
  const steps = (seq.steps ?? [{ wait_minutes: 60 }]) as { wait_minutes: number }[];
  const waitMs = isDemo(lead) ? 60_000 : Number(steps[0]?.wait_minutes ?? 60) * 60_000;
  await sb("lead_sequence_runs", { method: "POST", body: JSON.stringify({ sequence_id: seq.id, lead_id: lead.id, gym_id, status: "pending", current_step: 0, trigger: "no_reply", next_send_at: new Date(Date.now() + waitMs).toISOString(), contacted_at: new Date().toISOString() }) });
}

// Ingested leads that have not had their opener yet (glofox-leads-pull sets needs_first_touch).
async function routeFirstTouchDue() {
  const gym = await gymRow(); const gym_id = String(gym.id);
  const due = await many(sb(`leads?gym_id=eq.${gym_id}&metadata->>needs_first_touch=eq.true&first_touch_at=is.null&current_stage=eq.new&order=created_at.asc&limit=10&select=id,first_name`));
  const out: unknown[] = [];
  for (const l of due) {
    const r = await routeFirstTouch({ lead_id: l.id });
    out.push({ lead: l.first_name, ...(await r.json()) });
  }
  return J({ ok: true, processed: out });
}

async function routeReply(b: Row) {
  const gym = await gymRow(); const gym_id = String(gym.id);
  let lead: Row | null = null;
  if (b.lead_id) lead = await one(sb(`leads?id=eq.${b.lead_id}&select=*`));
  else if (b.phone) {
    const ph = String(b.phone).replace(/^whatsapp:/, "");
    lead = await one(sb(`leads?gym_id=eq.${gym_id}&phone_e164=eq.${encodeURIComponent(ph)}&order=created_at.desc&limit=1&select=*`));
  }
  if (!lead) return J({ ok: false, error: "unknown lead" }, 404);
  const conv = await anyConversation(gym_id, lead);
  const text = String(b.text ?? "").slice(0, 1000).trim();
  if (!text) return J({ ok: false, error: "empty" }, 400);
  const mem = memoryOf(lead);
  mem.turns += 1;

  // The Twilio webhook (gymiq-messaging) has already logged a real inbound; only demo replies are logged here.
  if (!b.already_logged) await sb("messages", { method: "POST", body: JSON.stringify({ conversation_id: conv.id, direction: "inbound", content: text, channel: isDemo(lead) ? "sim" : String(b.channel ?? "whatsapp") }) });
  await sb(`lead_sequence_runs?lead_id=eq.${lead.id}&status=eq.pending`, { method: "PATCH", body: JSON.stringify({ status: "replied", replied_at: new Date().toISOString() }) });
  if (lead.current_stage === "contacted") await setStage(lead, "replied", "lead_replied", text);

  // Hard rule, no model needed.
  if (/^\s*stop\s*[.!]?\s*$/i.test(text)) {
    await sb("messaging_optouts", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ phone: lead.phone, reason: "lead said STOP" }) });
    await setStage(lead, "opted_out", "optout", "STOP");
    mem.last_intent = "optout"; await saveMemory(lead, mem);
    const reply = "No problem, you won't hear from us again. You're always welcome at the club.";
    await sendToLead(gym_id, lead, conv.id, reply);
    return J({ ok: true, reply, stage: "opted_out", action: "optout", resolution: "optout", memory: mem });
  }

  // Pass 1: understand.
  const msgs = await historyFor(lead);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") msgs.push({ role: "user", content: text });
  const raw1 = await claude(understandSystem(gym, lead, mem), msgs, gym_id, "lead_engine_understand", 500);
  const u: Understanding = extractJson<Understanding>(raw1) ?? { intent: "answer", summary: mem.summary };
  await journey(String(lead.id), "understood", String(lead.current_stage), null, `${u.intent}${u.slot_iso ? ` ${u.slot_iso} (${u.slot_precision})` : ""}`, { understanding: u });

  // Merge what we learned into memory.
  const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean).map((s) => String(s).trim().toLowerCase()))).slice(0, 20);
  mem.answered = uniq([...mem.answered, ...(u.question_topics ?? [])]);
  mem.facts = uniq([...mem.facts, ...(u.facts_learned ?? [])]);
  if (u.objection) mem.objections = uniq([...mem.objections, u.objection]);
  mem.preferences = {
    dayparts: uniq([...mem.preferences.dayparts, ...(u.preferences?.dayparts ?? [])]),
    days: uniq([...mem.preferences.days, ...(u.preferences?.days ?? [])]),
    notes: uniq([...mem.preferences.notes, ...(u.preferences?.notes ?? [])]),
  };
  if (u.summary) mem.summary = String(u.summary).slice(0, 300);
  mem.last_intent = u.intent;

  // A repeated ask is a yes: "yes please cancel" while a cancel is waiting, or
  // naming the very slot we just proposed.
  if (u.intent === "cancel_booking" && mem.pending?.kind === "cancel") u.intent = "confirm";
  if (u.intent === "request_slot" && mem.pending?.slot_iso && slotDate(u) && Math.abs(new Date(mem.pending.slot_iso).getTime() - slotDate(u)!.getTime()) < 30 * 60000) u.intent = "confirm";

  // Server resolves the intent against real state.
  let res: Resolution = { kind: "answer" };
  let action = "none";
  const hasBooking = !!mem.booking;
  const slot = slotDate(u);

  if (u.intent === "optout") {
    await sb("messaging_optouts", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ phone: lead.phone, reason: "asked in conversation" }) });
    await setStage(lead, "opted_out", "optout", text); res = { kind: "optout" }; action = "optout";
  } else if (u.intent === "handover") {
    await setStage(lead, "handover", "human_handover", u.note ?? text); res = { kind: "handover" }; action = "handover";
    await alertStaff(gym, `gymIQ lead engine (SIM)\nHANDOVER: ${lead.first_name} needs a human.\nReason: ${u.note ?? text.slice(0, 120)}${mem.booking ? `\nHas a trial booked ${fmtSlot(mem.booking.slot_iso)}.` : ""}`);
  } else if (u.intent === "not_interested") {
    if (!hasBooking) await setStage(lead, "cold", "not_interested", text);
    res = { kind: "not_interested" };
  } else if (u.intent === "bot_question") {
    res = { kind: "bot" };
  } else if (u.intent === "ask_availability") {
    res = { kind: "availability" };
  } else if (u.intent === "cancel_booking") {
    if (mem.booking) { mem.pending = { kind: "cancel", proposed_at: new Date().toISOString() }; res = { kind: "cancel_proposed", from: new Date(mem.booking.slot_iso) }; await journey(String(lead.id), "cancel_proposed", String(lead.current_stage), null, mem.booking.slot_iso); }
    else res = { kind: "nothing_pending" };
  } else if (u.intent === "decline") {
    if (mem.pending) { await journey(String(lead.id), "proposal_declined", String(lead.current_stage), null, mem.pending.slot_iso ?? mem.pending.kind); mem.pending = null; res = { kind: "declined" }; }
    else res = { kind: "answer" };
  } else if (u.intent === "confirm") {
    if (!mem.pending) res = { kind: "nothing_pending" };
    else if (mem.pending.kind === "cancel" && mem.booking) {
      const from = new Date(mem.booking.slot_iso);
      await sb(`bookings?id=eq.${mem.booking.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "lead cancelled in chat", updated_at: new Date().toISOString() }) });
      await journey(String(lead.id), "trial_cancelled", "replied", String(lead.current_stage), mem.booking.slot_iso, { booking_id: mem.booking.id });
      await fanOut(gym, lead, mem.booking.slot_iso, mem.booking.id, "cancelled");
      mem.booking = null; mem.pending = null;
      await setStage(lead, "replied", "back_to_replied_after_cancel");
      res = { kind: "cancelled", from }; action = "cancel";
    } else if (mem.pending.slot_iso) {
      // Re-check the slot at the moment of booking; it may have filled since we proposed it.
      const want = new Date(mem.pending.slot_iso);
      const chk = await checkSlot(gym, want);
      if (!chk.ok) {
        res = { kind: "unavailable", reason: "That time has just been taken.", alternatives: chk.alternatives };
        mem.pending = null;
        await journey(String(lead.id), "slot_unavailable", String(lead.current_stage), null, `${isoLocal(want)} ${chk.why}`);
      } else if (mem.pending.kind === "reschedule" && mem.booking) {
        const old = mem.booking;
        await sb(`bookings?id=eq.${old.id}`, { method: "PATCH", body: JSON.stringify({ status: "rescheduled", updated_at: new Date().toISOString() }) });
        const bk = await createBooking(gym, lead, conv.id, chk.at, old.id);
        mem.booking = { id: String(bk.id), slot_iso: isoLocal(chk.at), booked_at: new Date().toISOString(), rescheduled_times: (old.rescheduled_times ?? 0) + 1 };
        mem.pending = null; mem.reminders = [];
        await journey(String(lead.id), "trial_rescheduled", "booked", String(lead.current_stage), `${old.slot_iso} -> ${mem.booking.slot_iso}`, { from_booking: old.id, to_booking: bk.id });
        await fanOut(gym, lead, mem.booking.slot_iso, String(bk.id), "rescheduled", old.slot_iso);
        res = { kind: "rescheduled", slot: chk.at, from: new Date(old.slot_iso) }; action = "reschedule";
      } else {
        const bk = await createBooking(gym, lead, conv.id, chk.at);
        mem.booking = { id: String(bk.id), slot_iso: isoLocal(chk.at), booked_at: new Date().toISOString(), rescheduled_times: 0 };
        mem.pending = null; mem.reminders = [];
        await setStage(lead, "booked", "trial_booked", mem.booking.slot_iso);
        await fanOut(gym, lead, mem.booking.slot_iso, String(bk.id), "booked");
        res = { kind: "booked", slot: chk.at }; action = "book";
      }
    } else res = { kind: "nothing_pending" };
  } else if (u.intent === "request_slot") {
    if (!slot) res = { kind: "answer" };
    else if (u.slot_precision === "date_only") { res = { kind: "need_time", slot }; mem.pending = null; }
    else if (u.slot_precision === "time_only" && !mem.booking && !mem.pending?.slot_iso) { res = { kind: "need_day", slot }; }
    else {
      // time_only with a booking or proposal: attach the time to that date.
      let want = slot;
      if (u.slot_precision === "time_only") {
        const baseIso = mem.booking?.slot_iso ?? mem.pending!.slot_iso!;
        const bp = partsIn(new Date(baseIso)); const sp = partsIn(slot);
        want = localDate(bp.ymd, sp.h, sp.min);
      }
      const chk = await checkSlot(gym, want);
      if (!chk.ok) {
        const reason = chk.why === "closed" ? `We are not staffed at ${fmtTime(want)} on ${fmtDay(want)}${chk.open ? ` (open ${chk.open[0]} to ${chk.open[1]})` : ""}.`
          : chk.why === "full" ? `${fmtSlot(want)} is already full.`
          : chk.why === "past" ? `${fmtSlot(want)} is too soon to book.`
          : `We can only book up to three weeks ahead.`;
        res = { kind: "unavailable", reason, alternatives: chk.alternatives }; mem.pending = null;
        await journey(String(lead.id), "slot_unavailable", String(lead.current_stage), null, `${isoLocal(want)} ${chk.why}`);
      } else if (mem.booking && Math.abs(new Date(mem.booking.slot_iso).getTime() - chk.at.getTime()) < 60000) {
        res = { kind: "answer" }; // already booked at that time
      } else if (mem.booking) {
        mem.pending = { kind: "reschedule", slot_iso: isoLocal(chk.at), proposed_at: new Date().toISOString() };
        res = { kind: "proposed_reschedule", slot: chk.at, from: new Date(mem.booking.slot_iso) }; action = "propose";
        await journey(String(lead.id), "reschedule_proposed", String(lead.current_stage), null, `${mem.booking.slot_iso} -> ${mem.pending.slot_iso}`);
      } else {
        mem.pending = { kind: "book", slot_iso: isoLocal(chk.at), proposed_at: new Date().toISOString() };
        res = { kind: "proposed", slot: chk.at }; action = "propose";
        await journey(String(lead.id), "slot_proposed", String(lead.current_stage), null, mem.pending.slot_iso);
      }
    }
  }
  await saveMemory(lead, mem);

  // Pass 2: write, from a resolution the model cannot contradict.
  let reply = "";
  try {
    const unknown = (u.question_topics ?? []).map((t) => String(t).toLowerCase()).filter((t) => !KNOWN_TOPICS.some((k) => t.includes(k)));
    const resolution = describe(res, mem) + (unknown.length ? `\nThey also asked about: ${unknown.join(", ")}. We hold NO facts on this. Do not answer it, do not say yes or no; say a team member will confirm when they visit.` : "");
    const raw2 = await claude(writeSystem(gym, lead, mem, resolution), msgs, gym_id, "lead_engine_write", 300);
    reply = clean(raw2).slice(0, 700);
  } catch { reply = ""; }
  const claimsCancelled = /\bcancelled\b/i.test(reply);
  const claimsMoved = /\b(moved|rebooked)\b/i.test(reply);
  const claimsBooked = /\b(booked|all set)\b/i.test(reply);
  const bad = (claimsCancelled && res.kind !== "cancelled")
    || (claimsMoved && res.kind !== "rescheduled")
    || (claimsBooked && !["booked", "rescheduled"].includes(res.kind) && !mem.booking);
  if (!reply || reply.includes("{") || bad) reply = fallbackReply(res, lead);
  await sendToLead(gym_id, lead, conv.id, reply, { ai_model: MODEL });
  return J({ ok: true, reply, stage: lead.current_stage, action, resolution: res.kind, intent: u.intent, memory: mem });
}

// Staff mark what happened after the slot: showed / no_show / joined. Drives branched follow-up.
// The team taps a link from the booking email: ?route=mark&token=...&outcome=showed|no_show|joined
async function routeMark(url: URL) {
  const token = url.searchParams.get("token") ?? "";
  const outcome = url.searchParams.get("outcome") ?? "";
  const html = (msg: string, ok = true) => new Response(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;padding:32px;max-width:480px"><h2 style="color:${ok ? "#166534" : "#991b1b"}">${msg}</h2><p style="color:#555">gymIQ · Energie Fitness Hoddesdon</p></body>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
  const t = await one(sb(`outcome_tokens?token=eq.${encodeURIComponent(token)}&select=*`));
  if (!t) return html("That link is not valid.", false);
  if (t.used_at) return html(`Already marked ${String(t.used_outcome ?? "").replace("_", "-")} on ${new Date(t.used_at).toLocaleString("en-GB", { timeZone: TZ })}.`);
  if (new Date(t.expires_at).getTime() < Date.now()) return html("That link has expired. Mark the outcome on the desk instead.", false);
  if (!["showed", "no_show", "joined"].includes(outcome)) return html("Unknown outcome.", false);
  const r = await routeOutcome({ lead_id: t.lead_id, outcome, booking_id: t.booking_id, by: "email link" });
  const j = await r.json();
  if (!j.ok) return html(j.error ?? "Could not mark that.", false);
  await sb(`outcome_tokens?token=eq.${encodeURIComponent(token)}`, { method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString(), used_outcome: outcome }) });
  return html(`Marked ${outcome.replace("_", "-")}. The follow-up is on its way.`);
}

async function routeOutcome(b: Row) {
  const gym = await gymRow(); const gym_id = String(gym.id);
  const lead = await one(sb(`leads?id=eq.${b.lead_id}&select=*`));
  if (!lead) return J({ ok: false, error: "unknown lead" }, 404);
  const outcome = String(b.outcome ?? "");
  if (!["showed", "no_show", "joined"].includes(outcome)) return J({ ok: false, error: "outcome must be showed|no_show|joined" }, 400);
  const mem = memoryOf(lead);
  const bookingId = mem.booking?.id ?? (await one(sb(`bookings?lead_id=eq.${lead.id}&status=eq.booked&order=created_at.desc&limit=1&select=id`)))?.id ?? null;
  const status = outcome === "no_show" ? "no_show" : outcome === "joined" ? "joined" : "attended";
  if (bookingId) await sb(`bookings?id=eq.${bookingId}`, { method: "PATCH", body: JSON.stringify({ status, outcome_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
  mem.outcomes = [...mem.outcomes, { booking_id: bookingId, outcome, at: new Date().toISOString() }].slice(-10);
  mem.booking = null; mem.pending = null;
  await saveMemory(lead, mem);
  const conv = await one(sb(`conversations?lead_id=eq.${lead.id}&order=created_at.desc&limit=1&select=id`));

  if (outcome === "no_show") {
    await setStage(lead, "no_show", "marked_no_show", "staff marked no-show");
    if (conv) await sendToLead(gym_id, lead, conv.id, `Hi ${lead.first_name}, sorry we missed you today! No problem at all, these things happen. Would you like me to rebook your free trial? Just reply with a day and morning, afternoon or evening.`, { purpose: "after_no_show" });
    await journey(lead.id, "no_show_rebook_sent", "no_show", null, "same-day rebook message");
  } else if (outcome === "showed") {
    await setStage(lead, "showed", "marked_showed", "staff marked attended, did not join on the day");
    if (conv) await sendToLead(gym_id, lead, conv.id, `Hi ${lead.first_name}, it was great to have you in today! How did you find it? If anything would make joining an easy yes, tell me and I'll see what we can do.`, { purpose: "after_visit" });
    await journey(lead.id, "experience_followup_sent", "showed", null, "keep-warm sequence starts; join nudge tomorrow");
  } else {
    await setStage(lead, "joined", "marked_joined", "staff marked joined");
    await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({ converted_at: new Date().toISOString() }) });
    if (conv) await sendToLead(gym_id, lead, conv.id, `Welcome to the club, ${lead.first_name}! You've made a great choice. The team will get you set up with the app and your first sessions. See you in there.`, { purpose: "welcome" });
    await journey(lead.id, "onboarding_handoff", "joined", null, "hand to onboarding flow: welcome call, day-12 induction check");
  }
  if (!isDemo(lead)) {
    // The rule-based follow-ups (attended +4h, +7d if not joined, no-show +2h) queue here; gymiq-dispatch sends them.
    const ev = outcome === "showed" ? "attended" : outcome === "no_show" ? "no_show" : null;
    if (ev) await fetch(`${SB_URL}/rest/v1/rpc/lead_followups_enqueue`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_gym: gym_id, p_lead: lead.id, p_booking: bookingId, p_event: ev }) }).catch(() => null);
  }
  await alertStaff(gym, `gymIQ${isDemo(lead) ? " (SIM)" : ""}\nOUTCOME: ${lead.first_name} marked ${outcome.replace("_", "-")}${b.by ? " via " + b.by : ""}. Follow-up sent.`);
  return J({ ok: true, stage: lead.current_stage, memory: mem });
}

// Timed work: no-reply nudges, unanswered proposals, and the day-before reminder.
async function routeTick() {
  const gym = await gymRow(); const gym_id = String(gym.id);
  const out: unknown[] = [];
  const due = await many(sb(`lead_sequence_runs?status=eq.pending&next_send_at=lte.${new Date().toISOString()}&select=*,leads(*),sequences(steps)&limit=10`));
  for (const run of due) {
    const lead = run.leads;
    if (!lead || ["booked", "handover", "opted_out", "cold", "joined", "showed", "no_show"].includes(lead.current_stage)) {
      await sb(`lead_sequence_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "stopped" }) }); continue;
    }
    const conv = await one(sb(`conversations?lead_id=eq.${lead.id}&order=created_at.desc&limit=1&select=id`));
    if (!conv) { await sb(`lead_sequence_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "stopped" }) }); continue; }
    const step = run.current_step + 1;
    const body = step === 1
      ? `Hi ${lead.first_name}, just checking you saw my last message. Your free trial at ${CLUB} is still reserved. Morning, afternoon or evening: what suits you best this week?`
      : `Hi ${lead.first_name}, last nudge from me, I promise. If you'd still like a free look around the club, just reply with a day and I'll sort it. Otherwise I'll leave you in peace.`;
    await sendToLead(gym_id, lead, conv.id, body, { purpose: "nudge" });
    if (isDemo(lead)) await sb(`leads?id=eq.${lead.id}`, { method: "PATCH", body: JSON.stringify({ contact_attempts: (lead.contact_attempts ?? 1) + 1, last_contact_at: new Date().toISOString() }) });
    await journey(lead.id, `followup_${step}`, lead.current_stage, lead.current_stage, body.slice(0, 200));
    if (step >= MAX_FOLLOWUPS) {
      await sb(`lead_sequence_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "exhausted", current_step: step, outcome: "no_reply", outcome_set_at: new Date().toISOString() }) });
      await setStage(lead, "cold", "went_cold", "no reply after followups");
    } else {
      const steps = (run.sequences?.steps ?? []) as { wait_minutes: number }[];
      const waitMs = isDemo(lead) ? 60_000 : Number(steps[step]?.wait_minutes ?? 1440) * 60_000;
      await sb(`lead_sequence_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ current_step: step, next_send_at: new Date(Date.now() + waitMs).toISOString() }) });
    }
    out.push({ lead: lead.first_name, step });
  }
  // Proposals nobody answered (2 hours), and reminders the day before a trial.
  const active = await many(sb(`leads?gym_id=eq.${gym_id}&current_stage=in.(replied,booked)&select=id,first_name,current_stage,memory&limit=200`));
  for (const lead of active) {
    const mem = memoryOf(lead);
    if (!mem.pending && !mem.booking) continue;
    const conv = await one(sb(`conversations?lead_id=eq.${lead.id}&order=created_at.desc&limit=1&select=id`));
    if (!conv) continue;
    if (mem.pending?.slot_iso && !mem.pending.nudged && Date.now() - new Date(mem.pending.proposed_at).getTime() > 2 * 3600_000) {
      await sendToLead(gym_id, lead, conv.id, `Hi ${lead.first_name}, shall I book you in for ${fmtSlot(mem.pending.slot_iso)}? A quick yes and it's done, or tell me a better time.`, { purpose: "nudge" });
      mem.pending.nudged = true; await saveMemory(lead, mem);
      await journey(lead.id, "proposal_nudged", lead.current_stage, null, mem.pending.slot_iso);
      out.push({ lead: lead.first_name, nudged: true });
    }
    if (mem.booking && !mem.reminders.includes("day_before")) {
      const hoursAway = (new Date(mem.booking.slot_iso).getTime() - Date.now()) / 3600_000;
      if (hoursAway > 0 && hoursAway <= 26) {
        await sendToLead(gym_id, lead, conv.id, `Hi ${lead.first_name}, looking forward to seeing you ${fmtSlot(mem.booking.slot_iso)}. Bring water and trainers and ask for the team at reception. If you need to change the time, just reply here.`, { purpose: "reminder", template: "trial_reminder" });
        mem.reminders.push("day_before"); await saveMemory(lead, mem);
        await journey(lead.id, "reminder_sent", lead.current_stage, null, mem.booking.slot_iso);
        out.push({ lead: lead.first_name, reminder: true });
      }
    }
  }
  return J({ ok: true, processed: out });
}

async function routeBoard() {
  const gym = await gymRow(); const gym_id = String(gym.id);
  const leads = await many(sb(`leads?gym_id=eq.${gym_id}&metadata->>demo=eq.true&order=created_at.desc&limit=40&select=id,first_name,source,current_stage,score,contact_attempts,created_at,phone,memory`));
  const events = await many(sb(`lead_journey?order=created_at.desc&limit=40&select=lead_id,action,stage,from_stage,message,created_at`));
  const bookings = await many(sb(`bookings?gym_id=eq.${gym_id}&order=created_at.desc&limit=20&select=id,lead_id,slot_at,status,rescheduled_from,created_at`));
  return J({ ok: true, leads, events, bookings });
}

async function routeState(leadId: string) {
  const lead = await one(sb(`leads?id=eq.${leadId}&select=id,first_name,source,current_stage,memory,created_at`));
  if (!lead) return J({ ok: false, error: "unknown lead" }, 404);
  const bookings = await many(sb(`bookings?lead_id=eq.${leadId}&order=created_at.asc&select=id,slot_at,status,rescheduled_from,confirmed_by_lead,created_at,outcome_at`));
  const journeyRows = await many(sb(`lead_journey?lead_id=eq.${leadId}&order=created_at.asc&limit=100&select=action,stage,from_stage,message,created_at`));
  return J({ ok: true, lead, memory: memoryOf(lead), bookings, journey: journeyRows });
}

async function routeMessages(leadId: string) {
  const conv = await one(sb(`conversations?lead_id=eq.${leadId}&order=created_at.desc&limit=1&select=id`));
  if (!conv) return J({ ok: true, messages: [] });
  const messages = await many(sb(`messages?conversation_id=eq.${conv.id}&order=created_at.asc&limit=50&select=direction,content,created_at`));
  return J({ ok: true, messages });
}

async function routeSeed() {
  const gym = await gymRow(); const gym_id = String(gym.id);
  const demoLeads = await many(sb(`leads?gym_id=eq.${gym_id}&metadata->>demo=eq.true&select=id`));
  for (const l of demoLeads) {
    await sb(`lead_journey?lead_id=eq.${l.id}`, { method: "DELETE" });
    await sb(`lead_sequence_runs?lead_id=eq.${l.id}`, { method: "DELETE" });
    await sb(`bookings?lead_id=eq.${l.id}`, { method: "DELETE" });
    const convs = await many(sb(`conversations?lead_id=eq.${l.id}&select=id`));
    for (const c of convs) await sb(`messages?conversation_id=eq.${c.id}`, { method: "DELETE" });
    await sb(`conversations?lead_id=eq.${l.id}`, { method: "DELETE" });
    await sb(`leads?id=eq.${l.id}`, { method: "DELETE" });
  }
  const seedDefs: [string, string, string, number][] = [
    ["Sophie", "free_trial", "contacted", 50], ["Marcus", "website", "contacted", 45],
    ["Jade", "abandoned_cart", "replied", 70], ["Tom", "free_trial", "replied", 60],
    ["Priya", "free_trial", "booked", 85], ["Liam", "abandoned_cart", "booked", 80],
    ["Grace", "website", "cold", 20], ["Dev", "phone", "handover", 40],
  ];
  let i = 0;
  for (const [name, source, stg, score] of seedDefs) {
    i++;
    const lead = await one(sb("leads", { method: "POST", body: JSON.stringify({ gym_id, first_name: name, phone: `+4470090011${String(i).padStart(2, "0")}`, source, stage: "lead", current_stage: stg, score, contact_attempts: stg === "cold" ? 3 : 1, metadata: { demo: true, seeded: true } }) }));
    await journey(lead.id, "seeded", stg, null, "synthetic demo lead");
    if (stg === "booked") {
      const slot = new Date(Date.now() + (i + 1) * 26 * 3600_000); slot.setMinutes(0, 0, 0);
      const bk = await one(sb("bookings", { method: "POST", body: JSON.stringify({ gym_id, lead_id: lead.id, slot_at: slot.toISOString(), source: "ai", status: "booked", confirmed_by_lead: true }) }));
      const mem: Memory = { ...memoryOf({}), booking: { id: String(bk.id), slot_iso: isoLocal(slot), booked_at: new Date().toISOString(), rescheduled_times: 0 } };
      await saveMemory(lead, mem);
    }
  }
  return J({ ok: true, seeded: seedDefs.length });
}

// Three ways in: the demo UI's header (demo routes), the desk key or the shared
// job secret (verified in the database), or the service-role key (sibling functions).
async function authed(req: Request): Promise<"demo" | "desk" | "internal" | null> {
  if (req.headers.get("x-gymiq-demo") === DEMO_KEY) return "demo";
  const k = req.headers.get("x-desk-key") ?? req.headers.get("x-sync-secret") ?? "";
  if (!k) return null;
  if (k === SB_KEY || (DESK_KEY && k === DESK_KEY) || k === await internalKey()) return "internal";
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/lead_desk_auth`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_key: k }) });
    return (await r.json()) === true ? "desk" : null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.searchParams.get("route") ?? "";
  // The mark link is authenticated by its single-use token, nothing else.
  if (req.method === "GET" && route === "mark") return await routeMark(url);
  const who = await authed(req);
  if (!who) return J({ ok: false, error: "forbidden" }, 403);
  try {
    if (req.method === "GET" && route === "board") return await routeBoard();
    if (req.method === "GET" && route === "messages") return await routeMessages(url.searchParams.get("lead_id") ?? "");
    if (req.method === "GET" && route === "state") return await routeState(url.searchParams.get("lead_id") ?? "");
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (route === "lead") return await routeLead(b);
      if (route === "reply") return await routeReply(b);
      if (route === "inbound") return await routeReply({ ...b, already_logged: true });
      if (route === "first-touch") return await routeFirstTouch(b);
      if (route === "first-touch-due") return await routeFirstTouchDue();
      if (route === "outcome") return await routeOutcome(b);
      if (route === "tick") return await routeTick();
      if (route === "seed" && who === "demo") return await routeSeed();
    }
    return J({ ok: false, error: "unknown route" }, 404);
  } catch (e) {
    console.error(e);
    return J({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
