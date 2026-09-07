'use client'

/**
 * The staff task board. Pick who you are, tick tasks, watch the queue behind
 * the board and the evening report update. Capped list, ticks stick.
 */
import { useMemo, useState } from 'react'

type Section = 'money-hour' | 'sales' | 'retention' | 'club'
interface Task { id: number; section: Section; title: string; detail: string; done?: string; assignee?: string }

const STAFF = ['Dan', 'Rachel', 'Israel']
const QUEUE = { overdue: 58, unbilled: 22 }

const SEED: Task[] = [
  { id: 1, section: 'money-hour', title: 'Call overdue: Mercedes W', detail: 'WOW, £36.99 a month, pays by card, last visit 31 Aug. 1 Ring and agree payment today. 2 Fix the card. 3 Retry. 4 Note on the profile.' },
  { id: 2, section: 'money-hour', title: 'Call overdue: Callum B', detail: 'Classic, £31.99, card, last visit 31 Aug.' },
  { id: 3, section: 'money-hour', title: 'Call overdue: Tanya B', detail: 'WOW, £36.99, card, last visit 30 Aug.' },
  { id: 4, section: 'money-hour', title: 'Call overdue: Yomi W', detail: 'WOW, £36.99, direct debit, no visit on record.' },
  { id: 5, section: 'money-hour', title: 'Fix billing: Drew B', detail: 'ACTIVE at £49.99 with no next payment scheduled. Training unbilled. Restart billing, confirm a date shows.' },
  { id: 6, section: 'money-hour', title: 'Fix billing: Zoe H', detail: 'ACTIVE at £36.99, no next payment scheduled.' },
  { id: 7, section: 'money-hour', title: 'Ending 10 Sep, call: Billy B', detail: '£31.99 a month, membership ends Wednesday. Ring before it lapses; if staying restart billing, if leaving ask why.' },
  { id: 8, section: 'money-hour', title: 'Cash payers to settle at the desk (2)', detail: 'Do not ring them. Collect when they next come in.' },
  { id: 9, section: 'sales', title: 'Check new leads, call within the hour', detail: 'Every enquiry gets a call within 60 minutes.' },
  { id: 10, section: 'sales', title: "Confirm today's and tomorrow's tours by text", detail: "Chase yesterday's no shows too." },
  { id: 11, section: 'retention', title: 'Call 5 drifting members (14 to 20 days since last visit)', detail: 'Friendly check in, book them into a class. Never mention price or billing. Note on each profile.' },
  { id: 12, section: 'club', title: 'Send the six line end of day report by 18:00', detail: 'Sales, money calls, billing fixes, leads, retention, club.' },
]

const LABELS: Record<Section, string> = { 'money-hour': 'Money hour, before 10:30', sales: 'Sales', retention: 'Retention', club: 'Club' }

export default function BoardDemo() {
  const [me, setMe] = useState('Dan')
  const [tasks, setTasks] = useState<Task[]>(SEED)
  const done = tasks.filter((t) => t.done)
  const open = tasks.filter((t) => !t.done)
  const onBoardOverdue = tasks.filter((t) => t.title.startsWith('Call overdue')).length
  const clearedOverdue = done.filter((t) => t.title.startsWith('Call overdue')).length

  const report = useMemo(() => {
    const by: Record<string, number> = {}
    for (const t of done) by[t.done!] = (by[t.done!] ?? 0) + 1
    const who = Object.entries(by).map(([n, c]) => `${n} ${c}`).join(', ') || 'nobody yet'
    return `Board today: ${done.length} of ${tasks.length} cleared. ${who}. Money hour ${done.filter((t) => t.section === 'money-hour').length} of ${tasks.filter((t) => t.section === 'money-hour').length}. Overdue queue ${QUEUE.overdue - clearedOverdue} after today's ticks; ${clearedOverdue} member${clearedOverdue === 1 ? '' : 's'} will not be listed again for 3 days.`
  }, [done, tasks, clearedOverdue])

  function tick(id: number) {
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: t.done ? undefined : me } : t)))
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-3xl border border-mist bg-paper-2 p-4 sm:p-5">
        <div className="rounded-2xl bg-moss px-4 py-3 text-paper">
          <p className="font-display text-base font-bold">Riverside, Daily Board</p>
          <p className="text-xs text-paper/80">Monday 7 September, {open.length} to do, {done.length} done</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
          <span className="text-slate">Signed in as</span>
          {STAFF.map((s) => (
            <button key={s} onClick={() => setMe(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ${me === s ? 'bg-ink text-paper' : 'bg-paper-2 text-ink'}`}>{s}</button>
          ))}
          <span className="ml-auto text-xs text-slate">ticks are recorded to you</span>
        </div>
        <div className="mt-3 rounded-xl bg-white px-3 py-2">
          <div className="flex items-center justify-between text-xs text-slate"><span>{done.length} of {tasks.length} done</span><span>{Math.round((done.length / tasks.length) * 100)}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-2"><div className="h-full rounded-full bg-moss transition-all" style={{ width: `${(done.length / tasks.length) * 100}%` }} /></div>
        </div>
        {(Object.keys(LABELS) as Section[]).map((sec) => {
          const items = open.filter((t) => t.section === sec)
          if (!items.length) return null
          return (
            <div key={sec} className="mt-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-wider text-moss">{LABELS[sec]}</h3>
                <span className="text-xs text-slate">{items.length} left</span>
              </div>
              {sec === 'money-hour' && (
                <p className="mt-1 text-[11px] text-slate">{onBoardOverdue} of {QUEUE.overdue} overdue on the board today, 2 of {QUEUE.unbilled} billing fixes. The rest come through as you clear these.</p>
              )}
              <div className="mt-2 space-y-1.5">
                {items.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-mist bg-white px-3 py-2.5">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 accent-moss" checked={false} onChange={() => tick(t.id)} aria-label={t.title} />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{t.title}</span>
                      <span className="block text-xs text-slate">{t.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
        {done.length > 0 && (
          <details className="mt-4 rounded-xl bg-white px-3 py-2" open>
            <summary className="cursor-pointer text-sm font-semibold text-moss">Done today ({done.length}), untick if wrong</summary>
            <div className="mt-2 space-y-1.5">
              {done.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-moss-soft px-3 py-2 opacity-80">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-moss" checked onChange={() => tick(t.id)} aria-label={t.title} />
                  <span>
                    <span className="block text-sm font-semibold text-ink line-through">{t.title}</span>
                    <span className="block text-xs text-moss">Done by {t.done}</span>
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl bg-ink p-4 text-paper">
          <p className="font-mono text-[11px] uppercase tracking-wider text-paper/50">22:00 to the owner</p>
          <p className="mt-2 font-mono text-[12px] leading-relaxed text-paper/85">{report}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-white p-4 text-sm text-slate">
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate">Why it works</p>
          <ul className="mt-2 space-y-2">
            <li>Generated every morning from the live roster, so it changes as the club changes. New overdue members appear during the day at the hourly refresh.</li>
            <li>Capped on purpose: the top 12 calls and 6 fixes, most recoverable first. A desk can finish it.</li>
            <li>A tick sticks. A member ticked today is not re listed for three days, so nobody is asked to make the same call twice.</li>
            <li>Every tick is recorded to the person, and the owner gets the count by name at 22:00.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
