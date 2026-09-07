'use client'

/**
 * Retention radar. Each member is measured against their own habit, not a
 * flat 30 day rule. Toggle the rule to see who a blanket rule would have
 * called dormant and who it would have missed.
 */
import { useState } from 'react'

interface M { name: string; plan: string; fee: number; visitsPerMonth: number; daysSince: number; tenureMonths: number }

const MEMBERS: M[] = [
  { name: 'Aisha K', plan: 'WOW', fee: 36.99, visitsPerMonth: 16, daysSince: 9, tenureMonths: 14 },
  { name: 'Ben O', plan: 'Classic', fee: 31.99, visitsPerMonth: 12, daysSince: 11, tenureMonths: 7 },
  { name: 'Carla M', plan: 'EPIC', fee: 49.99, visitsPerMonth: 8, daysSince: 17, tenureMonths: 22 },
  { name: 'Dev P', plan: 'Classic', fee: 31.99, visitsPerMonth: 1, daysSince: 26, tenureMonths: 31 },
  { name: 'Emma T', plan: 'WOW', fee: 36.99, visitsPerMonth: 10, daysSince: 21, tenureMonths: 3 },
  { name: 'Femi A', plan: 'Classic', fee: 31.99, visitsPerMonth: 4, daysSince: 33, tenureMonths: 18 },
  { name: 'Grace L', plan: 'Student', fee: 19.99, visitsPerMonth: 14, daysSince: 5, tenureMonths: 2 },
  { name: 'Harry W', plan: 'Classic', fee: 31.99, visitsPerMonth: 0.5, daysSince: 71, tenureMonths: 40 },
  { name: 'Isla R', plan: 'WOW', fee: 36.99, visitsPerMonth: 6, daysSince: 12, tenureMonths: 9 },
  { name: 'Jack D', plan: 'Classic', fee: 31.99, visitsPerMonth: 9, daysSince: 27, tenureMonths: 5 },
]

function verdict(m: M) {
  const expectedGap = 30.44 / Math.max(0.25, m.visitsPerMonth)
  const ratio = m.daysSince / expectedGap
  if (m.tenureMonths >= 12 && m.visitsPerMonth < 1 && m.daysSince >= 30) return { key: 'leave', label: 'Leave alone', why: 'Long tenured, low use, happy paying. A call only reminds them.', tone: 'bg-paper-2 text-slate' }
  if (ratio >= 2 && m.daysSince >= 14) return { key: 'call', label: 'Call today', why: `Away ${m.daysSince} days against a usual gap of ${expectedGap.toFixed(0)}. Habit broken.`, tone: 'bg-signal/10 text-signal' }
  if (ratio >= 1.3 && m.daysSince >= 10) return { key: 'watch', label: 'Drifting', why: `Slipping from ${m.visitsPerMonth} visits a month. Book them into a class.`, tone: 'bg-amber-soft text-amber' }
  return { key: 'ok', label: 'Healthy', why: 'On their own pattern.', tone: 'bg-moss-soft text-moss' }
}

export default function RetentionDemo() {
  const [rule, setRule] = useState<'habit' | 'flat'>('habit')
  const [called, setCalled] = useState<Record<string, boolean>>({})
  const rows = MEMBERS.map((m) => {
    const v = rule === 'habit' ? verdict(m) : m.daysSince >= 30
      ? { key: 'call', label: 'Dormant (30+)', why: 'Flat rule: 30 days without a visit.', tone: 'bg-signal/10 text-signal' }
      : { key: 'ok', label: 'Fine (under 30)', why: 'Flat rule: visited in the last 30 days.', tone: 'bg-moss-soft text-moss' }
    return { m, v }
  })
  const toCall = rows.filter((r) => r.v.key === 'call').length
  const atRisk = rows.filter((r) => r.v.key === 'call' || r.v.key === 'watch')
  const value = atRisk.reduce((t, r) => t + r.m.fee, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-mist bg-white p-4">
        <span className="text-sm font-semibold text-ink">Measure against</span>
        <button onClick={() => setRule('habit')} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${rule === 'habit' ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>each member&apos;s own habit</button>
        <button onClick={() => setRule('flat')} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${rule === 'flat' ? 'bg-ink text-paper' : 'border border-mist text-ink'}`}>a flat 30 day rule</button>
        <span className="ml-auto font-mono text-sm text-ink">{toCall} to call · £{value.toFixed(0)} a month at stake</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-mist bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-paper-2 text-left font-mono text-[11px] uppercase tracking-wider text-slate">
            <tr><th className="px-4 py-2.5 font-medium">Member</th><th className="px-4 py-2.5 font-medium">Usual</th><th className="px-4 py-2.5 font-medium">Last visit</th><th className="px-4 py-2.5 font-medium">Read</th><th className="px-4 py-2.5 font-medium"></th></tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {rows.map(({ m, v }) => (
              <tr key={m.name} className={called[m.name] ? 'opacity-50' : ''}>
                <td className="px-4 py-2.5"><span className="font-semibold text-ink">{m.name}</span><span className="block text-xs text-slate">{m.plan}, £{m.fee}, {m.tenureMonths} months</span></td>
                <td className="px-4 py-2.5 font-mono text-ink">{m.visitsPerMonth} a month</td>
                <td className="px-4 py-2.5 font-mono text-ink">{m.daysSince} days ago</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${v.tone}`}>{v.label}</span><span className="block text-xs text-slate">{v.why}</span></td>
                <td className="px-4 py-2.5 text-right">
                  {(v.key === 'call' || v.key === 'watch') && !called[m.name] && (
                    <button onClick={() => setCalled((c) => ({ ...c, [m.name]: true }))} className="rounded-full bg-moss px-3 py-1 text-xs font-semibold text-paper">Called, noted</button>
                  )}
                  {called[m.name] && <span className="text-xs text-moss">on the board as done</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate">
        Notice Dev and Harry: a flat rule calls them dormant and a call would likely prompt a cancellation. Notice Ben, Emma and Jack: under a flat rule they are fine, and by the time they cross 30 days the habit is gone. The habit rule is what runs at Hoddesdon; the calls land on the board every morning.
      </p>
    </div>
  )
}
