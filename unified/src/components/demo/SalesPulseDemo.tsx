'use client'

/**
 * Hourly sales pulse. Joins today against the club's own expected pace for
 * this day of the week and month, and the alert that fires when a day or a
 * price test drifts off the model. Press play to run a day.
 */
import { useEffect, useState } from 'react'

const HOURS = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21']
// Expected cumulative joins by hour for a September Monday (index 1.06, 2.88 a day baseline).
const EXPECTED = [0.1, 0.3, 0.6, 0.9, 1.2, 1.5, 1.7, 1.9, 2.1, 2.3, 2.6, 2.9, 3.1, 3.2, 3.3]
const GOOD = [0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4]
const BAD = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1]

export default function SalesPulseDemo() {
  const [scenario, setScenario] = useState<'good' | 'bad'>('good')
  const [h, setH] = useState(0)
  const [playing, setPlaying] = useState(false)
  const actual = scenario === 'good' ? GOOD : BAD

  useEffect(() => {
    if (!playing) return
    if (h >= HOURS.length - 1) { setPlaying(false); return }
    const t = setTimeout(() => setH((x) => x + 1), 450)
    return () => clearTimeout(t)
  }, [playing, h])

  const pace = actual[h] / Math.max(0.1, EXPECTED[h])
  const alert = h >= 6 && pace < 0.45
    ? `Riverside 1${HOURS[h].slice(1)}:00: ${actual[h]} join${actual[h] === 1 ? '' : 's'} against ${EXPECTED[h].toFixed(1)} expected by now, ${Math.round(pace * 100)}% of pace. Third weekday running below half. Check the join zone and the price on the website before 5pm footfall; a test join takes two minutes.`
    : h >= 10 && pace > 1.2
      ? `Riverside 1${HOURS[h].slice(1)}:00: ${actual[h]} joins against ${EXPECTED[h].toFixed(1)} expected, ${Math.round(pace * 100)}% of pace. Best Monday since June. Whoever is on the desk today, tell them.`
      : null

  const w = 640, ht = 200, pad = 32
  const maxY = 5
  const x = (i: number) => pad + (i / (HOURS.length - 1)) * (w - pad * 2)
  const y = (v: number) => ht - pad - (v / maxY) * (ht - pad * 2)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-mist bg-white p-4">
        <button onClick={() => { setScenario('good'); setH(0); setPlaying(true) }} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper">Play a good Monday</button>
        <button onClick={() => { setScenario('bad'); setH(0); setPlaying(true) }} className="rounded-full border border-mist px-4 py-1.5 text-sm font-semibold text-ink">Play a bad price test</button>
        <span className="ml-auto font-mono text-sm text-ink">{HOURS[h]}:00 · {actual[h]} joins · expected {EXPECTED[h].toFixed(1)} · {Math.round(pace * 100)}% of pace</span>
      </div>
      <figure className="rounded-2xl border border-mist bg-white p-4">
        <svg viewBox={`0 0 ${w} ${ht}`} className="block h-auto w-full" role="img" aria-label="Joins today against expected pace by hour">
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}><line x1={pad} y1={y(v)} x2={w - pad} y2={y(v)} stroke="#DCDFD8" /><text x={pad - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#5E6B66" fontFamily="ui-monospace, Menlo, monospace">{v}</text></g>
          ))}
          <polyline fill="none" stroke="#B8C0BB" strokeWidth="2" strokeDasharray="4 3" points={EXPECTED.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          <polyline fill="none" stroke={pace < 0.45 && h >= 6 ? '#B03A2E' : '#0F6E63'} strokeWidth="3" points={actual.slice(0, h + 1).map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          <circle cx={x(h)} cy={y(actual[h])} r="5" fill={pace < 0.45 && h >= 6 ? '#B03A2E' : '#0F6E63'} />
          {HOURS.map((hh, i) => (
            <text key={hh} x={x(i)} y={ht - pad + 16} textAnchor="middle" fontSize="10" fill="#5E6B66">{hh}</text>
          ))}
          <text x={w - pad} y={pad - 10} textAnchor="end" fontSize="10" fill="#5E6B66">dashed: expected pace for this day, from three years of the club&apos;s own joins</text>
        </svg>
      </figure>
      <div className="rounded-2xl bg-ink p-4 text-paper">
        <p className="font-mono text-[11px] uppercase tracking-wider text-paper/50">Hourly pulse, to the owner&apos;s phone</p>
        <p className="mt-2 min-h-[48px] font-mono text-[12px] leading-relaxed text-paper/85">{alert ?? 'Quiet. Nothing fires while the day is on pace; you only hear about it when something has moved.'}</p>
      </div>
      <p className="text-sm text-slate">This is how a price test at the Hertfordshire club was caught in five days rather than seven weeks: weekday sales at 1 against 8.4 expected, odds of about 1 in 450 on the club&apos;s own model, and the owner reverted before the weekend.</p>
    </div>
  )
}
