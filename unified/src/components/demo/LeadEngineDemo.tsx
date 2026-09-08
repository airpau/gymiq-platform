'use client'

/**
 * Lead engine demo. Fully in the browser, and built the way the live engine
 * is built: the assistant reads what it already knows about the lead (the
 * stored booking, the proposal waiting for a yes, what they have asked and
 * told us), checks real availability before it offers a time, asks the lead
 * to confirm before anything is booked, moves or cancels the stored booking
 * on request, and records every outcome so it never contradicts itself.
 *
 * Nothing here calls a server. The production engine uses a language model
 * for understanding and wording; the rules and the memory are the same.
 */
import { useEffect, useRef, useState } from 'react'
import { Phone, Bubble, now } from './DemoFrame'

type Stage = 'new' | 'contacted' | 'replied' | 'booked' | 'showed' | 'no_show' | 'handover' | 'cold' | 'opted_out'
type BookingStatus = 'booked' | 'rescheduled' | 'cancelled' | 'attended' | 'no_show' | 'joined'
interface Msg { from: 'club' | 'lead' | 'system'; text: string; time?: string }
interface Booking { id: number; at: Date; status: BookingStatus; from?: number }
interface Memory {
  booking: Booking | null
  pending: { kind: 'book' | 'reschedule' | 'cancel'; at?: Date } | null
  asked: string[]
  facts: string[]
  outcomes: string[]
}
interface Lead { name: string; source: string; stage: Stage; memory: Memory }

const CLUB = 'Riverside Fitness'
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const HOURS: Record<number, [number, number]> = { 0: [8, 18], 1: [6, 22], 2: [6, 22], 3: [6, 22], 4: [6, 22], 5: [6, 21], 6: [8, 18] }

const fmt = (d: Date) => d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const fmtDay = (d: Date) => d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const fmtTime = (d: Date) => d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' })
const fmtShort = (d: Date) => d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/* The club's diary. A few slots are already full so availability is real. */
function isFull(d: Date): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dayOffset = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400000)
  const hm = d.getHours() * 60 + d.getMinutes()
  if (dayOffset >= 1 && dayOffset <= 2 && (hm === 18 * 60 || hm === 18 * 60 + 30)) return true
  if (d.getDay() === 6 && hm === 10 * 60) return true
  return false
}
function isOpen(d: Date): boolean {
  const [o, c] = HOURS[d.getDay()]
  const hm = d.getHours() * 60 + d.getMinutes()
  return hm >= o * 60 && hm + 30 <= c * 60
}
function isFree(d: Date): boolean {
  return isOpen(d) && !isFull(d) && d.getTime() > Date.now() + 3600000
}
function alternatives(around: Date): Date[] {
  const out: Date[] = []
  const cands: Date[] = []
  for (let day = 0; day < 3; day++) {
    const base = new Date(around); base.setDate(base.getDate() + day)
    const [o, c] = HOURS[base.getDay()]
    for (let t = o * 60; t + 30 <= c * 60; t += 30) { const d = new Date(base); d.setHours(Math.floor(t / 60), t % 60, 0, 0); cands.push(d) }
  }
  cands.sort((a, b) => Math.abs(a.getTime() - around.getTime()) - Math.abs(b.getTime() - around.getTime()))
  for (const c of cands) { if (isFree(c)) out.push(c); if (out.length >= 3) break }
  return out.sort((a, b) => a.getTime() - b.getTime())
}

