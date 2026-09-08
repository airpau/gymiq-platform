'use client'

/**
 * The staff task board. One section at a time (tabs), so the list fits on a
 * screen. Pick who you are, assign tasks to named staff, tick them, and watch
 * the queue behind the board and the evening report update. Shares its state
 * with the retention radar and the payment routine: a call marked there ticks
 * here, and anyone the routine routes to a person lands under "Contact members".
 */
import { useEffect, useMemo, useState } from 'react'
import { STAFF, QUEUE, useDemoStore, type Section, type Staff } from './DemoStore'

const SECTIONS: Array<{ key: Section; label: string; note: string }> = [
  { key: 'money-hour', label: 'Money hour', note: `Before 10:30. The top overdue members to ring and billing faults to fix, most recoverable first. ${QUEUE.overdue} overdue in the club today; the rest come through as you clear these.` },
  { key: 'contact', label: 'Contact members', note: 'Members the payment routine could not fix on its own: a new card, a Direct Debit to set up, a cancellation for a person to decide. Run the routine below and they appear here.' },
  { key: 'retention', label: 'Retention', note: 'The names from the retention radar below. Mark one called there and it ticks here.' },
  { key: 'sales', label: 'Sales', note: 'Leads to ring within the hour, tours to confirm.' },
  { key: 'club', label: 'Club', note: 'Standing jobs.' },
]

