'use client'

/**
 * Lead engine demo. Fully in the browser: a scripted club assistant that
 * answers price, hours and class questions, books a trial when the lead names
 * a day and a time of day, hands over on complaints, and honours STOP. The
 * pipeline on the right moves as the conversation does, and staff see the
 * alert the moment a trial is booked.
 *
 * Nothing here calls a server. The production engine uses a language model
 * with the same rules; this shows the journey without exposing it.
 */
import { useEffect, useRef, useState } from 'react'
import { Phone, Bubble, now } from './DemoFrame'

type Stage = 'new' | 'contacted' | 'replied' | 'booked' | 'showed' | 'no_show' | 'handover' | 'cold' | 'opted_out'
interface Msg { from: 'club' | 'lead' | 'system'; text: string; time?: string }
interface Lead { name: string; source: string; stage: Stage; slot?: string }

const CLUB = 'Riverside Fitness'
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function firstTouch(name: string, source: string) {
  const opener =
    source === 'abandoned'
      ? `Hi ${name}, it looks like you started joining ${CLUB} online but did not finish. No problem at all, I have saved where you got to.`
      : `Hi ${name}, thanks for your interest in ${CLUB}. I have reserved a free trial visit for you.`
  return `${opener}\n\nWould you like to come in for a look around? We have availability tomorrow morning, afternoon and evening. What works best for you?`
}