interface Parsed { day: Date | null; hour: number | null; min: number }
function parseSlot(text: string): Parsed {
  const t = text.toLowerCase()
  let day: Date | null = null
  const today = new Date()
  if (/\btomorrow\b/.test(t)) { day = new Date(today); day.setDate(today.getDate() + 1) }
  else if (/\btoday\b|\btonight\b|\bthis (morning|afternoon|evening)\b/.test(t)) day = new Date(today)
  else if (/\bweekend\b/.test(t)) { day = new Date(today); day.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7)) }
  else {
    for (let i = 0; i < 7; i++) {
      if (new RegExp(`\\b${DAYS[i]}\\b`).test(t) || new RegExp(`\\b${DAYS[i].slice(0, 3)}\\b`).test(t)) {
        day = new Date(today); day.setDate(today.getDate() + ((i - today.getDay() + 7) % 7 || 7)); break
      }
    }
  }
  let hour: number | null = null, min = 0
  const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|o'?clock)?\b/)
  if (m && !/\b\d{1,2}\s*(st|nd|rd|th)\b/.test(m[0])) {
    hour = Number(m[1]); min = Number(m[2] ?? 0)
    if (m[3] === 'pm' && hour < 12) hour += 12
    if (!m[3] && hour <= 7) hour += 12
    if (m[3] === 'am' && hour === 12) hour = 0
  } else if (/morning/.test(t)) hour = 10
  else if (/afternoon|lunch/.test(t)) hour = 14
  else if (/evening|after work|tonight/.test(t)) hour = 18
  if (hour !== null) { hour = Math.min(23, Math.max(0, hour)); min = Math.round(min / 30) * 30 % 60 }
  return { day, hour, min }
}

type Res =
  | { kind: 'proposed'; at: Date } | { kind: 'proposed_reschedule'; at: Date; from: Date }
  | { kind: 'booked'; at: Date } | { kind: 'rescheduled'; at: Date; from: Date }
  | { kind: 'cancel_proposed'; from: Date } | { kind: 'cancelled'; from: Date }
  | { kind: 'unavailable'; reason: string; alts: Date[] } | { kind: 'need_time'; day: Date } | { kind: 'need_day'; at: Date }
  | { kind: 'nothing_pending' } | { kind: 'declined' } | { kind: 'text'; text: string; stage?: Stage }

