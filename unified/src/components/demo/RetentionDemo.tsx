'use client'

/**
 * Retention radar. Each member is measured against their own habit, not a
 * flat 30 day rule. Toggle the rule to see who a blanket rule would have
 * called dormant and who it would have missed. "Called, noted" ticks the
 * matching task on the staff board (shared store), and a tick on the board
 * shows here.
 */
import { useState } from 'react'
import { MEMBERS, usualGap, verdict, useDemoStore } from './DemoStore'

export default function RetentionDemo() {
  const [rule, setRule] = useState<'habit' | 'flat'>('habit')
  const { me, calledMember, markCalled } = useDemoStore()
  const rows = MEMBERS.map((m) => {
    const v = rule === 'habit' ? verdict(m) : m.daysSince >= 30
      ? { key: 'call' as const, label: 'Dormant (30+)', why: 'Flat rule: 30 days without a visit.', tone: 'bg-signal/10 text-signal' }
      : { key: 'ok' as const, label: 'Fine (under 30)', why: 'Flat rule: visited in the last 30 days.', tone: 'bg-moss-soft text-moss' }
    return { m, v, task: calledMember(m.name) }
  })
  const toCall = rows.filter((r) => r.v.key === 'call' && !r.task?.done).length
  const atRisk = rows.filter((r) => (r.v.key === 'call' || r.v.key === 'watch') && !r.task?.done)
  const value = atRisk.reduce((t, r) => t + r.m.fee, 0)
  const calledCount = rows.filter((r) => r.task?.done).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-mist bg-white p-4">
        <span className="text-sm font-semibold text-ink">Measure against</span>
        <button onClick={() => setRule('habit')} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${rule === 'habit' ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>each member&apos;s own habit</button>
        <button onClick={() => setRule('flat')} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${rule === 'flat' ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>a flat 30 day rule</button>
        <span className="ml-auto font-mono text-sm text-ink">{toCall} to call · £{value.toFixed(0)} a month at stake{calledCount ? ` · ${calledCount} called` : ''}</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-mist bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-paper-2 text-left font-mono text-[11px] uppercase tracking-wider text-slate">
            <tr>
              <th className="px-4 py-2.5 font-medium">Member</th>
              <th className="px-4 py-2.5 font-medium">Usual visits</th>
              <th className="px-4 py-2.5 font-medium">Last visit</th>
              <th className="px-4 py-2.5 font-medium">Read</th>
              <th className="px-4 py-2.5 font-medium">Board</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {rows.map(({ m, v, task }) => {
              const done = Boolean(task?.done)
              return (
                <tr key={m.name} className={done ? 'bg-moss-soft/40' : ''}>
                  <td className="px-4 py-2.5"><span className="font-semibold text-ink">{m.name}</span><span className="block text-xs text-slate">{m.plan}, £{m.fee}, member {m.tenureMonths} months</span></td>
                  <td className="px-4 py-2.5 font-mono text-ink">{m.visitsPerMonth} a month<span className="block text-[11px] text-slate">about every {usualGap(m) < 1.5 ? 'day' : `${usualGap(m).toFixed(0)} days`}</span></td>
                  <td className="px-4 py-2.5 font-mono text-ink">{m.daysSince} days ago</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${v.tone}`}>{v.label}</span><span className="block text-xs text-slate">{v.why}</span></td>
                  <td className="px-4 py-2.5 text-right">
                    {done ? (
                      <div>
                        <span className="block text-xs font-semibold text-moss">Called by {task!.done}</span>
                        <button onClick={() => markCalled(m.name)} className="text-[11px] text-slate underline-offset-2 hover:underline">undo</button>
                      </div>
                    ) : task ? (
                      <div>
                        <button onClick={() => markCalled(m.name)} className="rounded-full bg-moss px-3 py-1 text-xs font-semibold text-paper">Called, noted</button>
                        <span className="mt-1 block text-[11px] text-slate">on the board{task.assignee ? `, ${task.assignee}` : ''}</span>
                      </div>
                    ) : (v.key === 'call' || v.key === 'watch') ? (
                      <button onClick={() => markCalled(m.name)} className="rounded-full bg-moss px-3 py-1 text-xs font-semibold text-paper">Called, noted</button>
                    ) : (
                      <span className="text-[11px] text-slate">not on the board</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate">
        <strong className="text-ink">Usual visits</strong> is how often this member normally trains, from their own swipe history, so &quot;12 a month&quot; means a gap of about three days is normal for them and eleven days is not. Notice Dev and Harry: a flat rule calls them dormant and a call would likely prompt a cancellation. Notice Ben, Emma and Jack: under a flat rule they are fine, and by the time they cross 30 days the habit is gone. Press <strong className="text-ink">Called, noted</strong> (you are signed in as {me}) and the task ticks itself on the staff board above; tick it on the board and it shows here.
      </p>
    </div>
  )
}
