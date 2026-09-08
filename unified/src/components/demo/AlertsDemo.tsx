'use client'

/**
 * Where it reaches you, and who sees what. Pick a role, a channel and a time
 * and see the exact message that person gets, laid out the way it lands on
 * the phone: a one line verdict, then labelled lines, then what to do. Reply
 * to it and get an answer (scripted from the same fixed club day).
 */
import { useEffect, useRef, useState } from 'react'

type Role = 'owner' | 'manager' | 'desk'
type Channel = 'whatsapp' | 'telegram' | 'email' | 'sms'
type When = 'morning' | 'alert' | 'evening'

interface Msg { verdict: string; lines: Array<[string, string]>; action?: string }

const ROLES: Array<{ key: Role; label: string; sees: string }> = [
  { key: 'owner', label: 'Owner', sees: 'Money and direction: collected, Friday forecast, failure rate, joins against target, the board by name, the monthly review pack.' },
  { key: 'manager', label: 'Manager', sees: 'Performance and operations: joins, leavers, overdue count, the board and who cleared it, the drifting list. No bank balances.' },
  { key: 'desk', label: 'Front desk', sees: 'Today only: who to call, who is ending, tours to confirm, leads to ring. No revenue, no forecasts.' },
]

const MESSAGES: Record<Role, Record<When, Msg>> = {
  owner: {
    morning: {
      verdict: 'Retention good, selling behind. £1,884 of arrears clears onto Friday if worked by Wednesday.',
      lines: [['Collected MTD', '£26,414, 1,472 active paying'], ['Failure rate', '6.77%, best of the month'], ['Friday forecast', '£20,471, range 17,000 to 23,000'], ['Joins', '20 so far, projecting 77 against 100'], ['Leavers', '7 against 19 same days last month'], ['Board', '12 calls, 6 fixes, 46 queued']],
      action: 'Nothing needs you. Rachel has the arrears list.',
    },
    alert: {
      verdict: 'Weekday joins running under half of pace for the third day.',
      lines: [['Joins today', '1 against 4.2 expected by 13:00'], ['Pattern', 'Mon, Tue, Wed all under half'], ['Last time this happened', 'May price test, caught day five']],
      action: 'Check the join zone and the website price before evening footfall.',
    },
    evening: {
      verdict: 'Quiet day. £706 in, 3 joins, 1 leaver.',
      lines: [['Collected MTD', '£27,120'], ['Board', '9 of 25 cleared: Dan 7, Rachel 2, Israel 0'], ['Overdue', '56, down 2'], ['Friday forecast', '£20,650']],
      action: 'Nothing needs you tonight.',
    },
  },
  manager: {
    morning: {
      verdict: 'Selling is behind. Money hour has 18 on the board.',
      lines: [['Joins MTD', '20 against 100 target'], ['Leavers', '7'], ['Overdue', '58, 12 on the board today'], ['Billing fixes', '6'], ['Ending this week', '2, call before they lapse'], ['Drifting', '5 to call, names on the board']],
      action: 'Leads have not been logged since 19 August. Please log them.',
    },
    alert: {
      verdict: 'Joins are 1 against 4.2 expected today.',
      lines: [['Third day', 'under half of pace'], ['Check', 'website join works, price shows correctly'], ['Check', 'desk is confirming tours by text']],
      action: 'Do a test join on the website now and reply "done".',
    },
    evening: {
      verdict: 'Board 9 of 25 cleared. Billy B ends Wednesday, not yet called.',
      lines: [['Ticks', 'Dan 7, Rachel 2, Israel 0'], ['Day', '3 joins, 1 leaver'], ['Rolling to tomorrow', '16 money hour tasks']],
      action: 'Assign Billy B to someone for the morning.',
    },
  },
  desk: {
    morning: {
      verdict: 'Money hour before 10:30, 12 calls.',
      lines: [['Call first', 'Mercedes W, Callum B, Tanya B, Yomi W, and 8 more on the board'], ['Ending Wed', 'Billy B, ring today'], ['Tours', '2 to confirm by text'], ['Drifting', 'Ben O, Emma T, Jack D, friendly check in']],
      action: 'Open the board with your PIN and tick as you go.',
    },
    alert: {
      verdict: 'New lead: Alex, from the website. Ring within the hour.',
      lines: [['Number', '07700 900123'], ['Wants', 'a trial tomorrow evening, reserved 18:30'], ['Asked about', 'classes and parking']],
      action: 'Call now, then tick "Check new leads" on the board.',
    },
    evening: {
      verdict: 'Send the six line end of day report by 18:00.',
      lines: [['Lines', 'Sales, money calls, billing fixes, leads, retention, club'], ['Board', '9 of 25 done']],
      action: 'Reply here with the six lines.',
    },
  },
}

