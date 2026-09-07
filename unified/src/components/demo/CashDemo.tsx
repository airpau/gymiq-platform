'use client'

/**
 * Friday credit forecast. Move what gets worked before the Wednesday cut off
 * and watch this week's payout, next week's, and the month end banked figure
 * move. Numbers are a fixed illustrative week.
 */
import { useState } from 'react'

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

export default function CashDemo() {
  const [arrearsWorked, setArrearsWorked] = useState(40)
  const [pendingClears, setPendingClears] = useState(95)
  const settledByWed = 24800
  const pending = 7198
  const arrears = 1884
  const worked = arrears * (arrearsWorked / 100) * 0.8
  const pendingIn = pending * (pendingClears / 100)
  const base = settledByWed + pendingIn + worked
  const friday = base * 0.8
  const nextFriday = (arrears - worked / 0.8) * 0.8 * 0.5 + 9800
  const monthBanked = (44500 + worked + pendingIn * 0.3) * 0.88

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5 rounded-2xl border border-mist bg-white p-5">
        <div>
          <div className="flex items-baseline justify-between"><label className="text-sm font-semibold text-ink">Arrears worked before Wednesday</label><span className="font-mono text-sm">{arrearsWorked}% of £1,884</span></div>
          <input type="range" min={0} max={100} step={5} value={arrearsWorked} onChange={(e) => setArrearsWorked(Number(e.target.value))} className="mt-2 w-full accent-moss" aria-label="Arrears worked" />
          <p className="mt-1 text-xs text-slate">The 47 members on the board. Eight in ten who are contacted pay.</p>
        </div>
        <div>
          <div className="flex items-baseline justify-between"><label className="text-sm font-semibold text-ink">Pending Direct Debits that clear</label><span className="font-mono text-sm">{pendingClears}% of £7,198</span></div>
          <input type="range" min={80} max={100} step={1} value={pendingClears} onChange={(e) => setPendingClears(Number(e.target.value))} className="mt-2 w-full accent-moss" aria-label="Pending clearing" />
          <p className="mt-1 text-xs text-slate">Usually 95%. The brief tells you when a batch is settling slower than normal.</p>
        </div>
        <div className="rounded-xl bg-paper-2 p-3 text-xs text-slate">
          <p><strong className="text-ink">How the club is paid.</strong> The processor pays 80% of what settled by Wednesday on Friday, and the balance on the fourth working day of the next month. Banked is collected times 0.88 after the franchise fee. The model was verified within 0.4% against six months of bank statements.</p>
        </div>
      </div>
      <div className="rounded-2xl bg-ink p-5 text-paper">
        <p className="font-mono text-[11px] uppercase tracking-wider text-paper/50">This Friday, 11 September</p>
        <p className="mt-1 font-display text-5xl font-extrabold tracking-tight text-lime">{gbp(friday)}</p>
        <p className="text-xs text-paper/50">range {gbp(friday * 0.85)} to {gbp(friday * 1.1)}</p>
        <dl className="mt-6 divide-y divide-ink-3 border-t border-ink-3 text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-paper/80">Settled by Wednesday</dt><dd className="font-mono">{gbp(settledByWed)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/80">Pending that clears</dt><dd className="font-mono">{gbp(pendingIn)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/80">Arrears recovered in time</dt><dd className="font-mono text-lime">{gbp(worked)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/80">Paid Friday at 80%</dt><dd className="font-mono">{gbp(friday)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/80">Next Friday, forecast</dt><dd className="font-mono">{gbp(nextFriday)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/80">Month end banked, central</dt><dd className="font-mono">{gbp(monthBanked)}</dd></div>
        </dl>
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-paper/60">Wed 9 Sep 16:00 alert: £{Math.round(arrears - worked / 0.8).toLocaleString('en-GB')} of arrears not yet retried. Anything after tonight lands on 18 September, not the 11th.</p>
      </div>
    </div>
  )
}
