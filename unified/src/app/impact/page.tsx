import Link from 'next/link'
import { LogoLink } from '@/components/brand/Logo'
import { ArrowRight } from 'lucide-react'
import { IMPACT, STORIES, MONTHLY, CLUB, impactTotals } from '@/lib/impact'
import RoiCalculator from '@/components/marketing/RoiCalculator'
import { PRICE_PER_CLUB, WALKTHROUGH_HREF } from '@/lib/site'

export const metadata = {
  title: 'What AI has made at one gym, month by month',
  description:
    'A line by line account of what the intelligence layer has made and saved at an énergie Fitness club in Hertfordshire, measured against the club’s own records, and a calculator for yours.',
  alternates: { canonical: '/impact' },
}

const gbp = (n: number) => `£${(Math.round(n / 1000) * 1000).toLocaleString('en-GB')}`
const gbpExact = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

export default function ImpactPage() {
  const t = impactTotals()
  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      <header className="sticky top-0 z-30 border-b border-mist/80 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <LogoLink />
          <a href={WALKTHROUGH_HREF} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper transition hover:bg-ink-2">
            Book a walkthrough
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Headline */}
      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-lime">{CLUB.name} · since {CLUB.since}</p>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[0.98] tracking-tight sm:text-7xl">
            Six figures in the first year. From one club, on a conservative count.
          </h1>
          <p className="mt-6 max-w-2xl text-xl leading-relaxed text-paper/88">
            That is what the intelligence layer has made and saved at a 1,617 member franchise gym, measured against the club&apos;s own records, with the assumption written next to every line. The fee for the year was {gbpExact(PRICE_PER_CLUB * 12)}. The workings are below, so the number can be argued line by line rather than taken on trust.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <Big v={`${Math.floor(t.recurringConservative / 10000) * 10}k+`} l="a year, recurring" s="collection, pricing, retention, the analyst" />
            <Big v={`${Math.floor(t.oneOffConservative / 10000) * 10}k+`} l="one off, this year" s="refit supplier, price test" />
            <Big v={`${Math.round(t.conservative / (PRICE_PER_CLUB * 12))}x`} l="the fee, conservative" s={`${gbpExact(PRICE_PER_CLUB)} a month`} />
            <Big v="3.6%" l="failed payments, July settled" s="from about 10%" />
          </div>
        </div>
      </section>

      {/* Ledger */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">The ledger</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Every pound, with its basis.</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate">
            Measured means the figure is read from the club&apos;s records. Estimated means a measured input multiplied by an assumption you can see. Lines that overlap are half counted or not counted, and it says so.
          </p>
        </div>
        <div className="mt-10 overflow-x-auto rounded-3xl border border-mist bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-paper-2 text-left font-mono text-[11px] uppercase tracking-wider text-slate">
              <tr>
                <th className="px-5 py-3 font-medium">Area</th>
                <th className="px-5 py-3 font-medium">What happened</th>
                <th className="px-5 py-3 font-medium">Basis</th>
                <th className="px-5 py-3 text-right font-medium">Conservative</th>
                <th className="px-5 py-3 text-right font-medium">Central</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {IMPACT.map((l) => (
                <tr key={l.key} className={l.counted ? '' : 'text-slate'}>
                  <td className="whitespace-nowrap px-5 py-4 align-top font-semibold text-ink">{l.area}</td>
                  <td className="px-5 py-4 align-top">
                    <p className="font-display text-base font-bold text-ink">{l.title}</p>
                    <p className="mt-1 text-slate">{l.what}</p>
                    <p className="mt-1 text-xs text-slate">{l.how}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 align-top">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${l.basis === 'measured' ? 'bg-moss-soft text-moss' : 'bg-amber-soft text-amber-ink'}`}>{l.basis}</span>
                    <span className="ml-1 font-mono text-[11px] text-slate">{l.kind}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right align-top font-mono tabular-nums text-ink">{l.counted ? gbpExact(l.conservative) : 'not counted'}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-right align-top font-mono tabular-nums text-ink">{l.counted ? gbpExact(l.central) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ink text-paper">
              <tr>
                <td className="px-5 py-4 font-display text-base font-bold" colSpan={3}>First year, counted lines only</td>
                <td className="px-5 py-4 text-right font-mono text-base tabular-nums text-lime">{gbpExact(t.conservative)}</td>
                <td className="px-5 py-4 text-right font-mono text-base tabular-nums text-lime">{gbpExact(t.central)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Trend */}
      <section className="bg-paper-2">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">The trend</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Attrition and overdue, month by month.</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate">
              July, the first full month, was the lowest attrition the club has recorded. August is high because the club now clears members who have stopped paying from the roster every month, on purpose; they were always leaving, they are now counted the month they go.
            </p>
          </div>
          <Trend />
        </div>
      </section>

      {/* Stories */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">Six things that happened</p>
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">What it looks like when the numbers read themselves.</h2>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {STORIES.map((s) => (
            <article key={s.title} className="flex flex-col rounded-3xl border border-mist bg-white p-7">
              <p className="font-mono text-xs uppercase tracking-wider text-slate">{s.date}</p>
              <h3 className="mt-2 font-display text-2xl font-bold leading-tight text-ink">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-slate">{s.body}</p>
              <p className="mt-auto pt-5 font-mono text-sm font-medium text-amber-ink">{s.figure}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Calculator */}
      <section id="calculator" className="bg-paper-2">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-moss">Your club</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Four numbers you already know.</h2>
            <p className="mt-5 text-lg leading-relaxed text-slate">Move the sliders. The rates are the Hertfordshire club&apos;s conservative ones and every line says which.</p>
          </div>
          <div className="mt-10">
            <RoiCalculator pricePerMonth={PRICE_PER_CLUB} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-moss text-paper">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <h2 className="max-w-3xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">The first month is a free audit of your membership file. The fee starts when the brief does.</h2>
          <p className="mt-5 max-w-xl text-lg text-paper/90">
            And every month after that, a 45 minute review of what it found, what was acted on, and what it was worth. If a month&apos;s review cannot show at least the fee in found money, that month is free.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href={WALKTHROUGH_HREF} className="inline-flex items-center gap-2 rounded-full bg-lime px-6 py-3.5 text-base font-semibold text-ink transition hover:bg-paper">
              Book a walkthrough
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/#audit" className="text-base font-semibold text-paper underline-offset-4 hover:underline">Or start with the free audit</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-mist bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 text-xs text-slate sm:flex-row sm:items-center sm:px-8">
          <span>© {new Date().getFullYear()} GymIQ AI Ltd · figures from the club&apos;s own records, September 2026</span>
          <nav className="flex gap-5">
            <Link href="/case-study" className="hover:text-ink">Case study</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}

function Big({ v, l, s }: { v: string; l: string; s: string }) {
  return (
    <div>
      <p className="font-display text-3xl font-extrabold tracking-tight text-lime sm:text-4xl">{v}</p>
      <p className="mt-1 text-sm font-semibold text-paper">{l}</p>
      <p className="text-xs text-paper/75">{s}</p>
    </div>
  )
}

function Trend() {
  const w = 720, h = 260, pad = 40
  const maxA = 10, maxO = 100
  const n = MONTHLY.length
  const bw = (w - pad * 2) / n
  return (
    <figure className="mt-10 overflow-x-auto rounded-3xl border border-mist bg-white p-5">
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full min-w-[560px]" role="img" aria-label="Monthly attrition as bars and overdue members as a line, February to August 2026">
        {[2.5, 5, 7.5, 10].map((v) => (
          <g key={v}>
            <line x1={pad} y1={h - pad - (v / maxA) * (h - pad * 2)} x2={w - pad} y2={h - pad - (v / maxA) * (h - pad * 2)} stroke="#DCDFD8" />
            <text x={pad - 8} y={h - pad - (v / maxA) * (h - pad * 2) + 4} textAnchor="end" fontSize="11" fill="#5E6B66" fontFamily="ui-monospace, Menlo, monospace">{v}%</text>
          </g>
        ))}
        {MONTHLY.map((m, i) => {
          const x = pad + i * bw + bw * 0.2
          const bh = (m.attrition / maxA) * (h - pad * 2)
          return (
            <g key={m.month}>
              <rect x={x} y={h - pad - bh} width={bw * 0.6} height={bh} fill={m.live ? (m.note ? '#E0A94A' : '#0F6E63') : '#B8C0BB'} />
              <text x={x + bw * 0.3} y={h - pad - bh - 6} textAnchor="middle" fontSize="11" fill="#0F1614" fontFamily="ui-monospace, Menlo, monospace">{m.attrition}%</text>
              <text x={x + bw * 0.3} y={h - pad + 16} textAnchor="middle" fontSize="12" fill={m.live ? '#0F6E63' : '#5E6B66'} fontWeight={m.live ? 700 : 400}>{m.month}</text>
            </g>
          )
        })}
        <polyline
          fill="none"
          stroke="#0F1614"
          strokeWidth="2"
          strokeDasharray="5 4"
          points={MONTHLY.map((m, i) => `${pad + i * bw + bw * 0.5},${h - pad - (m.overdue / maxO) * (h - pad * 2)}`).join(' ')}
        />
        {MONTHLY.map((m, i) => (
          <g key={m.month + 'o'}>
            <circle cx={pad + i * bw + bw * 0.5} cy={h - pad - (m.overdue / maxO) * (h - pad * 2)} r="4" fill="#0F1614" />
            <text x={pad + i * bw + bw * 0.5 + 8} y={h - pad - (m.overdue / maxO) * (h - pad * 2) - 6} fontSize="10" fill="#0F1614" fontFamily="ui-monospace, Menlo, monospace">{m.overdue}</text>
          </g>
        ))}
        <text x={w - pad} y={pad - 14} textAnchor="end" fontSize="11" fill="#5E6B66">bars: attrition · dashed line: overdue members at month end</text>
      </svg>
      <figcaption className="mt-3 text-xs text-slate">
        Clean months only; January 2026 is excluded as a roster clean up month. Green bars are months with gymIQ live. August is amber: 41 members who had already stopped paying were processed off the roster in three days. December 2025 closed with 134 overdue members; August 2026 closed with 24.
      </figcaption>
    </figure>
  )
}