const CHANNELS: Array<{ key: Channel; label: string; note: string }> = [
  { key: 'whatsapp', label: 'WhatsApp', note: 'One to one to named staff. Reply and it answers.' },
  { key: 'telegram', label: 'Telegram', note: 'Owner and staff group. Reply to any message and get an answer. Where the Hertfordshire club runs.' },
  { key: 'email', label: 'Email', note: 'The full brief with the workings, and the monthly review pack.' },
  { key: 'sms', label: 'SMS', note: 'Alerts only, no full briefs. For a manager who does not use messaging apps.' },
]

const ANSWERS: Array<[RegExp, string]> = [
  [/who are the 47|arrears|overdue list|which members/i, 'The 47 with September arrears, most recoverable first: Mercedes W, Callum B, Tanya B, Tabitha W, Hayley B, then 42 more. 28 on card, 14 on Direct Debit, 5 flexible. Full list is on the board, 12 a day.'],
  [/friday|payout|credit|forecast/i, 'Friday 11 September: £20,471 central, range £17,000 to £23,000. Clear the £1,884 of arrears before Wednesday and about £1,500 of it lands on this credit instead of next week.'],
  [/joins?|sales|selling|target|price/i, '20 joins in six days, projecting 77 against 100. Weekdays are the problem: 1.9 a day against 2.9 expected. The website price and the join zone are the first two things to check.'],
  [/leavers?|retention|drifting|attrition/i, '7 leavers this month against 19 over the same days of August. 5 members are in the drifting window: Ben O, Emma T, Jack D, Carla M, Femi A. They are on the board.'],
  [/board|dan|rachel|israel|who did/i, 'Board today: Dan 7, Rachel 2, Israel 0 of 25. 16 money hour tasks roll to tomorrow. Billy B ends Wednesday and has not been called.'],
  [/done|logged|sent/i, 'Noted, thanks. I have recorded it against you and it will show in the 22:00 close.'],
  [/lead|alex/i, 'Alex enquired at 12:52 from the website. Trial reserved tomorrow at 18:30. He asked about classes and parking; both answered. He has not been called yet.'],
  [/card|direct debit|\bdd\b|failure/i, 'Card payers fail at 7.9% against 1.8% for Direct Debit. 28 of the 58 overdue are on card. Moving the card book to Direct Debit would take overdue to about 35.'],
]

function answer(q: string): string {
  for (const [re, a] of ANSWERS) if (re.test(q)) return a
  return 'I can answer anything in the brief: the arrears, Friday, joins, leavers, the board, or a member by name. What would you like?'
}