const STAGES: Array<[Stage, string]> = [['new', 'New'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['booked', 'Booked'], ['showed', 'Showed'], ['no_show', 'No show'], ['handover', 'Handover'], ['cold', 'Cold / out']]

export default function LeadEngineDemo() {
  const [lead, setLead] = useState<Lead | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [alerts, setAlerts] = useState<string[]>([])
  const [ledger, setLedger] = useState<Booking[]>([])
  const [others] = useState<Array<{ name: string; stage: Stage; slot?: string }>>([
    { name: 'Sophie', stage: 'contacted' }, { name: 'Marcus', stage: 'replied' }, { name: 'Priya', stage: 'booked', slot: 'Thursday 10:00' }, { name: 'Grace', stage: 'cold' },
  ])
  const [name, setName] = useState('Alex')
  const [source, setSource] = useState('trial')
  const bottom = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  function push(m: Msg) { setMsgs((s) => [...s, m]) }
  function alert(a: string) { setAlerts((s) => [a, ...s]) }

  function createLead() {
    const l: Lead = { name: name.trim() || 'Alex', source, stage: 'new', memory: { booking: null, pending: null, asked: [], facts: [], outcomes: [] } }
    setLead(l); setLedger([])
    setMsgs([{ from: 'system', text: `${l.name} enquired via ${source === 'abandoned' ? 'abandoned online join' : source === 'website' ? 'the website' : 'free trial form'}` }])
    alert(`New lead: ${l.name} · ${source}. First touch sent in 4 seconds.`)
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      const opener = source === 'abandoned'
        ? `Hi ${l.name}, it looks like you started joining ${CLUB} online but did not finish. No problem at all, I have saved where you got to.`
        : `Hi ${l.name}, thanks for your interest in ${CLUB}. I have reserved a free trial visit for you.`
      push({ from: 'club', text: `${opener}\n\nWould you like to come in for a look around? We have availability tomorrow morning, afternoon and evening. What works best for you?`, time: now() })
      setLead({ ...l, stage: 'contacted' })
    }, 900)
  }

  /* The server side of the live engine, in miniature: understand, resolve against state, then word it. */
  function resolve(text: string, l: Lead): { res: Res; mem: Memory; stage?: Stage } {
    const t = text.toLowerCase().trim()
    const mem: Memory = { ...l.memory, asked: [...l.memory.asked], facts: [...l.memory.facts] }
    const bk = mem.booking

    if (/^stop[.!]?$/.test(t) || /don'?t (message|text|contact) me|unsubscribe/.test(t)) return { res: { kind: 'text', text: 'No problem, you will not hear from us again. You are always welcome at the club.' }, mem, stage: 'opted_out' }
    if (/complain|refund|cancel my membership|angry|rubbish|manager|human|real person|speak to someone/.test(t)) return { res: { kind: 'text', text: 'I am sorry to hear that. I will hand this to a member of the team now and someone will be in touch today. Thank you for telling me.' }, mem, stage: 'handover' }
    if (/\bbot\b|robot|\bai\b|automated|are you real/.test(t)) return { res: { kind: 'text', text: `I am the club's automated assistant, and a real team member is available whenever you like. ${bk ? `Your trial is ${fmt(bk.at)}; anything else I can help with?` : 'Would you still like to come in for a free look around? Morning, afternoon or evening all work.'}` }, mem }

    if (/hurt|injur|knee|back pain|shoulder|pregnan/.test(t)) mem.facts.push(t.match(/hurt my \w+|injured \w+|\w+ pain|knee|pregnan\w*/)?.[0] ?? 'injury mentioned')
    if (/lose weight|weight loss|get fit|strength|marathon|wedding/.test(t)) mem.facts.push(t.match(/lose weight|weight loss|get fit|strength|marathon|wedding/)![0])

    const p = parseSlot(text)
    const wantsCancel = /\bcancel\b|can'?t make it|cannot make it|won'?t be able|not (going to )?(make|come)/.test(t) && p.day === null && p.hour === null
    const says = (re: RegExp) => re.test(t)

    if (wantsCancel) {
      if (!bk) return { res: { kind: 'nothing_pending' }, mem }
      if (mem.pending?.kind === 'cancel') return doCancel(mem)
      mem.pending = { kind: 'cancel' }
      return { res: { kind: 'cancel_proposed', from: bk.at }, mem }
    }

    if (p.day || p.hour !== null) {
      if (p.day && p.hour === null) { mem.pending = null; return { res: { kind: 'need_time', day: p.day }, mem } }
      let want: Date
      if (!p.day) {
        const base = bk?.at ?? mem.pending?.at
        if (!base) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(p.hour!, p.min, 0, 0); return { res: { kind: 'need_day', at: d }, mem } }
        want = new Date(base)
      } else want = new Date(p.day)
      want.setHours(p.hour!, p.min, 0, 0)
      if (mem.pending?.at && Math.abs(mem.pending.at.getTime() - want.getTime()) < 1800000) return confirmPending(mem)
      if (!isOpen(want)) { const [o, c] = HOURS[want.getDay()]; mem.pending = null; return { res: { kind: 'unavailable', reason: `We are not staffed at ${fmtTime(want)} on ${fmtDay(want)} (open ${String(o).padStart(2, '0')}:00 to ${c}:00).`, alts: alternatives(want) }, mem } }
      if (want.getTime() < Date.now() + 3600000) { mem.pending = null; return { res: { kind: 'unavailable', reason: `${fmt(want)} is too soon to book.`, alts: alternatives(new Date(Math.max(want.getTime(), Date.now()))) }, mem } }
      if (isFull(want)) { mem.pending = null; return { res: { kind: 'unavailable', reason: `${fmt(want)} is already full.`, alts: alternatives(want) }, mem } }
      if (bk && Math.abs(bk.at.getTime() - want.getTime()) < 60000) return { res: { kind: 'text', text: `You are already booked for ${fmt(bk.at)}. Anything else I can help with?` }, mem }
      if (bk) { mem.pending = { kind: 'reschedule', at: want }; return { res: { kind: 'proposed_reschedule', at: want, from: bk.at }, mem } }
      mem.pending = { kind: 'book', at: want }
      return { res: { kind: 'proposed', at: want }, mem }
    }

    if (says(/^(yes|yeah|yep|ok|okay|sure|please|perfect|go ahead|book it|that works|sounds good|confirm|do it|fine)\b/) || says(/\b(yes|yeah) (please|thanks)\b/)) {
      if (!mem.pending) return { res: { kind: 'nothing_pending' }, mem }
      return confirmPending(mem)
    }
    if (says(/^(no|nope|leave it|keep it|as it is|don'?t)\b/) || says(/leave it as it is|keep it as it is/)) {
      if (mem.pending) { mem.pending = null; return { res: { kind: 'declined' }, mem } }
      if (says(/no thanks|not interested|no\b/)) return { res: { kind: 'text', text: `No problem at all. If you change your mind, just reply with a day and I will sort it. Have a good one, ${l.name}.` }, mem, stage: bk ? undefined : 'cold' }
    }
    if (says(/what times|when are you free|availability|what days|when can i/)) return { res: { kind: 'text', text: `We have mornings, afternoons and evenings across the week. ${bk ? `You are booked for ${fmt(bk.at)} already; tell me a different day and time if you want to move it.` : 'Which day suits you, and morning, afternoon or evening?'}` }, mem }

    const tail = bk ? `See you ${fmt(bk.at)}.` : mem.pending?.at ? `Shall I book ${fmt(mem.pending.at)} for you?` : 'Which day suits you for a free look around, and morning, afternoon or evening?'
    if (says(/price|cost|how much|membership|fee|£/)) { mem.asked.push('price'); return { res: { kind: 'text', text: `Classic is £34.99 a month, WOW is £38.99 and adds all classes, the Recovery Zone and multi gym access, and EPIC is £49.99. No contract, cancel any time. ${tail}` }, mem } }
    if (says(/open|hours|time do you|close|what time/)) { mem.asked.push('hours'); return { res: { kind: 'text', text: `We are open 06:00 to 22:00 Monday to Thursday, until 21:00 on Friday, and 08:00 to 18:00 at weekends. ${tail}` }, mem } }
    if (says(/class|yoga|spin|hiit|pilates|pump/)) { mem.asked.push('classes'); return { res: { kind: 'text', text: `Classes are included on WOW and EPIC, with about 40 a week across the timetable. The team can show you the full list when you come in. ${tail}` }, mem } }
    if (says(/parking|park|sauna|pool|creche|personal train|\bpt\b|shower|locker/)) { mem.asked.push(t.match(/parking|park|sauna|pool|creche|personal train|\bpt\b|shower|locker/)![0]); return { res: { kind: 'text', text: `Good question. I do not have that in front of me, so I will have a team member confirm it rather than guess. ${tail}` }, mem } }
    if (says(/thank|cheers|great|brilliant/)) return { res: { kind: 'text', text: mem.pending?.kind === 'cancel' && bk ? `You are welcome. Just to check, shall I cancel ${fmt(bk.at)}? A yes and it is done.` : mem.pending?.at ? `You are welcome. ${fmt(mem.pending.at)} is still waiting for your yes.` : bk ? `You are welcome. See you ${fmt(bk.at)}.` : 'You are welcome. Whenever you are ready, just reply with a day.' }, mem }
    if (mem.facts.length && /\b(knee|hurt|injur|pain)\b/.test(t)) return { res: { kind: 'text', text: `Thanks for telling me. The team will talk it through with you on the day and you can go at your own pace. ${tail}` }, mem }
    return { res: { kind: 'text', text: `Happy to help with that. ${tail}` }, mem }
  }

  function confirmPending(mem: Memory): { res: Res; mem: Memory; stage?: Stage } {
    const pend = mem.pending!
    if (pend.kind === 'cancel') return doCancel(mem)
    const at = pend.at!
    if (!isFree(at)) { mem.pending = null; return { res: { kind: 'unavailable', reason: 'That time has just been taken.', alts: alternatives(at) }, mem } }
    const id = nextId.current++
    if (pend.kind === 'reschedule' && mem.booking) {
      const old = mem.booking
      setLedger((s) => [...s.map((b) => (b.id === old.id ? { ...b, status: 'rescheduled' as BookingStatus } : b)), { id, at, status: 'booked', from: old.id }])
      mem.booking = { id, at, status: 'booked', from: old.id }; mem.pending = null
      return { res: { kind: 'rescheduled', at, from: old.at }, mem, stage: 'booked' }
    }
    setLedger((s) => [...s, { id, at, status: 'booked' }])
    mem.booking = { id, at, status: 'booked' }; mem.pending = null
    return { res: { kind: 'booked', at }, mem, stage: 'booked' }
  }
  function doCancel(mem: Memory): { res: Res; mem: Memory; stage?: Stage } {
    const old = mem.booking!
    setLedger((s) => s.map((b) => (b.id === old.id ? { ...b, status: 'cancelled' } : b)))
    mem.booking = null; mem.pending = null
    return { res: { kind: 'cancelled', from: old.at }, mem, stage: 'replied' }
  }

  function word(res: Res, l: Lead): string {
    switch (res.kind) {
      case 'proposed': return `I can do ${fmt(res.at)} and it is free. Shall I book that for you, ${l.name}?`
      case 'proposed_reschedule': return `I can move you from ${fmt(res.from)} to ${fmt(res.at)}. Shall I make that change?`
      case 'booked': return `Done, you are booked in for ${fmt(res.at)}. Just bring yourself, water and trainers, and ask for the team at reception. Tours take about 20 minutes. See you then, ${l.name}.`
      case 'rescheduled': return `All changed. Your free trial is now ${fmt(res.at)} and the ${fmtTime(res.from)} slot is released. See you then.`
      case 'cancel_proposed': return `No problem. Just to check, shall I cancel your trial on ${fmt(res.from)}? You can rebook any time.`
      case 'cancelled': return `Your trial on ${fmt(res.from)} is cancelled. Whenever you would like to come in, just reply with a day and I will sort it.`
      case 'unavailable': return `${res.reason} ${res.alts.length ? `Closest I can do: ${res.alts.map((a) => (sameDay(a, res.alts[0]) ? fmtTime(a) : fmt(a))).join(', ')} on ${fmtDay(res.alts[0])}. Any of those?` : 'Which other day would suit?'}`
      case 'need_time': return `${fmtDay(res.day)} works. Morning, afternoon or evening, or a time if you have one?`
      case 'need_day': return `Which day suits you for ${fmtTime(res.at)}?`
      case 'nothing_pending': return 'Happy to sort that. Which day suits you, and morning, afternoon or evening?'
      case 'declined': return l.memory.booking ? `No problem, your trial stays as ${fmt(l.memory.booking.at)}.` : 'No problem. Which day and time would suit better?'
      case 'text': return res.text
    }
  }

  function send() {
    if (!lead || !input.trim() || typing) return
    const text = input.trim()
    setInput('')
    push({ from: 'lead', text, time: now() })
    const base: Lead = { ...lead, stage: lead.stage === 'contacted' ? 'replied' : lead.stage }
    setLead(base)
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      const { res, mem, stage } = resolve(text, base)
      const next: Lead = { ...base, memory: mem, stage: stage ?? (res.kind === 'declined' && !mem.booking ? 'replied' : base.stage) }
      if (['booked', 'rescheduled'].includes(res.kind)) next.stage = 'booked'
      setLead(next)
      push({ from: 'club', text: word(res, next), time: now() })
      if (res.kind === 'booked') alert(`BOOKED: ${lead.name}, free trial ${fmt(res.at)}. Confirmed by the lead. Calendar invite sent to the club inbox. Reminder queued for the day before.`)
      if (res.kind === 'rescheduled') alert(`MOVED: ${lead.name}, now ${fmt(res.at)} (was ${fmt(res.from)}). Old slot released, calendar updated.`)
      if (res.kind === 'cancelled') alert(`CANCELLED: ${lead.name}, ${fmt(res.from)}. Slot released. Lead kept warm, not chased.`)
      if (res.kind === 'unavailable') alert(`${lead.name} asked for a time that is ${res.reason.includes('full') ? 'full' : 'unavailable'}. Offered the nearest free slots instead.`)
      if (stage === 'handover') alert(`HANDOVER: ${lead.name} needs a person. Reason: ${text.slice(0, 60)}.${mem.booking ? ` Has a trial booked ${fmt(mem.booking.at)}.` : ''}`)
      if (stage === 'opted_out') alert(`${lead.name} opted out. Suppressed on every channel.`)
    }, 700 + Math.random() * 500)
  }

  function outcome(o: 'showed' | 'no_show' | 'joined') {
    if (!lead || !lead.memory.booking) return
    const bk = lead.memory.booking
    const texts = {
      showed: `Hi ${lead.name}, it was great to have you in today. How did you find it? If anything would make joining an easy yes, tell me and I will see what we can do.`,
      no_show: `Hi ${lead.name}, sorry we missed you today. No problem at all, these things happen. Would you like me to rebook your free trial? Just reply with a day and morning, afternoon or evening.`,
      joined: `Welcome to the club, ${lead.name}. The team will get you set up with the app and your first sessions. See you in there.`,
    }
    const status: BookingStatus = o === 'showed' ? 'attended' : o
    setLedger((s) => s.map((b) => (b.id === bk.id ? { ...b, status } : b)))
    setLead({ ...lead, stage: o === 'joined' ? 'showed' : o, memory: { ...lead.memory, booking: null, pending: null, outcomes: [...lead.memory.outcomes, `${o.replace('_', ' ')} on ${fmtDay(bk.at)}`] } })
    push({ from: 'system', text: `staff marked ${o.replace('_', ' ')}` })
    setTyping(true)
    setTimeout(() => { setTyping(false); push({ from: 'club', text: texts[o], time: now() }) }, 700)
    alert(`OUTCOME: ${lead.name} marked ${o.replace('_', ' ')}. Stored against the booking. Branched follow up sent.`)
  }

  const all = lead ? [{ name: lead.name, stage: lead.stage, slot: lead.memory.booking ? fmt(lead.memory.booking.at) : undefined }, ...others] : others
  const mem = lead?.memory

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
      <Phone
        header={CLUB}
        sub={lead ? `${lead.name} · ${lead.stage.replace('_', ' ')}` : 'create a lead to start'}
        footer={
          lead ? (
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Reply as the lead..."
                aria-label="Reply as the lead"
                className="flex-1 rounded-full bg-ink px-4 py-2 text-sm text-paper placeholder-paper/70 focus:outline-none focus:ring-2 focus:ring-moss/40"
              />
              <button onClick={send} className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-paper hover:bg-moss-deep">Send</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Lead first name" className="w-1/2 rounded-full bg-ink px-4 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-moss/40" placeholder="First name" />
                <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Lead source" className="w-1/2 rounded-full bg-ink px-3 py-2 text-sm text-paper focus:outline-none">
                  <option value="trial">Free trial form</option>
                  <option value="abandoned">Abandoned online join</option>
                  <option value="website">Website enquiry</option>
                </select>
              </div>
              <button onClick={createLead} className="w-full rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">New lead</button>
            </div>
          )
        }
      >
        {msgs.length === 0 && (
          <p className="px-2 pt-10 text-center text-sm text-paper/75">This phone is the lead&apos;s view. Create a lead and the assistant sends the first message within seconds. Then reply as the customer.</p>
        )}
        {msgs.map((m, i) => (
          <Bubble key={i} from={m.from} time={m.time}>{m.text}</Bubble>
        ))}
        {typing && (
          <div className="my-1.5 flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-ink px-3 py-2 text-[13px] text-paper/75">typing</div></div>
        )}
        <div ref={bottom} />
      </Phone>

      <div className="space-y-4">
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">What gymIQ remembers about {lead?.name ?? 'the lead'}</p>
          {!mem ? (
            <p className="mt-2 text-sm text-slate">Nothing yet. Every reply is read against this record before the assistant answers, so it never books twice, never forgets a time it offered, and never contradicts what was agreed.</p>
          ) : (
            <div className="mt-3 space-y-3">
              <dl className="space-y-1.5 font-mono text-[13px] leading-relaxed">
                <div><dt className="inline text-slate">Booking: </dt><dd className={`inline ${mem.booking ? 'text-moss font-semibold' : 'text-ink'}`}>{mem.booking ? fmtShort(mem.booking.at) : 'none'}</dd></div>
                <div><dt className="inline text-slate">Waiting for: </dt><dd className="inline text-amber-ink">{mem.pending ? (mem.pending.kind === 'cancel' ? 'a yes to cancel the booking' : `a yes to ${mem.pending.kind === 'reschedule' ? 'move to ' : ''}${fmtShort(mem.pending.at!)}`) : 'nothing'}</dd></div>
                <div><dt className="inline text-slate">Asked about: </dt><dd className="inline text-ink">{mem.asked.length ? Array.from(new Set(mem.asked)).join(', ') : 'nothing yet'}</dd></div>
                <div><dt className="inline text-slate">Told us: </dt><dd className="inline text-ink">{mem.facts.length ? Array.from(new Set(mem.facts)).join('; ') : 'nothing yet'}</dd></div>
                <div><dt className="inline text-slate">Visits: </dt><dd className="inline text-ink">{mem.outcomes.length ? mem.outcomes.join('; ') : 'none yet'}</dd></div>
              </dl>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Bookings table</p>
                {ledger.length === 0 ? <p className="mt-1 text-[13px] text-slate">No rows yet. Nothing is written until the lead says yes to a specific time.</p> : (
                  <ul className="mt-1 space-y-1">
                    {ledger.map((b) => (
                      <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg bg-paper-2 px-2 py-1 font-mono text-[11px]">
                        <span className="text-ink">#{b.id} · {fmtShort(b.at)}</span>
                        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${b.status === 'booked' ? 'bg-moss text-paper' : b.status === 'attended' || b.status === 'joined' ? 'bg-lime text-ink' : 'bg-mist text-slate'}`}>{b.status}{b.from ? ` · from #${b.from}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Pipeline, live</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {STAGES.map(([key, label]) => {
              const items = all.filter((l) => l.stage === key)
              return (
                <div key={key} className="min-h-[88px] rounded-xl bg-paper-2 p-2">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-slate">{label} <span className="text-amber-ink">{items.length}</span></p>
                  {items.map((l) => (
                    <div key={l.name} className={`mt-1.5 rounded-lg border bg-white px-2 py-1 text-[11px] ${lead && l.name === lead.name ? 'border-moss' : 'border-mist'}`}>
                      <p className="font-semibold text-ink">{l.name}</p>
                      {l.slot && <p className="text-[11px] text-moss">{l.slot}</p>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {lead?.stage === 'booked' && lead.memory.booking && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate">After the visit, staff mark:</span>
              <button onClick={() => outcome('showed')} className="rounded-full bg-moss px-3 py-1 font-semibold text-paper">Showed</button>
              <button onClick={() => outcome('no_show')} className="rounded-full border border-mist px-3 py-1 font-semibold text-ink">No show</button>
              <button onClick={() => outcome('joined')} className="rounded-full bg-lime px-3 py-1 font-semibold text-ink">Joined</button>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-ink p-4 text-paper">
          <p className="font-mono text-[11px] uppercase tracking-wider text-paper/75">What the team sees, Telegram or WhatsApp</p>
          <div className="mt-3 space-y-2">
            {alerts.length === 0 && <p className="text-sm text-paper/75">Alerts appear here as the lead moves.</p>}
            {alerts.map((a, i) => (
              <div key={i} className="rounded-xl bg-ink-2 px-3 py-2 font-mono text-[13px] leading-relaxed text-paper/92">{a}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
