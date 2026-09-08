'use client'

/**
 * Friday forecast (in testing). Move what gets worked before the Wednesday
 * cut off and watch this week's payout and next week's move. The payout
 * schedule and fee rate are set per club on setup; the demo uses a simple
 * "paid Friday for what settled by Wednesday" schedule with a flat fee.
 * Numbers are a fixed illustrative week.
 */
import { useState } from 'react'

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

export default function CashDemo() {
  const [arrearsWorked, setArrearsWorked] = useState(40)
  const [pendingClears, setPendingClears] = useState(95)
  const settledByWed = 24800
  const pending = 7198
  const arrears = 1884
  const feeRate = 0.015
  const recoveredShare = 0.8 // eight in ten contacted members pay
  const worked = arrears * (arrearsWorked / 100) * recoveredShare
  const pendingIn = pending * (pendingClears / 100)
  const gross = settledByWed + pendingIn + worked
  const fees = gross * feeRate
  const friday = gross - fees
  const leftUnworked = arrears - worked / recoveredShare
  const nextFriday = (leftUnworked * 0.5 + 9800) * (1 - feeRate)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5 rounded-2xl border border-mist bg-white p-5">
        <div className="flex items-center gap-2 rounded-xl bg-amber-soft px-3 py-2 text-xs text-ink">
          <span className="rounded-full bg-amber px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-paper">In testing</span>
          <span>Live at one club. Your payout schedule and fee rate are set on the setup call, then the forecast is checked against your first month of credits before it goes in your brief.</span>
        </div>
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
          <p><strong className="text-ink">How it is worked out.</strong> What settled by Wednesday, plus the pending Direct Debits expected to clear, plus arrears recovered in time, less your processor&apos;s fees (1.5% here). Whatever your processor&apos;s schedule is, weekly, twice monthly or monthly, gymIQ learns it from your statements and forecasts each credit with a range.</p>
        </div>
      </div>
      <div className="rounded-2xl bg-ink p-5 text-paper">
        <p className="font-mono text-[11px] uppercase tracking-wider text-paper/75">This Friday, 11 September</p>
        <p className="mt-1 font-display text-5xl font-extrabold tracking-tight text-lime">{gbp(friday)}</p>
        <p className="text-xs text-paper/75">range {gbp(friday * 0.9)} to {gbp(friday * 1.05)}</p>
        <dl className="mt-6 divide-y divide-ink-3 border-t border-ink-3 text-sm">
          <div className="flex justify-between py-2.5"><dt className="text-paper/90">Settled by Wednesday</dt><dd className="font-mono">{gbp(settledByWed)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/90">Pending that clears</dt><dd className="font-mono">{gbp(pendingIn)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/90">Arrears recovered in time</dt><dd className="font-mono text-lime">{gbp(worked)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/90">Processor fees</dt><dd className="font-mono">−{gbp(fees)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="font-semibold text-paper">Paid Friday</dt><dd className="font-mono font-semibold">{gbp(friday)}</dd></div>
          <div className="flex justify-between py-2.5"><dt className="text-paper/90">Next Friday, forecast</dt><dd className="font-mono">{gbp(nextFriday)}</dd></div>
        </dl>
        <p className="mt-4 font-mono text-[11px] leading-relaxed text-paper/85">Wed 9 Sep 16:00 alert: £{Math.round(leftUnworked).toLocaleString('en-GB')} of arrears not yet retried. Anything after tonight lands on 18 September, not the 11th.</p>
      </div>
    </div>
  )
}
