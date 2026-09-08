'use client'

/**
 * The morning brief, with the reply. Pick the run (06:00, 16:00, 22:00) and
 * ask it questions. Answers are scripted from a fixed club day so the demo
 * never needs a server.
 */
import { useEffect, useRef, useState } from 'react'
import { Phone, Bubble, now } from './DemoFrame'

const RUNS: Record<string, { label: string; text: string }> = {
  '06:00': {
    label: 'Morning brief',
    text: `Riverside morning brief, Mon 7 Sep: £26,414 collected MTD, 1,472 active paying

TOP 3
1. Retention is good. 7 leavers this month against 19 over the same six days of August, and the roster has grown six days running, 1,611 to 1,617.
2. Selling is the problem. Joins project 77 against a 100 target. 20 joins in six days.
3. £1,884 of September arrears across 47 members clears onto Friday's credit if worked before Wednesday.

SALES 1 to 6 Sep: submitted £30,070, successful £26,414, pending £7,198, failed £2,035. Failure rate 6.77%, best of the month.

MEMBERS: roster 1,617, active 1,480, paused 79, overdue 58. Overdue by method: DD 22 of 1,220, card 28 of 355, flexible 8 of 28.

FRIDAY CREDIT forecast £20,471, range 17,000 to 23,000.

BOARD: 12 overdue calls and 6 billing fixes on the desk today, 46 queued behind them.`,
  },
  '16:00': {
    label: 'Late warning',
    text: `Riverside 16:00: 4 of 12 overdue calls ticked, 0 of 6 billing fixes. Wednesday is the cut off for Friday's payout: anything not retried by tonight lands a week later.

Dan ticked Callum B, Tanya B, Mercedes W, Hayley B. Israel and Rachel nothing yet.

£1,206 of the £1,884 arrears still sits unworked. Two joins since 06:00, both Classic.`,
  },
  '22:00': {
    label: 'Evening close',
    text: `Riverside evening close, Mon 7 Sep: £27,120 collected MTD, 1,474 active paying.

Day: 3 joins, 1 leaver, £706 collected, 2 payments retried and pending. Overdue 56, down 2. Board 9 of 25 cleared; Dan 7, Rachel 2, Israel 0.

Joins project 78. Friday credit forecast £20,650. Nothing needs you tonight.`,
  },
}

const ANSWERS: Array<[RegExp, string]> = [
  [/who are the 47|arrears|overdue list|which members/i, `The 47 with September dated arrears, most recoverable first: 28 on card, 14 on Direct Debit, 5 flexible. Top of the list by value and recent attendance: Mercedes W (WOW, card, last visit 31 Aug), Callum B (Classic, card, 31 Aug), Tanya B (WOW, card, 30 Aug), Tabitha W (WOW, card, 27 Aug), Hayley B (WOW, card, 27 Aug). Full list is on the board, 12 a day, cash payers excluded.`],
  [/friday|payout|credit|cash/i, `Friday 11 September: central £20,471, range £17,000 to £23,000. It is 80% of what settles by Wednesday's cut off. Clear the £1,884 of arrears before Wednesday and about £1,507 of it lands on this credit rather than next week's.`],
  [/joins|sales|selling|target/i, `20 joins in six days, projecting 77 against 100. Weekday pace is the issue: weekends are running at 3 a day, weekdays at 1.9 against 2.9 expected. September 2025 did 90. Leads have not been logged since 19 August, so the top of the funnel is unmeasured.`],
  [/retention|leavers|attrition/i, `7 leavers this month against 19 over the same six days of August. Attrition 1.72% MTD against the 5% gate. The roster has grown six days running. 5 members are in the drifting window (14 to 20 days) and are on today's board.`],
  [/students?|age/i, `47 students aged 19 and over are still on the under 19 rate, £970 a month short. 11 more turn 19 within 90 days. Rachel has the list; the October price letters cover it.`],
  [/dan|staff|board|who did/i, `Board yesterday: 9 of 25 cleared. Dan 7, Rachel 2, Israel 0. 60 of the 88 tasks generated last week were never ticked, all in money hour. The board is now capped at 12 calls and 6 fixes a day so it can be finished.`],
  [/card|direct debit|\bdd\b/i, `Card payers are failing at 7.9% against 1.8% for Direct Debit, 4.4 times worse. 28 of the 58 overdue are on card. Moving the card book to Direct Debit would take overdue to about 35.`],
  [/price|classic|wow/i, `Classic is £31.99, WOW £36.99, EPIC £49.99 for a joiner today. 158 standard rate members pay less than that, £385 a month between them. The October rise covers students, corporates, Classic and WOW: £1,103 a month banked.`],
]

export default function BriefDemo() {
  const [run, setRun] = useState<'06:00' | '16:00' | '22:00'>('06:00')
  const [thread, setThread] = useState<Array<{ from: 'club' | 'lead'; text: string; time?: string }>>([])
  const [input, setInput] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread])

  function ask(q?: string) {
    const text = (q ?? input).trim()
    if (!text) return
    setInput('')
    setThread((t) => [...t, { from: 'lead', text, time: now() }])
    const a = ANSWERS.find(([re]) => re.test(text))?.[1] ?? `I can answer anything in today's brief: the 47 in arrears, Friday's credit, joins against target, retention, the students, the board, card versus Direct Debit, prices.`
    setTimeout(() => setThread((t) => [...t, { from: 'club', text: a, time: now() }]), 600)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
      <Phone
        header="gymIQ"
        sub={`${run} · ${RUNS[run].label}`}
        footer={
          <div className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} placeholder="Ask the brief..." aria-label="Ask the brief" className="flex-1 rounded-full bg-ink px-4 py-2 text-sm text-paper placeholder-paper/70 focus:outline-none focus:ring-2 focus:ring-moss/40" />
            <button onClick={() => ask()} className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-paper hover:bg-moss-deep">Ask</button>
          </div>
        }
      >
        <div className="rounded-2xl bg-ink px-3 py-3">
          <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.6] text-paper/92">{RUNS[run].text}</pre>
        </div>
        {thread.map((m, i) => (
          <Bubble key={i} from={m.from} time={m.time}>{m.text}</Bubble>
        ))}
        <div ref={bottom} />
      </Phone>
      <div className="space-y-4">
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Pick a run</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(RUNS) as Array<'06:00' | '16:00' | '22:00'>).map((k) => (
              <button key={k} onClick={() => { setRun(k); setThread([]) }} className={`rounded-full px-4 py-2 text-sm font-semibold ${run === k ? 'bg-ink text-paper' : 'border border-mist bg-white text-ink hover:bg-paper-2'}`}>
                {k} {RUNS[k].label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate">The brief is written, not charted, because a written verdict is what an owner reads at 06:00 on a phone. It says plainly when data is stale rather than pretending.</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Ask it</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Who are the 47?', 'What will Friday pay?', 'Why are joins short?', 'Who did the board yesterday?', 'Card vs Direct Debit?'].map((q) => (
              <button key={q} onClick={() => ask(q)} className="rounded-full border border-mist bg-paper-2 px-3 py-1.5 text-sm text-ink hover:border-moss">{q}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
