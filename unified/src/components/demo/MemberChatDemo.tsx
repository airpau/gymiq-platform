'use client'

/**
 * Member assistant: the chat on the club's website and in WhatsApp that
 * answers members' and prospects' questions from the club's own facts
 * (hours, classes, prices, freezes, cancellations, parking), takes the
 * actions it is allowed to, and hands anything else to a person with the
 * thread attached. Scripted from a fixed fact sheet so the demo needs no server.
 */
import { useEffect, useRef, useState } from 'react'
import { Phone, Bubble, now } from './DemoFrame'

const FACTS = {
  hours: 'Open 05:30 to 22:00 weekdays, 07:00 to 20:00 weekends. Staffed 08:00 to 20:00; 24 hour access with your fob outside those times.',
  classes: 'This week: Spin 06:30 and 18:15 Mon to Fri, Pump 19:00 Tue and Thu, Yoga 09:30 Sat, Circuits 10:00 Sun. Book in the app up to seven days ahead.',
  prices: 'Classic £31.99 a month, WOW £36.99 (adds classes and guest passes), EPIC £49.99 (adds PT check ins). No joining fee this month. Student and corporate rates available.',
  freeze: 'You can freeze for one to three months for £5 a month. Say the month you want to start and I will set it up and confirm by email.',
  cancel: 'One month\'s notice from your next payment date. I can raise the cancellation now and a manager will confirm it today, or if something is wrong I can get someone to call you first.',
  parking: 'Free parking for two hours in the retail park behind the club. Register your plate at reception or in the app so you are not fined.',
  pt: 'Personal training is £35 a session or £300 for ten. Say a goal and I will match you with a trainer and book a free 20 minute consultation.',
  trial: 'A free trial is one session with a member of staff. Tell me a day and time and I will check availability and book it.',
}

type Reply = { text: string; action?: string; handover?: boolean }

function reply(q: string, name: string): Reply {
  const s = q.toLowerCase()
  if (/\b(hour|open|close|time|24)\b/.test(s)) return { text: FACTS.hours }
  if (/class|spin|pump|yoga|timetable/.test(s)) return { text: FACTS.classes }
  if (/price|cost|how much|membership|join/.test(s) && !/cancel|freeze/.test(s)) return { text: FACTS.prices, action: 'Lead captured on the sales pulse' }
  if (/freeze|pause|hold/.test(s)) return { text: FACTS.freeze }
  if (/cancel|leave|quit/.test(s)) return { text: `Sorry to hear that, ${name}. ${FACTS.cancel}`, action: 'Retention task raised on the staff board: call before confirming', handover: true }
  if (/park/.test(s)) return { text: FACTS.parking }
  if (/\bpt\b|personal train|trainer/.test(s)) return { text: FACTS.pt, action: 'PT enquiry logged' }
  if (/trial|try|taster/.test(s)) return { text: FACTS.trial, action: 'Handed to the lead assistant' }
  if (/complain|angry|rude|dirty|broken|unhappy|refund/.test(s)) return { text: `I am sorry, ${name}. I have passed this to the club manager with our conversation attached, and they will reply personally today. Is there anything you need right now?`, action: 'Handed to a person: manager alerted', handover: true }
  if (/human|person|staff|speak to|call me/.test(s)) return { text: 'Of course. I have asked a member of staff to pick this up; they have the thread. If it is urgent, ring the club on 01992 000000.', action: 'Handed to a person', handover: true }
  if (/thank|cheers|great|ok/.test(s)) return { text: `Any time, ${name}. Anything else?` }
  return { text: `I am not certain about that, so rather than guess I have asked the team; they will reply here. In the meantime I can help with hours, classes, prices, freezes, cancellations, parking or personal training.`, action: 'Unknown question: sent to staff with the thread', handover: true }
}

const SUGGESTED = ['What time do you open on Sunday?', 'Can I freeze my membership for August?', 'I want to cancel', 'Is there parking?', 'How much is PT?']

export default function MemberChatDemo() {
  const name = 'Priya'
  const [thread, setThread] = useState<Array<{ from: 'club' | 'lead' | 'system'; text: string; time?: string }>>([
    { from: 'club', text: `Hi ${name}, it is the Riverside assistant. Ask me anything about the club: hours, classes, your membership, parking. I answer from the club's own facts and hand over to a person when I should.` },
  ])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [thread, typing])
  // Stamp the greeting on the client only, so the server and client markup match.
  useEffect(() => { setThread((t) => (t[0]?.time ? t : [{ ...t[0], time: now() }, ...t.slice(1)])) }, [])

  function send(text: string) {
    const q = text.trim()
    if (!q || typing) return
    setThread((t) => [...t, { from: 'lead', text: q, time: now() }]); setDraft(''); setTyping(true)
    setTimeout(() => {
      const r = reply(q, name)
      setThread((t) => [...t, { from: 'club', text: r.text, time: now() }, ...(r.handover ? [{ from: 'system' as const, text: 'a person has the thread' }] : [])])
      if (r.action) setLog((l) => [`${now()} ${r.action}`, ...l])
      setTyping(false)
    }, 800)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <Phone
        header="Riverside Fitness"
        sub="website chat · also WhatsApp and the app"
        footer={
          <form onSubmit={(e) => { e.preventDefault(); send(draft) }} className="flex items-center gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask the club anything" className="min-w-0 flex-1 rounded-full bg-ink px-4 py-2 font-mono text-[12px] text-paper placeholder-paper/40 focus:outline-none" aria-label="Message" />
            <button type="submit" disabled={!draft.trim() || typing} className="rounded-full bg-lime px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50">Send</button>
          </form>
        }
      >
        {thread.map((m, i) => <Bubble key={i} from={m.from} time={m.time}>{m.text}</Bubble>)}
        {typing && <p className="px-2 font-mono text-[11px] text-paper/40">typing</p>}
        <div ref={bottom} />
      </Phone>
      <div className="space-y-4">
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Try asking</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-mist px-3 py-1 text-left text-xs text-ink hover:bg-paper-2">{s}</button>)}
          </div>
        </div>
        <div className="rounded-2xl bg-ink p-4 text-paper">
          <p className="font-mono text-[11px] uppercase tracking-wider text-paper/50">What it did behind the chat</p>
          {log.length === 0 ? <p className="mt-2 font-mono text-[12px] text-paper/50">Nothing yet.</p> : (
            <ul className="mt-2 space-y-1 font-mono text-[12px] text-paper/85">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
          )}
        </div>
        <div className="rounded-2xl border border-mist bg-white p-4 text-sm text-slate">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Rules it keeps</p>
          <ul className="mt-2 space-y-2">
            <li>Answers only from the club&apos;s fact sheet, which you edit. Unknown question, it says so and asks a person.</li>
            <li>Never pretends to be a person. A cancellation or a complaint always reaches a human, with the thread attached.</li>
            <li>Every question is logged, so you can see what members keep asking and fix the cause.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
