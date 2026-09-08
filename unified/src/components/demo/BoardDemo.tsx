'use client'

/**
 * The staff task board. Pick who you are, assign tasks to named staff, tick
 * them, and watch the queue behind the board and the evening report update.
 * Shares its state with the retention radar and the payment routine, so a
 * call marked there ticks here and a retry landed there appears here.
 */
import { useMemo, useState } from 'react'
import { STAFF, QUEUE, useDemoStore, type Section, type Staff } from './DemoStore'

const LABELS: Record<Section, string> = { 'money-hour': 'Money hour, before 10:30', sales: 'Sales', retention: 'Retention', club: 'Club' }

export default function BoardDemo() {
  const { me, setMe, tasks, tick, assign } = useDemoStore()
  const [view, setView] = useState<'all' | 'mine'>('all')
  const done = tasks.filter((t) => t.done)
  const open = tasks.filter((t) => !t.done)
  const visibleOpen = view === 'mine' ? open.filter((t) => t.assignee === me || !t.assignee) : open
  const onBoardOverdue = tasks.filter((t) => t.title.startsWith('Call overdue')).length
  const clearedOverdue = done.filter((t) => t.title.startsWith('Call overdue')).length

  const report = useMemo(() => {
    const by: Record<string, number> = {}
    for (const t of done) by[t.done!] = (by[t.done!] ?? 0) + 1
    const who = STAFF.map((s) => `${s} ${by[s] ?? 0}`).join(', ')
    const fromRadar = done.filter((t) => t.via === 'radar').length
    const unassigned = open.filter((t) => !t.assignee).length
    return `Board today: ${done.length} of ${tasks.length} cleared. ${who}. Money hour ${done.filter((t) => t.section === 'money-hour').length} of ${tasks.filter((t) => t.section === 'money-hour').length}. Retention ${done.filter((t) => t.section === 'retention').length} of ${tasks.filter((t) => t.section === 'retention').length}${fromRadar ? ` (${fromRadar} marked from the radar)` : ''}. Overdue queue ${QUEUE.overdue - clearedOverdue} after today's ticks; ${clearedOverdue} member${clearedOverdue === 1 ? '' : 's'} will not be listed again for 3 days.${unassigned ? ` ${unassigned} open task${unassigned === 1 ? '' : 's'} not assigned to anyone.` : ''}`
  }, [done, open, tasks, clearedOverdue])

  const Assign = ({ id, value }: { id: string; value?: string }) => (
    <select
      value={value ?? ''}
      onChange={(e) => assign(id, (e.target.value || undefined) as Staff | undefined)}
      onClick={(e) => e.stopPropagation()}
      className={`rounded-full border px-2 py-0.5 text-[11px] ${value ? 'border-moss/40 bg-moss-soft text-moss' : 'border-mist bg-paper-2 text-slate'}`}
      aria-label="Assign to"
    >
      <option value="">Anyone on shift</option>
      {STAFF.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  )

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
          <span className="ml-auto flex items-center gap-1 text-xs">
            <button onClick={() => setView('all')} className={`rounded-full px-2.5 py-1 ${view === 'all' ? 'bg-moss-soft font-semibold text-moss' : 'text-slate'}`}>Whole board</button>
            <button onClick={() => setView('mine')} className={`rounded-full px-2.5 py-1 ${view === 'mine' ? 'bg-moss-soft font-semibold text-moss' : 'text-slate'}`}>Mine ({open.filter((t) => t.assignee === me || !t.assignee).length})</button>
          </span>
        </div>
        <div className="mt-3 rounded-xl bg-white px-3 py-2">
          <div className="flex items-center justify-between text-xs text-slate"><span>{done.length} of {tasks.length} done</span><span>{Math.round((done.length / tasks.length) * 100)}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper-2"><div className="h-full rounded-full bg-moss transition-all" style={{ width: `${(done.length / tasks.length) * 100}%` }} /></div>
        </div>
        {(Object.keys(LABELS) as Section[]).map((sec) => {
          const items = visibleOpen.filter((t) => t.section === sec)
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
              {sec === 'retention' && (
                <p className="mt-1 text-[11px] text-slate">These are the names from the retention radar below. Mark one called there and it ticks here.</p>
              )}
              <div className="mt-2 space-y-1.5">
                {items.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 rounded-xl border border-mist bg-white px-3 py-2.5">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-moss" checked={false} onChange={() => tick(t.id, 'board')} aria-label={t.title} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{t.title}</span>
                        <Assign id={t.id} value={t.assignee} />
                      </span>
                      <span className="block text-xs text-slate">{t.detail}</span>
                    </span>
                  </div>
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
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-moss" checked onChange={() => tick(t.id, 'board')} aria-label={t.title} />
                  <span>
                    <span className="block text-sm font-semibold text-ink line-through">{t.title}</span>
                    <span className="block text-xs text-moss">Done by {t.done}{t.via === 'radar' ? ', marked on the retention radar' : t.via === 'routine' ? ', by the payment routine' : ''}</span>
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
            <li>Assign any task to a named person, or leave it for whoever is on shift. &quot;Mine&quot; shows a person only their own list.</li>
            <li>A tick sticks. A member ticked today is not re listed for three days, so nobody is asked to make the same call twice.</li>
            <li>Every tick is recorded to the person, wherever it was made, and the owner gets the count by name at 22:00.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
