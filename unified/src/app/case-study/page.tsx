import Link from 'next/link'
import { LogoLink } from '@/components/brand/Logo'
import { ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Case study: AI running an énergie Fitness club in Hertfordshire',
  alternates: { canonical: '/case-study' },
  description:
    'What gymIQ found in its first quarter at a 1,600 member franchise gym: collection, hidden money, retention and cash, with the workings.',
}

const CONTACT = 'paul@gymiq.ai'

/* Monthly attrition on the roster, Feb to Aug 2026. Bars are drawn to one scale (10% = 210px). */
const MONTHS = [
  { m: 'Feb', rate: 5.23 },
  { m: 'Mar', rate: 4.02 },
  { m: 'Apr', rate: 4.38 },
  { m: 'May', rate: 8.13 },
  { m: 'Jun', rate: 6.72 },
  { m: 'Jul', rate: 3.65, live: true },
  { m: 'Aug', rate: 8.47, adjusted: 6.0 },
]

export default function CaseStudyPage() {
  return (
    <div className="min-h-screen bg-white text-ink antialiased">
      <header className="border-b border-mist bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <LogoLink size="sm" />
          <Link href="/#pricing" className="text-sm font-medium text-moss hover:text-moss">Pricing</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-12">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-moss">Client story</p>
        <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
          One club. Ninety days. Every number in the owner&apos;s pocket by 06:00.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate">
          How an énergie Fitness club in Hertfordshire put an AI operating layer over its gym software, and what it found in the first quarter.
        </p>

        <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-2 border-t border-mist pt-5 text-sm text-slate sm:grid-cols-2">
          <Meta k="Club" v="énergie Fitness franchise, Hertfordshire" />
          <Meta k="Size" v="1,617 on roster, 1,472 active paying" />
          <Meta k="Platform" v="Glofox" />
          <Meta k="Period" v="July to September 2026" />
        </dl>

        <H2>The problem every owner already knows</H2>
        <P>
          A 1,600 member club produces roughly £47,000 of billing a month, and none of it arrives cleanly. Direct Debits bounce, cards expire, members drift, and the software reports each piece in a different screen. The owner finds out at month end, from a spreadsheet, what had already gone wrong three weeks earlier.
        </P>
        <P>
          At this club the owner runs it alongside other businesses. He needed to know three things every morning without logging in anywhere: what came in, who is leaving, and what to do about it today.
        </P>

        <H2>What it found in the first quarter</H2>
        <P>These are the club&apos;s own figures, pulled from gymIQ&apos;s tables on 6 September 2026. Where a number is a comparison, the basis is stated.</P>

        <H3>Collection</H3>
        <Ledger rows={[
          ['Payment failure rate before gymIQ', 'The failed book the club was carrying when the routine started, August 2026', 'about 10%', 'warn'],
          ['Payment failure rate, July settled', 'Failed as a share of submitted once the month cleared: 48,633 collected on 50,427', '3.6%', 'good'],
          ['Collection rate, July and August once settled', 'Both months clear to over 99% of what was billed', '99.4%', 'good'],
          ['Overdue members', '10 August, then 6 September', '76 to 58', 'good'],
          ['September arrears identified for the Wednesday cut off', '47 live members, worth on Friday’s credit', '£1,884 to £1,507'],
        ]} />
        <Cap>The retry routine runs unattended three times a week. It retries only temporary shortfalls not attempted in the last two days, once per member, and routes everything else to a named action: new card, mandate to re-set, or a cancellation to review. A month reads worse on the day it closes than a week later, because pending Direct Debits take days to settle; the settled figure is the true one.</Cap>

        <H3>Money that was hiding in the membership file</H3>
        <Ledger rows={[
          ['Price rise found for October', 'Students, corporates, Classic and WOW, banked after franchise fee', '£1,103 a month, £13,239 a year', 'good'],
          ['Students aged 19 and over still on under 19 rates', '47 members, median nine months past their birthday', '£970 a month', 'warn'],
          ['Memberships with a term ending and no renewal booked', '50 members, 39 expiring within six weeks, handed to staff as a list', '£1,289 a month', 'warn'],
          ['Card payers failing at 2.4 times the Direct Debit rate', 'Migration campaign recommended, no capital needed', 'about £530 a month'],
          ['A membership plan sold at a price nobody authorised', 'Four sales in seven weeks, flagged the day it was found', 'found'],
        ]} />

        <H3>Retention</H3>
        <P>
          gymIQ replaced the club&apos;s blanket &ldquo;30 days absent equals dormant&rdquo; rule with a per member measure: how far each person has drifted from their own habit. Paused members are excluded, overdue members are always contacted, and long tenured low users are left alone. The calls go on the board every morning.
        </P>
        <Chart />
        <Ledger rows={[
          ['July 2026 attrition', 'First full month with gymIQ’s daily retention calls. Lowest month in the club’s recorded history', '3.65%', 'good'],
          ['Average of the five clean months before it', 'February to June', '5.7%'],
          ['Leavers, first six days of September', 'Against the same six days of August', '7 vs 19', 'good'],
          ['Roster, 1 to 6 September', 'Grew six days running', '1,611 to 1,617', 'good'],
        ]} />
        <Note>
          <strong>How we count.</strong> Attrition is leavers divided by the opening roster. August is shown in full because the club now clears members who have stopped paying from the roster every month, on purpose, and they show up as leavers the month they are processed. Before gymIQ they stayed on the roster as overdue and nobody chased them; now they are found, chased, and if they will not pay, removed. The system&apos;s own lost members report puts August at 136 leavers, 8.1%. On a 1,600 member club every point of monthly attrition is 16 members, or about £490 a month of billing that then has to be re-sold.
        </Note>

        <H3>Cash</H3>
        <Ledger rows={[
          ['Friday payout forecast', 'Central estimate for 11 September, with a stated range', '£20,471'],
          ['Banked model against bank statements', 'Collected × 0.88 after franchise fee, verified on June and July', 'within 0.4%', 'good'],
          ['Month end banked, projected on 6 September', 'Range given, not a single number', '£41,185 to £44,335'],
        ]} />
        <Cap>A price trial on new joiner rates in August was caught within five days: weekday sales fell to 1 against 8.4 expected, odds of about 1 in 450 on the club&apos;s own seasonality model. It was reverted at a cost of about six joins rather than a month&apos;s worth.</Cap>

        <H2>What the owner actually sees</H2>
        <P>The Sunday evening close, as it landed on the owner&apos;s phone on 6 September 2026.</P>
        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-ink p-5 font-mono text-[13px] leading-relaxed text-paper/92">{`Evening close, Sun 6 Sep: £26,413.94 collected MTD, 1,472 active paying

TOP 3
1. Retention is good. 7 leavers this month against 19 over the same six days of August, and the roster has GROWN six days running, 1,611 to 1,617.
2. Selling is the problem. Joins project 77 against a 100 target and the 95 gate. 20 joins in six days.
3. Overdue is 58, down from 76 on 10 August. 22 on Direct Debit, 28 on card, 8 flexible. The card book is where the failures live.

SALES 1 to 6 Sep: submitted £30,069.78, successful £26,413.94, pending £7,198.20, failed £2,035.31. Collection rate 87.84 pct, failure rate 6.77 pct, the best of the month.

MEMBERS: roster 1,617, active 1,480, active paying 1,472, paused 79, overdue 58. Overdue by method: DD 22 of 1,220, card 28 of 355, flexible 8 of 28, cash 0 of 13.

BIGGEST LEVER: £1,958.35 of September dated arrears across 48 members, worth about £1,567 on Friday if cleared before Wednesday 9 September.`}</pre>
        <Cap>Every brief opens with a verdict, names the one lever worth pulling, and says plainly when the data is stale rather than pretending. The owner can reply to it in plain English and get an answer from the same system.</Cap>

        <H2>What it took to run</H2>
        <P>
          No new software for staff to learn. The club&apos;s gym software (Glofox, in this club&apos;s case) stays exactly as it is. gymIQ reads it through the club&apos;s own login, keeps its own history, and writes to a one page task board the front desk opens on a tablet. Set up took an evening for the data connection and a week of tuning the brief to how the owner thinks.
        </P>
        <P>
          Three things to be honest about. The retention calls only work if someone makes them, so the board is capped at a list a small desk can clear in an hour and reports back who cleared what. The payout model is checked against the bank statements by hand each month until the direct bank connection is approved. And the first month is mostly gymIQ learning what &ldquo;normal&rdquo; looks like for your club, so the forecasts sharpen from month two.
        </P>
        <Note>
          <strong>For énergie clubs specifically.</strong> The payout model, the Friday 80 per cent credit and the fourth working day reconciliation, the franchise fee and the software setup are the same as this club&apos;s, so the cash forecasting works from day one without re-modelling. Each club connects its own Glofox login; nothing is shared between clubs.
        </Note>

        <div className="mt-14 rounded-2xl border border-mist bg-paper-2 p-7">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">See your own club&apos;s numbers</h2>
          <p className="mt-3 text-base leading-relaxed text-slate">
            A read only login to your gym software is enough for a first brief: your failure rate by payment method, your overdue book with a recommended action per member, your expiring terms, and anyone on a rate they no longer qualify for.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href="/book"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-2"
            >
              Book a walkthrough
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link href="/impact" className="text-sm font-medium text-moss hover:text-moss-deep">What it made, line by line</Link>
          </div>
          <p className="mt-4 text-sm text-slate">Paul Airey, énergie Fitness franchisee, Hertfordshire · {CONTACT}</p>
        </div>
      </main>
    </div>
  )
}

/* ---------- small pieces ---------- */

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="font-semibold text-ink">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-14 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 text-lg font-semibold tracking-tight text-ink">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate">{children}</p>
}

function Cap({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate">{children}</p>
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 max-w-2xl rounded-r-lg border-l-[3px] border-moss bg-moss-soft px-5 py-4 text-sm leading-relaxed text-ink-3">
      {children}
    </div>
  )
}

type Row = [string, string, string, ('good' | 'warn')?]

function Ledger({ rows }: { rows: Row[] }) {
  return (
    <div className="mt-4 border-t border-mist">
      {rows.map(([label, sub, value, tone]) => (
        <div key={label} className="grid grid-cols-1 items-baseline gap-1 border-b border-mist py-3 sm:grid-cols-[1fr_auto] sm:gap-6">
          <div className="text-sm text-ink-3">
            {label}
            <span className="block text-xs text-slate">{sub}</span>
          </div>
          <div
            className={`font-mono text-sm font-medium tabular-nums sm:text-right ${
              tone === 'good' ? 'text-moss' : tone === 'warn' ? 'text-amber-ink' : 'text-ink'
            }`}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

function Chart() {
  const base = 250
  const scale = 21 // px per percentage point
  return (
    <figure className="mt-6">
      <svg viewBox="0 0 720 300" className="block h-auto w-full" role="img" aria-label="Monthly attrition at the club, February to August 2026. July at 3.65 percent is the lowest on record.">
        {[10, 7.5, 5, 2.5].map((v) => (
          <g key={v}>
            <line x1="60" y1={base - v * scale} x2="700" y2={base - v * scale} stroke="#E4E4E7" strokeWidth="1" />
            <text x="52" y={base - v * scale + 4} textAnchor="end" fontSize="12" fill="#71717A" fontFamily="ui-monospace, Menlo, monospace">{v}%</text>
          </g>
        ))}
        <line x1="60" y1={base} x2="700" y2={base} stroke="#52525B" strokeWidth="1" />
        <text x="52" y={base + 4} textAnchor="end" fontSize="12" fill="#71717A" fontFamily="ui-monospace, Menlo, monospace">0</text>
        {MONTHS.map((d, i) => {
          const x = 80 + i * 90
          const h = d.rate * scale
          const fill = d.live ? '#047857' : d.adjusted ? '#D97706' : '#A1A1AA'
          return (
            <g key={d.m}>
              <rect x={x} y={base - h} width="60" height={h} fill={fill} opacity={d.live ? 1 : 0.6} />
              {d.adjusted && (
                <rect x={x} y={base - d.adjusted * scale} width="60" height={d.adjusted * scale} fill="none" stroke="#D97706" strokeDasharray="4 3" />
              )}
              <text x={x + 30} y={base - h - 8} textAnchor="middle" fontSize="12" fontFamily="ui-monospace, Menlo, monospace" fill={d.live ? '#047857' : d.adjusted ? '#B45309' : '#18181B'} fontWeight={d.live ? 600 : 400}>
                {d.rate.toFixed(d.live ? 2 : 1)}%
              </text>
              <text x={x + 30} y={base + 22} textAnchor="middle" fontSize="13" fill={d.live ? '#047857' : '#3F3F46'} fontWeight={d.live ? 600 : 400}>
                {d.m}
              </text>
              {d.live && (
                <text x={x + 30} y={base + 42} textAnchor="middle" fontSize="12" fill="#047857">gymIQ live</text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 text-sm text-slate">
        Monthly attrition on the roster, Feb to Aug 2026. January is excluded as an overdue clean up month. August&apos;s dashed line shows the rate with the 19 to 21 August overdue clean up removed, about 41 members who had already stopped paying and were processed in three days.
      </figcaption>
    </figure>
  )
}