export default function AlertsDemo() {
  const [role, setRole] = useState<Role>('owner')
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [which, setWhich] = useState<When>('morning')
  const [thread, setThread] = useState<Array<{ me: boolean; text: string }>>([])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const r = ROLES.find((x) => x.key === role)!
  const c = CHANNELS.find((x) => x.key === channel)!
  const m = MESSAGES[role][which]
  const canReply = channel !== 'email' && channel !== 'sms'

  useEffect(() => { setThread([]); setDraft('') }, [role, channel, which])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [thread, typing])

  function send() {
    const q = draft.trim()
    if (!q || typing) return
    setThread((t) => [...t, { me: true, text: q }]); setDraft(''); setTyping(true)
    setTimeout(() => { setThread((t) => [...t, { me: false, text: answer(q) }]); setTyping(false) }, 700)
  }

  const dark = channel !== 'email'
  const bubble = channel === 'whatsapp' ? 'bg-[#1f2c34] text-paper' : channel === 'telegram' ? 'bg-[#182533] text-paper' : channel === 'email' ? 'bg-paper text-ink' : 'bg-[#2c2c2e] text-paper'
  const time = which === 'morning' ? '06:00' : which === 'alert' ? '13:10' : '22:00'

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Who</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ROLES.map((x) => (
              <button key={x.key} onClick={() => setRole(x.key)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${role === x.key ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>{x.label}</button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate">{r.sees}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Where</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHANNELS.map((x) => (
              <button key={x.key} onClick={() => setChannel(x.key)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${channel === x.key ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>{x.label}</button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate">{c.note}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">When</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['morning', 'alert', 'evening'] as const).map((k) => (
              <button key={k} onClick={() => setWhich(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${which === k ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>{k === 'morning' ? '06:00 brief' : k === 'alert' ? 'Mid day alert' : '22:00 close'}</button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate">Every message has the same shape: one line that says what matters, the numbers behind it with a label each, then what to do. Same read of the club for everyone, cut to what that person is responsible for.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[380px]">
        <div className={`rounded-[30px] p-3 ${channel === 'whatsapp' ? 'bg-[#0b141a]' : channel === 'telegram' ? 'bg-[#17212b]' : channel === 'email' ? 'bg-ink' : 'bg-[#1c1c1e]'}`}>
          <div className="px-2 pb-2 pt-1 font-mono text-[11px] text-paper/50">{c.label} · {r.label} · {time}</div>
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            <div className={`rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${bubble}`}>
              {channel === 'email' && <p className="mb-2 border-b border-mist pb-2 font-semibold">gymIQ: Riverside, {which === 'morning' ? 'morning brief' : which === 'alert' ? 'alert' : 'evening close'}</p>}
              <p className={`font-mono text-[10px] uppercase tracking-wider ${dark ? 'text-paper/50' : 'text-slate'}`}>Riverside · {time}</p>
              <p className="mt-1 font-semibold leading-snug">{m.verdict}</p>
              <dl className={`mt-3 space-y-1.5 border-t pt-2 ${dark ? 'border-white/10' : 'border-mist'}`}>
                {m.lines.map(([k, v]) => (
                  <div key={k + v} className="flex gap-3 text-[12.5px]">
                    <dt className={`w-[38%] shrink-0 ${dark ? 'text-paper/55' : 'text-slate'}`}>{k}</dt>
                    <dd className="font-mono">{v}</dd>
                  </div>
                ))}
              </dl>
              {m.action && <p className={`mt-3 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold ${dark ? 'bg-lime/15 text-lime' : 'bg-moss-soft text-moss'}`}>{m.action}</p>}
            </div>
            {thread.map((t, i) => (
              <div key={i} className={`flex ${t.me ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${t.me ? 'bg-moss text-paper' : bubble}`}>{t.text}</div>
              </div>
            ))}
            {typing && <p className="px-3 font-mono text-[11px] text-paper/40">gymIQ is typing</p>}
            <div ref={bottom} />
          </div>
          {canReply ? (
            <form onSubmit={(e) => { e.preventDefault(); send() }} className="mt-2 flex items-center gap-2 rounded-full bg-black/30 py-1 pl-4 pr-1">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={role === 'desk' ? 'Reply, e.g. "done"' : 'Ask, e.g. "who are the 47?"'} className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-paper placeholder-paper/40 focus:outline-none" aria-label="Reply" />
              <button type="submit" className="rounded-full bg-lime px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50" disabled={!draft.trim() || typing}>Send</button>
            </form>
          ) : (
            <p className="mt-2 px-3 font-mono text-[11px] text-paper/40">{channel === 'email' ? 'Reply by email and it answers within a minute.' : 'SMS is one way. Replies come on WhatsApp or Telegram.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