function parseSlot(text: string): string | null {
  const t = text.toLowerCase()
  let day: Date | null = null
  const today = new Date()
  if (/\btomorrow\b/.test(t)) day = new Date(today.getTime() + 86400000)
  else if (/\btoday\b|\bthis (morning|afternoon|evening)\b/.test(t)) day = today
  else {
    for (let i = 0; i < 7; i++) {
      if (new RegExp(`\\b${DAYS[i]}\\b`).test(t) || new RegExp(`\\b${DAYS[i].slice(0, 3)}\\b`).test(t)) {
        const d = new Date(today)
        const diff = (i - today.getDay() + 7) % 7 || 7
        d.setDate(today.getDate() + diff)
        day = d
        break
      }
    }
  }
  let hour: number | null = null
  const m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
  if (m) {
    hour = Number(m[1])
    if (m[3] === 'pm' && hour < 12) hour += 12
    if (!m[3] && hour <= 7) hour += 12
  } else if (/morning/.test(t)) hour = 10
  else if (/afternoon|lunch/.test(t)) hour = 14
  else if (/evening|after work|tonight/.test(t)) hour = 18
  if (!day || hour === null) return null
  hour = Math.min(21, Math.max(6, hour))
  day.setHours(hour, 0, 0, 0)
  return day.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function reply(text: string, lead: Lead): { text: string; stage?: Stage; slot?: string } {
  const t = text.toLowerCase().trim()
  if (/^stop$/.test(t) || /don'?t (message|text|contact) me|unsubscribe/.test(t)) {
    return { text: 'No problem, you will not hear from us again. You are always welcome at the club.', stage: 'opted_out' }
  }
  if (/complain|refund|cancel my|angry|rubbish|manager|human|real person|speak to someone/.test(t)) {
    return { text: `I am sorry to hear that. I will hand this to a member of the team now and someone will be in touch today. Thank you for telling me.`, stage: 'handover' }
  }
  if (/bot|robot|\bai\b|automated|are you real/.test(t)) {
    return { text: `I am the club's automated assistant, and a real team member is available whenever you like. Would you still like to come in for a free look around? Morning, afternoon or evening all work.` }
  }
  const slot = parseSlot(text)
  if (slot && lead.stage !== 'booked') {
    return {
      text: `Done, you are booked in for ${slot}. Just bring yourself, water and trainers, and ask for the team at reception. Tours take about 20 minutes. See you then, ${lead.name}.`,
      stage: 'booked',
      slot,
    }
  }
  if (/price|cost|how much|membership|fee|£/.test(t)) {
    return { text: `Classic is £34.99 a month, WOW is £38.99 and adds all classes, the Recovery Zone and multi gym access, and EPIC is £49.99. No contract, cancel any time. The best way to choose is a look around. Morning, afternoon or evening?` }
  }
  if (/open|hours|time do you|close|what time/.test(t)) {
    return { text: `We are open 06:00 to 22:00 Monday to Thursday, until 21:00 on Friday, and 08:00 to 18:00 at weekends. When would suit you for a free visit?` }
  }
  if (/class|yoga|spin|hiit|pilates|pump/.test(t)) {
    return { text: `Classes are included on WOW and EPIC, with about 40 a week across the timetable. The team can show you the full list when you come in. Would tomorrow morning, afternoon or evening work?` }
  }
  if (/parking|park|sauna|pool|creche|personal train|\bpt\b/.test(t)) {
    return { text: `Good question, I will have a team member confirm that for you when you visit rather than guess. Shall I book you in? Morning, afternoon or evening?` }
  }
  if (/yes|yeah|ok|sure|sounds good|please/.test(t) && !slot) {
    return { text: `Great. Which day suits you, and would you prefer morning, afternoon or evening?` }
  }
  if (/no thanks|not interested|no\b/.test(t)) {
    return { text: `No problem at all. If you change your mind, just reply with a day and I will sort it. Have a good one, ${lead.name}.`, stage: 'cold' }
  }
  return { text: `Happy to help with that. To get you booked in for a free look around, which day suits you, and morning, afternoon or evening?` }
}

const STAGES: Array<[Stage, string]> = [['new', 'New'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['booked', 'Booked'], ['showed', 'Showed'], ['no_show', 'No show'], ['handover', 'Handover'], ['cold', 'Cold / out']]

export default function LeadEngineDemo() {
  const [lead, setLead] = useState<Lead | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [alerts, setAlerts] = useState<string[]>([])
  const [others] = useState<Lead[]>([
    { name: 'Sophie', source: 'trial', stage: 'contacted' },
    { name: 'Marcus', source: 'website', stage: 'replied' },
    { name: 'Priya', source: 'trial', stage: 'booked', slot: 'Thursday 10:00' },
    { name: 'Grace', source: 'website', stage: 'cold' },
  ])
  const [name, setName] = useState('Alex')
  const [source, setSource] = useState('trial')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  function push(m: Msg) { setMsgs((s) => [...s, m]) }

  function createLead() {
    const l: Lead = { name: name.trim() || 'Alex', source, stage: 'new' }
    setLead(l)
    setMsgs([{ from: 'system', text: `${l.name} enquired via ${source === 'abandoned' ? 'abandoned online join' : source === 'website' ? 'the website' : 'free trial form'}` }])
    setAlerts((a) => [`New lead: ${l.name} · ${source}. First touch sent in 4 seconds.`, ...a])
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      push({ from: 'club', text: firstTouch(l.name, source), time: now() })
      setLead({ ...l, stage: 'contacted' })
    }, 900)
  }

  function send() {
    if (!lead || !input.trim() || typing) return
    const text = input.trim()
    setInput('')
    push({ from: 'lead', text, time: now() })
    if (lead.stage === 'contacted') setLead({ ...lead, stage: 'replied' })
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      const r = reply(text, lead)
      push({ from: 'club', text: r.text, time: now() })
      if (r.stage) {
        const next = { ...lead, stage: r.stage, slot: r.slot ?? lead.slot }
        setLead(next)
        if (r.stage === 'booked') setAlerts((a) => [`BOOKED: ${lead.name}, free trial ${r.slot}. Calendar invite sent to the club inbox. Booked by the assistant, no human involved.`, ...a])
        if (r.stage === 'handover') setAlerts((a) => [`HANDOVER: ${lead.name} needs a person. Reason: ${text.slice(0, 60)}.`, ...a])
        if (r.stage === 'opted_out') setAlerts((a) => [`${lead.name} opted out. Suppressed on every channel.`, ...a])
      }
    }, 700 + Math.random() * 600)
  }

  function outcome(o: 'showed' | 'no_show' | 'joined') {
    if (!lead) return
    const texts = {
      showed: `Hi ${lead.name}, it was great to have you in today. How did you find it? If anything would make joining an easy yes, tell me and I will see what we can do.`,
      no_show: `Hi ${lead.name}, sorry we missed you today. No problem at all, these things happen. Would you like me to rebook your free trial? Morning, afternoon or evening.`,
      joined: `Welcome to the club, ${lead.name}. The team will get you set up with the app and your first sessions. See you in there.`,
    }
    setLead({ ...lead, stage: o === 'joined' ? 'showed' : o })
    push({ from: 'system', text: `staff marked ${o.replace('_', ' ')}` })
    setTyping(true)
    setTimeout(() => { setTyping(false); push({ from: 'club', text: texts[o], time: now() }) }, 700)
    setAlerts((a) => [`OUTCOME: ${lead.name} marked ${o.replace('_', ' ')}. Branched follow up sent.`, ...a])
  }

  const all = lead ? [lead, ...others] : others

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
                className="flex-1 rounded-full bg-ink px-4 py-2 text-sm text-paper placeholder-paper/40 focus:outline-none focus:ring-2 focus:ring-moss/40"
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
          <p className="px-2 pt-10 text-center text-sm text-paper/40">This phone is the lead&apos;s view. Create a lead and the assistant sends the first message within seconds. Then reply as the customer.</p>
        )}
        {msgs.map((m, i) => (
          <Bubble key={i} from={m.from} time={m.time}>{m.text}</Bubble>
        ))}
        {typing && (
          <div className="my-1.5 flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-ink px-3 py-2 text-[13px] text-paper/50">typing</div></div>
        )}
        <div ref={bottom} />
      </Phone>

      <div className="space-y-4">
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Pipeline, live</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {STAGES.map(([key, label]) => {
              const items = all.filter((l) => l.stage === key)
              return (
                <div key={key} className="min-h-[88px] rounded-xl bg-paper-2 p-2">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate">{label} <span className="text-amber">{items.length}</span></p>
                  {items.map((l) => (
                    <div key={l.name} className={`mt-1.5 rounded-lg border bg-white px-2 py-1 text-[11px] ${lead && l.name === lead.name ? 'border-moss' : 'border-mist'}`}>
                      <p className="font-semibold text-ink">{l.name}</p>
                      {l.slot && <p className="text-[10px] text-moss">{l.slot}</p>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {lead?.stage === 'booked' && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate">After the visit, staff mark:</span>
              <button onClick={() => outcome('showed')} className="rounded-full bg-moss px-3 py-1 font-semibold text-paper">Showed</button>
              <button onClick={() => outcome('no_show')} className="rounded-full border border-mist px-3 py-1 font-semibold text-ink">No show</button>
              <button onClick={() => outcome('joined')} className="rounded-full bg-lime px-3 py-1 font-semibold text-ink">Joined</button>
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-ink p-4 text-paper">
          <p className="font-mono text-[11px] uppercase tracking-wider text-paper/50">What the team sees, Telegram or WhatsApp</p>
          <div className="mt-3 space-y-2">
            {alerts.length === 0 && <p className="text-sm text-paper/40">Alerts appear here as the lead moves.</p>}
            {alerts.map((a, i) => (
              <div key={i} className="rounded-xl bg-ink-2 px-3 py-2 font-mono text-[12px] leading-relaxed text-paper/85">{a}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