export default function BoardDemo() {
  const { me, setMe, tasks, tick, assign } = useDemoStore()
  const [view, setView] = useState<'all' | 'mine'>('all')
  const [tab, setTab] = useState<Section | 'done'>('money-hour')
  const done = tasks.filter((t) => t.done)
  const open = tasks.filter((t) => !t.done)
  const mine = (t: { assignee?: string }) => t.assignee === me || !t.assignee
  const visibleOpen = view === 'mine' ? open.filter(mine) : open
  const count = (s: Section) => visibleOpen.filter((t) => t.section === s).length
  const clearedOverdue = done.filter((t) => t.title.startsWith('Call overdue')).length
  const routineCount = tasks.filter((t) => t.section === 'contact').length

  // When the payment routine adds contact tasks, show them.
  useEffect(() => { if (routineCount > 0) setTab('contact') }, [routineCount])

  const report = useMemo(() => {
    const by: Record<string, number> = {}
    for (const t of done) by[t.done!] = (by[t.done!] ?? 0) + 1
    const who = STAFF.map((s) => `${s} ${by[s] ?? 0}`).join(', ')
    const fromRadar = done.filter((t) => t.via === 'radar').length
    const unassigned = open.filter((t) => !t.assignee).length
    return `${done.length} of ${tasks.length} cleared: ${who}. Money hour ${done.filter((t) => t.section === 'money-hour').length} of ${tasks.filter((t) => t.section === 'money-hour').length}, retention ${done.filter((t) => t.section === 'retention').length} of ${tasks.filter((t) => t.section === 'retention').length}${fromRadar ? ` (${fromRadar} from the radar)` : ''}${routineCount ? `, ${routineCount} member${routineCount === 1 ? '' : 's'} to contact from the payment routine` : ''}. Overdue queue ${QUEUE.overdue - clearedOverdue}; ${clearedOverdue} will not be listed again for 3 days.${unassigned ? ` ${unassigned} open task${unassigned === 1 ? '' : 's'} not assigned to anyone.` : ''}`
  }, [done, open, tasks, clearedOverdue, routineCount])

  const items = tab === 'done' ? done : visibleOpen.filter((t) => t.section === tab)
  const section = SECTIONS.find((s) => s.key === tab)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-3xl border border-mist bg-white">
        <div className="flex flex-wrap items-center gap-3 bg-moss px-4 py-3 text-paper">
          <div>
            <p className="font-display text-base font-bold leading-tight">Riverside, Daily Board</p>
            <p className="text-sm text-paper/90">Monday 7 September · {open.length} to do · {done.length} done</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-sm">
            <span className="mr-1 text-paper/90">I am</span>
            {STAFF.map((s) => (
              <button key={s} onClick={() => setMe(s)} className={`rounded-full px-3 py-1 text-sm font-semibold ${me === s ? 'bg-paper text-moss' : 'bg-moss-deep text-paper hover:bg-ink'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 border-b border-mist px-4 py-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper-2"><div className="h-full rounded-full bg-moss transition-all" style={{ width: `${(done.length / tasks.length) * 100}%` }} /></div>
          <span className="font-mono text-sm text-slate">{Math.round((done.length / tasks.length) * 100)}%</span>
          <span className="flex items-center gap-1 text-sm">
            <button onClick={() => setView('all')} className={`rounded-full px-2.5 py-1 ${view === 'all' ? 'bg-moss-soft font-semibold text-moss' : 'text-slate'}`}>Everyone</button>
            <button onClick={() => setView('mine')} className={`rounded-full px-2.5 py-1 ${view === 'mine' ? 'bg-moss-soft font-semibold text-moss' : 'text-slate'}`}>Mine ({open.filter(mine).length})</button>
          </span>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-mist bg-paper-2 px-2 pt-2" role="tablist">
          {SECTIONS.map((s) => {
            const n = count(s.key)
            return (
              <button key={s.key} role="tab" aria-selected={tab === s.key} onClick={() => setTab(s.key)} className={`flex shrink-0 items-center gap-2 rounded-t-xl px-3.5 py-2 text-sm font-semibold ${tab === s.key ? 'bg-white text-ink shadow-[0_-1px_0_0_#DCDFD8_inset]' : 'text-slate hover:text-ink'}`}>
                {s.label}
                <span className={`rounded-full px-1.5 font-mono text-xs ${tab === s.key ? 'bg-moss text-paper' : n ? 'bg-mist text-ink' : 'bg-transparent text-slate'}`}>{n}</span>
              </button>
            )
          })}
          <button role="tab" aria-selected={tab === 'done'} onClick={() => setTab('done')} className={`ml-auto flex shrink-0 items-center gap-2 rounded-t-xl px-3.5 py-2 text-sm font-semibold ${tab === 'done' ? 'bg-white text-moss' : 'text-moss hover:text-moss-deep'}`}>
            Done <span className={`rounded-full px-1.5 font-mono text-xs ${tab === 'done' ? 'bg-moss text-paper' : 'bg-moss-soft text-moss'}`}>{done.length}</span>
          </button>
        </div>
        <div className="p-3 sm:p-4">
          {section && <p className="mb-3 text-sm text-slate">{section.note}</p>}
          {tab === 'done' && <p className="mb-3 text-sm text-slate">Untick anything ticked by mistake. Every tick is recorded to the person, wherever it was made.</p>}
          {items.length === 0 ? (
            <p className="rounded-xl bg-paper-2 px-4 py-6 text-center text-sm text-slate">
              {tab === 'done' ? 'Nothing ticked yet.' : tab === 'contact' ? 'Nothing here until the payment routine runs. Scroll down, press Run, and come back.' : view === 'mine' ? `Nothing left for ${me} here.` : 'All clear.'}
            </p>
          ) : (
            <ul className="divide-y divide-mist">
              {items.map((t) => (
                <li key={t.id} className={`flex items-start gap-3 py-2.5 ${t.done ? 'opacity-70' : ''}`}>
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-moss" checked={Boolean(t.done)} onChange={() => tick(t.id, 'board')} aria-label={t.title} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-[15px] font-semibold text-ink ${t.done ? 'line-through' : ''}`}>{t.title}</span>
                      {t.via === 'routine' && !t.done && <span className="rounded-full bg-amber-soft px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-ink">from the payment routine</span>}
                    </div>
                    <p className="mt-0.5 text-sm leading-snug text-slate">{t.done ? `Done by ${t.done}${t.via === 'radar' ? ', marked on the retention radar' : ''}` : t.detail}</p>
                  </div>
                  {!t.done && (
                    <select
                      value={t.assignee ?? ''}
                      onChange={(e) => assign(t.id, (e.target.value || undefined) as Staff | undefined)}
                      className={`shrink-0 rounded-full border px-2 py-1 text-xs ${t.assignee ? 'border-moss/40 bg-moss-soft text-moss' : 'border-mist bg-paper-2 text-slate'}`}
                      aria-label="Assign to"
                    >
                      <option value="">Anyone</option>
                      {STAFF.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-mist bg-white p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-moss">22:00 to the owner</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">{report}</p>
        </div>
        <div className="rounded-2xl border border-mist bg-paper-2 p-4 text-sm text-slate">
          <p className="font-mono text-xs uppercase tracking-wider text-slate">Why it works</p>
          <ul className="mt-2 space-y-2 leading-snug">
            <li>Generated every morning from the live roster. New overdue members appear at the hourly refresh.</li>
            <li>Capped on purpose: the top 12 calls and 6 fixes. A desk can finish it.</li>
            <li>Assign any task to a named person, or leave it for whoever is on shift. &quot;Mine&quot; shows a person only their own list.</li>
            <li>A tick sticks for three days, so nobody is asked to make the same call twice.</li>
            <li>The owner gets the count by name at 22:00.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
