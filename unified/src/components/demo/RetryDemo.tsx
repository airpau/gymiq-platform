'use client'

/**
 * Failed payment routine. Run it and watch each failed payment get the
 * decision a careful human would make: retry once, route to a named action,
 * or leave alone. Never hammer a card.
 */
import { useState } from 'react'

interface F { name: string; amount: number; method: 'card' | 'dd' | 'flexible' | 'cash'; reason: string; attempts: number; lastAttemptDaysAgo: number; monthsFailed: number; lastVisitDays: number }

const FAILED: F[] = [
  { name: 'Mercedes W', amount: 36.99, method: 'dd', reason: 'Insufficient funds', attempts: 1, lastAttemptDaysAgo: 3, monthsFailed: 1, lastVisitDays: 6 },
  { name: 'Callum B', amount: 31.99, method: 'card', reason: 'Card declined', attempts: 2, lastAttemptDaysAgo: 4, monthsFailed: 1, lastVisitDays: 5 },
  { name: 'Tanya B', amount: 36.99, method: 'dd', reason: 'Insufficient funds', attempts: 1, lastAttemptDaysAgo: 1, monthsFailed: 1, lastVisitDays: 8 },
  { name: 'Yomi W', amount: 36.99, method: 'dd', reason: 'Mandate cancelled at bank', attempts: 3, lastAttemptDaysAgo: 9, monthsFailed: 4, lastVisitDays: 120 },
  { name: 'Geetha G', amount: 36.99, method: 'flexible', reason: 'No payment method', attempts: 0, lastAttemptDaysAgo: 30, monthsFailed: 2, lastVisitDays: 40 },
  { name: 'Sam A', amount: 31.99, method: 'card', reason: 'Card replaced 2 days ago, last failure was on the old card', attempts: 5, lastAttemptDaysAgo: 6, monthsFailed: 2, lastVisitDays: 3 },
  { name: 'Ade O', amount: 31.99, method: 'dd', reason: 'Insufficient funds', attempts: 6, lastAttemptDaysAgo: 3, monthsFailed: 3, lastVisitDays: 2 },
  { name: 'Lou M', amount: 22.99, method: 'cash', reason: 'Not paid at desk', attempts: 0, lastAttemptDaysAgo: 0, monthsFailed: 1, lastVisitDays: 4 },
]

function decide(f: F, friday: boolean): { action: string; tone: string; why: string } {
  if (f.method === 'cash') return { action: 'Desk collects', tone: 'bg-paper-2 text-slate', why: 'Cash payers are never messaged. Flagged for the front desk at next visit.' }
  if (/replaced/.test(f.reason)) return { action: 'Retry once', tone: 'bg-moss-soft text-moss', why: 'New card on file since the last failure; the old reason no longer applies.' }
  if (/mandate/i.test(f.reason) && f.monthsFailed >= 3) return { action: 'Cancel for review', tone: 'bg-signal/10 text-signal', why: `${f.monthsFailed} months failed, mandate dead, last visit ${f.lastVisitDays} days ago. Listed for a human decision, never auto cancelled.` }
  if (/declined|incorrect/i.test(f.reason)) return { action: 'Contact: new card', tone: 'bg-amber-soft text-amber', why: 'A declined card never fixes itself. SMS with a payment link and an ask to update the card in the app.' }
  if (/no payment method/i.test(f.reason)) return { action: 'Contact: set up DD', tone: 'bg-amber-soft text-amber', why: 'Payment link for the arrears plus how to set up a Direct Debit at the club.' }
  if (f.attempts >= 5) return { action: 'Stop retrying, chase', tone: 'bg-amber-soft text-amber', why: `${f.attempts} attempts already. Hammering a card gets it blocked. Chase with a link instead.` }
  if (f.lastAttemptDaysAgo === 0 || (f.lastAttemptDaysAgo === 1 && !friday)) return { action: 'Leave today', tone: 'bg-paper-2 text-slate', why: 'Attempted in the last two days. Next run.' }
  if (/insufficient/i.test(f.reason)) return { action: 'Retry once', tone: 'bg-moss-soft text-moss', why: `Temporary shortfall, ${f.lastAttemptDaysAgo} days since the last attempt${friday && f.lastAttemptDaysAgo === 1 ? ', and Friday is payday' : ''}.` }
  return { action: 'Contact', tone: 'bg-amber-soft text-amber', why: 'Routed to a named action.' }
}

export default function RetryDemo() {
  const [ran, setRan] = useState(false)
  const [friday, setFriday] = useState(false)
  const [results, setResults] = useState<Record<string, 'pending' | 'failed'>>({})

  function run() {
    setRan(true)
    setResults({})
    FAILED.forEach((f, i) => {
      const d = decide(f, friday)
      if (d.action === 'Retry once') setTimeout(() => setResults((r) => ({ ...r, [f.name]: f.name === 'Ade O' ? 'failed' : 'pending' })), 500 + i * 300)
    })
  }

  const retried = FAILED.filter((f) => decide(f, friday).action === 'Retry once')
  const value = retried.reduce((t, f) => t + f.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-mist bg-white p-4">
        <button onClick={run} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper">Run the routine</button>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={friday} onChange={(e) => { setFriday(e.target.checked); setRan(false); setResults({}) }} className="accent-moss" />It is Friday (payday rule)</label>
        <span className="ml-auto font-mono text-sm text-ink">{retried.length} retries worth £{value.toFixed(2)} · {FAILED.length - retried.length} routed to a person</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-mist bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-paper-2 text-left font-mono text-[11px] uppercase tracking-wider text-slate">
            <tr><th className="px-4 py-2.5 font-medium">Member</th><th className="px-4 py-2.5 font-medium">Failure</th><th className="px-4 py-2.5 font-medium">Decision</th><th className="px-4 py-2.5 font-medium">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {FAILED.map((f) => {
              const d = decide(f, friday)
              const r = results[f.name]
              return (
                <tr key={f.name}>
                  <td className="px-4 py-2.5"><span className="font-semibold text-ink">{f.name}</span><span className="block text-xs text-slate">£{f.amount} · {f.method === 'dd' ? 'Direct Debit' : f.method} · last visit {f.lastVisitDays}d</span></td>
                  <td className="px-4 py-2.5 text-slate"><span className="block text-ink">{f.reason}</span><span className="text-xs">{f.attempts} attempts, last {f.lastAttemptDaysAgo}d ago, {f.monthsFailed} month{f.monthsFailed === 1 ? '' : 's'}</span></td>
                  <td className="px-4 py-2.5">{ran ? <><span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${d.tone}`}>{d.action}</span><span className="block text-xs text-slate">{d.why}</span></> : <span className="text-xs text-slate">waiting</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r === 'pending' && <span className="text-moss">PENDING, awaiting the bank</span>}{r === 'failed' && <span className="text-signal">Failed again. No second attempt.</span>}{ran && d.action !== 'Retry once' && <span className="text-slate">on the board</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-slate">Retries run unattended Monday, Wednesday and Friday. Anything that needs a message or a cancellation is drafted and put in front of a person, never sent on its own. This routine took Hoddesdon&apos;s failed book from about 10% to 3.6%.</p>
    </div>
  )
}
