'use client'

/**
 * What gymIQ is worth to a club, from four numbers the owner knows.
 *
 * Every rate is the conservative one from the Hertfordshire club and is shown on the page,
 * so the sum can be argued with line by line rather than taken on trust.
 */
import { useMemo, useState } from 'react'

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

interface Props {
  pricePerMonth: number
}

export default function RoiCalculator({ pricePerMonth }: Props) {
  const [members, setMembers] = useState(900)
  const [arpu, setArpu] = useState(32)
  const [failure, setFailure] = useState(8)
  const [attrition, setAttrition] = useState(6)

  const r = useMemo(() => {
    const billed = members * arpu
    // Collection: failure rate brought to 4%, only the gap above that counts.
    const collection = Math.max(0, (failure - 4) / 100) * billed * 12
    // Retention: one point of monthly attrition, each saved member worth 7.55 months.
    const retentionMembers = Math.min(1, Math.max(0, attrition - 3.5)) / 100 * members
    const retention = retentionMembers * arpu * 7.55 * 12
    // Pricing: 1.5% of billing sits below list or on an outgrown rate at a typical club (the Hertfordshire club: 2.6%).
    const pricing = billed * 0.015 * 12
    // Renewals: 3% of members have a term ending each quarter; three in ten renew when asked.
    const renewals = members * 0.03 * 0.3 * arpu * 12
    // Analyst time: half a day a week of reporting and chasing the owner or manager stops doing.
    const time = 0.5 * 8 * 52 * 25
    const total = collection + retention + pricing + renewals + time
    const fee = pricePerMonth * 12
    return { billed, collection, retention, retentionMembers, pricing, renewals, time, total, fee, net: total - fee, multiple: fee ? total / fee : 0 }
  }, [members, arpu, failure, attrition, pricePerMonth])

  return (
    <div className="grid grid-cols-1 gap-6 rounded-3xl border border-mist bg-paper p-6 sm:p-8 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-2">
        <Slider label="Members on the books" value={members} min={150} max={4000} step={10} onChange={setMembers} format={(v) => v.toLocaleString('en-GB')} />
        <Slider label="Average monthly fee" value={arpu} min={15} max={80} step={1} onChange={setArpu} format={(v) => `£${v}`} />
        <Slider label="Payment failure rate today" value={failure} min={2} max={15} step={0.5} onChange={setFailure} format={(v) => `${v}%`} hint="Failed as a share of what you bill in a month. Most clubs sit between 6 and 10." />
        <Slider label="Monthly attrition today" value={attrition} min={2} max={12} step={0.5} onChange={setAttrition} format={(v) => `${v}%`} hint="Leavers as a share of the roster. Independent gyms run 5 to 8." />
      </div>
      <div className="lg:col-span-3">
        <div className="rounded-2xl bg-ink p-6 text-paper">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-paper/75">A year of gymIQ at your club, conservative</p>
          <p className="mt-2 font-display text-5xl font-extrabold tracking-tight text-lime">{gbp(r.total)}</p>
          <p className="mt-1 text-sm text-paper/85">against {gbp(r.fee)} of fees. {r.multiple >= 1 ? `${r.multiple.toFixed(1)} times the cost.` : ''}</p>
          <dl className="mt-6 divide-y divide-ink-3 border-t border-ink-3 text-sm">
            <Row k={`Failed payments brought to 4%`} v={gbp(r.collection)} sub={`on ${gbp(r.billed)} billed a month`} />
            <Row k="One point of attrition, members kept" v={gbp(r.retention)} sub={`${Math.round(r.retentionMembers)} members a month, 7.55 months each`} />
            <Row k="Outgrown rates and legacy prices corrected" v={gbp(r.pricing)} sub="1.5% of billing; the Hertfordshire club found 2.6%" />
            <Row k="Renewals asked for instead of lapsing" v={gbp(r.renewals)} sub="3% of members a quarter, three in ten say yes" />
            <Row k="Reporting and chasing you stop doing" v={gbp(r.time)} sub="half a day a week at £25 an hour" />
          </dl>
        </div>
        <p className="mt-3 text-xs text-slate">
          Rates are the conservative case from an énergie Fitness club in Hertfordshire and are stated on each line. Nothing here counts capital decisions, which at that club were worth more than everything above combined.
        </p>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold text-ink">{label}</label>
        <span className="font-mono text-sm text-ink">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-moss"
        aria-label={label}
      />
      {hint && <p className="mt-1 text-xs text-slate">{hint}</p>}
    </div>
  )
}

function Row({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 py-3">
      <div>
        <dt className="text-paper/90">{k}</dt>
        <dd className="text-xs text-paper/75">{sub}</dd>
      </div>
      <dd className="font-mono tabular-nums text-lime">{v}</dd>
    </div>
  )
}
