/**
 * Pure presentational component — renders an AuditReport.
 *
 * Used by both:
 *   - /audit/[reportId]/page.tsx (server component, loads from Supabase)
 *   - /audit/preview/page.tsx    (client component, loads from sessionStorage)
 */
import Link from 'next/link'
import {
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Wallet,
  Sparkles,
  Calendar,
  Activity,
  ShieldCheck,
  Snowflake,
  Coins,
} from 'lucide-react'
import type {
  AuditReport,
  Benchmark,
  PlanBucket,
  ScoredMember,
  TenureBucket,
} from '@/lib/services/audit-analysis'

interface Props {
  report: AuditReport
  gymName: string
  firstName: string
  createdAt: Date
  /** When true, shows a banner that this is an in-memory preview not saved to the server. */
  isPreview?: boolean
}

export default function AuditReportView({ report, gymName, firstName, createdAt, isPreview }: Props) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased">
      <ReportNav />
      {isPreview && <PreviewBanner />}
      <ReportHeader gymName={gymName} firstName={firstName} createdAt={createdAt} />
      <KeyMetrics report={report} />
      <RevenueSnapshot report={report} />
      <Benchmarks report={report} />
      <VisitDistribution report={report} />
      <SleeperBreakdown report={report} />
      {report.planMix.length > 1 && <PlanMix report={report} />}
      {report.tenure.available && <TenureCohorts report={report} />}
      {report.frozen.count > 0 && <FrozenBreakdown report={report} />}
      <PaymentHealth report={report} />
      <ActionPlan report={report} />
      <Lists report={report} />
      <CallToAction />
      <Diagnostics report={report} />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ReportNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 text-[11px] font-bold text-white shadow-sm">
            IQ
          </span>
          GymIQ
        </Link>
        <Link
          href="/#audit"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
        >
          Run another audit
        </Link>
      </div>
    </header>
  )
}

function PreviewBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50/80 px-5 py-2.5 text-center text-xs text-amber-900 sm:px-8">
      Preview mode — this report is in your browser only and won&apos;t persist if you close the tab.
    </div>
  )
}

function ReportHeader({
  gymName,
  firstName,
  createdAt,
}: {
  gymName: string
  firstName: string
  createdAt: Date
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-12 sm:px-8 sm:pt-16">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
        Retention &amp; revenue audit
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        {gymName}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Generated for {firstName} on{' '}
        {createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        {' · '}
        Private link — share carefully.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function KeyMetrics({ report }: { report: AuditReport }) {
  const r = report

  const metrics = [
    {
      label: 'Monthly revenue',
      value: gbp(r.revenue.totalMonthlyRevenue),
      hint: `${(r.totals.liveMembers - r.totals.frozenMembers).toLocaleString('en-GB')} billable members on the books`,
      tone: 'neutral' as const,
      icon: Coins,
    },
    {
      label: 'ARPU per live member',
      value: gbp(r.revenue.arpuMonthly),
      hint:
        r.revenue.medianMonthlyFee !== null
          ? `Median fee ${gbp(r.revenue.medianMonthlyFee)} · ${pricingSourceLabel(r.revenue.pricingSource)}`
          : pricingSourceLabel(r.revenue.pricingSource),
      tone: 'neutral' as const,
      icon: TrendingUp,
    },
    {
      label: 'Monthly revenue at risk',
      value: gbp(r.revenue.monthlyRevenueAtRisk),
      hint: `${r.risk.high.toLocaleString('en-GB')} high-risk members · ${r.risk.highRiskPercent}% of live base`,
      tone: 'risk' as const,
      icon: TrendingDown,
    },
    {
      label: 'Deep sleepers (21–45d)',
      value: r.sleepers.deep.toLocaleString('en-GB'),
      hint: 'Most savable cohort — call these this week.',
      tone: 'neutral' as const,
      icon: Activity,
    },
  ]

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <div key={m.label} className="bg-white px-6 py-7">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                <Icon
                  className={`h-3.5 w-3.5 ${m.tone === 'risk' ? 'text-red-500' : 'text-zinc-400'}`}
                />
                {m.label}
              </div>
              <p
                className={`mt-2 text-3xl font-semibold tracking-tight ${
                  m.tone === 'risk' ? 'text-red-600' : 'text-zinc-900'
                } sm:text-[34px]`}
              >
                {m.value}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{m.hint}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function pricingSourceLabel(s: 'column' | 'plan-name' | 'estimate'): string {
  if (s === 'column') return 'From your price column'
  if (s === 'plan-name') return 'Extracted from plan names'
  return 'Estimated — no price column found'
}

/* ------------------------------------------------------------------ */
/* REVENUE SNAPSHOT                                                   */
/* ------------------------------------------------------------------ */

function RevenueSnapshot({ report }: { report: AuditReport }) {
  const r = report
  const items = [
    {
      label: 'Annual run rate',
      value: gbp(r.revenue.annualRunRate),
      hint: 'Monthly revenue × 12. The headline number for a board pack.',
    },
    {
      label: 'Estimated LTV per member',
      value: gbp(r.revenue.estimatedLTV),
      hint: `Based on ${r.revenue.avgTenureMonths.toFixed(1)}-month avg tenure × ${gbp(r.revenue.avgMonthlyFee)} ARPU.`,
    },
    {
      label: 'Locked in freezes',
      value: gbp(r.revenue.monthlyRevenueFrozen),
      hint: `${r.frozen.count.toLocaleString('en-GB')} frozen members. Reactivate these and revenue returns instantly.`,
    },
    {
      label: 'Payments outstanding',
      value: gbp(r.revenue.monthlyRevenueOverdue),
      hint: `${r.payments.overdueCount} accounts overdue${r.payments.dueTodayCount ? ` · ${r.payments.dueTodayCount} due today` : ''}.`,
    },
  ]
  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            The money picture
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            What this gym actually generates.
          </h2>
          {r.revenue.pricingSource === 'estimate' && (
            <p className="mt-3 text-sm leading-relaxed text-amber-700">
              Heads up: your export didn&apos;t include a membership-price column, so revenue figures use a £{r.revenue.avgMonthlyFee.toFixed(0)}/member estimate. Add a price or plan column and the numbers below get pound-perfect.
            </p>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="bg-white px-5 py-6">
              <p className="text-xs font-medium text-zinc-500">{it.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[26px]">
                {it.value}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{it.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* INDUSTRY BENCHMARKS                                                */
/* ------------------------------------------------------------------ */

function Benchmarks({ report }: { report: AuditReport }) {
  if (report.benchmarks.length === 0) return null
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          How you compare
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Where this gym sits against the industry.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Benchmarks drawn from the Health &amp; Fitness Association (formerly IHRSA), Motionsoft, and GymMaster industry data.
        </p>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {report.benchmarks.map((b: Benchmark) => (
          <li
            key={b.metric}
            className={`rounded-2xl border p-5 ${
              b.sense === 'good'
                ? 'border-emerald-200 bg-emerald-50/40'
                : b.sense === 'bad'
                ? 'border-red-200 bg-red-50/40'
                : 'border-zinc-200 bg-white'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-zinc-900">{b.metric}</p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  b.sense === 'good'
                    ? 'bg-emerald-100 text-emerald-800'
                    : b.sense === 'bad'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {b.sense === 'good' ? 'Strong' : b.sense === 'bad' ? 'Action needed' : 'On par'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <p className="text-2xl font-semibold tracking-tight text-zinc-900">{b.yourValue}</p>
              <p className="text-xs text-zinc-500">vs {b.industryValue}</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">{b.hint}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* VISIT DISTRIBUTION                                                 */
/* ------------------------------------------------------------------ */

function VisitDistribution({ report }: { report: AuditReport }) {
  const f = report.visits.frequencyDistribution
  const total = f.power + f.regular + f.slipping + f.dormant + f.unknown
  if (total === 0) return null
  const buckets = [
    { label: 'Power users (≤7d)', n: f.power, body: 'Visited in the last week. Your habit core.', tone: 'bg-emerald-300' },
    { label: 'Regular (8–14d)', n: f.regular, body: 'Visited in the last fortnight. Healthy.', tone: 'bg-emerald-200' },
    { label: 'Slipping (15–30d)', n: f.slipping, body: 'Habit weakening. A nudge now is high leverage.', tone: 'bg-amber-200' },
    { label: 'Dormant (31d+)', n: f.dormant, body: '23% of all gym cancellations come from this group.', tone: 'bg-red-300' },
    { label: 'No data', n: f.unknown, body: 'Members with no visit timestamp in the export.', tone: 'bg-zinc-200' },
  ]
  const seg = (n: number) => (total === 0 ? 0 : (n / total) * 100)

  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            Visit distribution
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            How often your members actually show up.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Industry average dropped from 2.1 visits/week pre-pandemic to 1.5 today. Where your distribution skews tells you which interventions will move the needle.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex h-3 w-full overflow-hidden">
            {buckets.map((b, i) => (
              <div
                key={i}
                className={b.tone}
                style={{ width: `${seg(b.n)}%`, minWidth: b.n > 0 ? 4 : 0 }}
                aria-label={`${b.label}: ${b.n}`}
              />
            ))}
          </div>
          <ul className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
            {buckets.map((b) => (
              <li key={b.label} className="p-5">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${b.tone}`} />
                  <span className="text-xs font-medium text-zinc-700">{b.label}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                  {b.n.toLocaleString('en-GB')}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{b.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* SLEEPER BREAKDOWN                                                  */
/* ------------------------------------------------------------------ */

function SleeperBreakdown({ report }: { report: AuditReport }) {
  const r = report
  const total = r.sleepers.light + r.sleepers.deep + r.sleepers.critical + r.sleepers.lost
  if (total === 0) return null
  const seg = (n: number) => (total === 0 ? 0 : (n / total) * 100)
  const buckets = [
    { label: 'Light (14–20d)', n: r.sleepers.light, body: 'Habit at risk. A friendly check-in is enough.', tone: 'bg-amber-200' },
    { label: 'Deep (21–45d)', n: r.sleepers.deep, body: 'Habit broken, still savable. Highest-leverage band.', tone: 'bg-orange-300' },
    { label: 'Critical (46–60d)', n: r.sleepers.critical, body: 'A "we miss you" + free-month offer here cuts cancels ~80%.', tone: 'bg-red-300' },
    { label: 'Long-dormant (60d+)', n: r.sleepers.lost, body: 'Win-back campaign with a fresh-start offer. Empathetic tone.', tone: 'bg-zinc-400' },
  ]

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          Intervention windows
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          The right action at the right moment.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          The traditional &quot;let sleeping dogs lie&quot; advice has been debunked by recent industry data: 23% of cancellations come from non-use, and dormant payers eventually notice. The fix isn&apos;t silence — it&apos;s the right tone and offer for each window.
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="flex h-3 w-full overflow-hidden">
          {buckets.map((b, i) => (
            <div
              key={i}
              className={b.tone}
              style={{ width: `${seg(b.n)}%`, minWidth: b.n > 0 ? 4 : 0 }}
              aria-label={`${b.label}: ${b.n}`}
            />
          ))}
        </div>
        <ul className="grid grid-cols-1 divide-y divide-zinc-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          {buckets.map((b) => (
            <li key={b.label} className="p-5">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${b.tone}`} />
                <span className="text-xs font-medium text-zinc-700">{b.label}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                {b.n.toLocaleString('en-GB')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{b.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* PLAN MIX                                                           */
/* ------------------------------------------------------------------ */

function PlanMix({ report }: { report: AuditReport }) {
  const max = Math.max(...report.planMix.map((p) => p.monthlyRevenue), 1)
  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            Membership mix
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Which plans pay the bills.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Where members concentrate. Plans driving most of the revenue should get the most retention attention.
          </p>
        </div>

        <ul className="mt-8 space-y-2">
          {report.planMix.map((p: PlanBucket) => (
            <li
              key={p.name}
              className="grid grid-cols-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4"
            >
              <div className="col-span-12 sm:col-span-5">
                <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                <p className="text-xs text-zinc-500">
                  {p.count.toLocaleString('en-GB')} members · {Math.round(p.share * 100)}% of base
                  {p.monthlyValue !== null ? ` · ${gbp(p.monthlyValue)}/mo each` : ''}
                </p>
              </div>
              <div className="col-span-9 sm:col-span-5">
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(p.monthlyRevenue / max) * 100}%` }}
                  />
                </div>
              </div>
              <p className="col-span-3 sm:col-span-2 text-right text-sm font-semibold tabular-nums text-zinc-900">
                {gbp(p.monthlyRevenue)}/mo
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* TENURE COHORTS                                                     */
/* ------------------------------------------------------------------ */

function TenureCohorts({ report }: { report: AuditReport }) {
  const max = Math.max(...report.tenure.cohorts.map((c) => c.count), 1)
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          Tenure cohorts
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          How long members have been with you.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          50% of new gym members quit within the first six months. The earliest cohorts need the most onboarding investment — comprehensive onboarding lifts 6-month retention from 60% to 87%.
        </p>
      </div>

      <ul className="mt-8 space-y-2">
        {report.tenure.cohorts.map((c: TenureBucket) => (
          <li
            key={c.label}
            className="grid grid-cols-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4"
          >
            <p className="col-span-12 sm:col-span-3 text-sm font-medium text-zinc-900">{c.label}</p>
            <div className="col-span-9 sm:col-span-6">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${(c.count / max) * 100}%` }}
                />
              </div>
            </div>
            <p className="col-span-3 sm:col-span-1 text-right text-sm font-semibold tabular-nums text-zinc-900">
              {c.count.toLocaleString('en-GB')}
            </p>
            <p className="col-span-12 sm:col-span-2 text-right text-xs text-zinc-500">
              {c.highRiskCount} high-risk
              <br className="hidden sm:block" />
              {gbp(c.monthlyRevenue)}/mo
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* FROZEN BREAKDOWN                                                   */
/* ------------------------------------------------------------------ */

function FrozenBreakdown({ report }: { report: AuditReport }) {
  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            Frozen memberships
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Forgotten goldmines.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Frozen accounts often slip out the back door — they were on the books, life got busy, and they never unfroze. A check-in 30 days before the freeze ends massively lifts reactivation.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
          <div className="bg-white px-6 py-7">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Snowflake className="h-3.5 w-3.5 text-zinc-400" />
              Frozen members
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              {report.frozen.count.toLocaleString('en-GB')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              On pause across your member base right now.
            </p>
          </div>
          <div className="bg-white px-6 py-7">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Coins className="h-3.5 w-3.5 text-zinc-400" />
              Monthly revenue paused
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              {gbp(report.frozen.monthlyRevenueLost)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Returns to your top line the day each freeze lifts.
            </p>
          </div>
          <div className="bg-white px-6 py-7">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" />
              Avg days since last visit
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
              {report.frozen.avgDaysFrozen !== null
                ? Math.round(report.frozen.avgDaysFrozen).toLocaleString('en-GB')
                : '—'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Among frozen members with a last-visit date.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* PAYMENT HEALTH                                                     */
/* ------------------------------------------------------------------ */

function PaymentHealth({ report }: { report: AuditReport }) {
  const p = report.payments
  if (p.overdueCount === 0 && p.dueTodayCount === 0) return null
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          Payment health
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Who owes money and how to recover it.
        </h2>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
        <PaymentTile
          label="Due today"
          value={p.dueTodayCount}
          hint="Payment date is today. Watch these in the next 48h."
        />
        <PaymentTile
          label="1–7 days late"
          value={p.overdueRecoveryStage1}
          hint="A warm-tone reminder converts 30–50% without escalation."
        />
        <PaymentTile
          label="8–14 days late"
          value={p.overdueRecoveryStage2}
          hint="Second-touch reminder. Add a payment-plan option."
        />
        <PaymentTile
          label="15+ days late"
          value={p.overdueRecoveryStage3}
          hint="Final-notice territory. &quot;We want you back&quot; offer before cancellation."
        />
      </div>
    </section>
  )
}

function PaymentTile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="bg-white px-6 py-7">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">
        {value.toLocaleString('en-GB')}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{hint}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* ACTION PLAN                                                        */
/* ------------------------------------------------------------------ */

function ActionPlan({ report }: { report: AuditReport }) {
  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            30-day action plan
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Ten moves, ranked by revenue impact.
          </h2>
        </div>
        <ol className="mt-10 space-y-3">
          {report.actionPlan.map((a, i) => (
            <li
              key={i}
              className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900 sm:text-base">{a.title}</h3>
                  {a.estimatedRevenueImpact !== null && (
                    <span className="text-xs font-medium text-emerald-700">
                      Est. {gbp(a.estimatedRevenueImpact)} value
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600">{a.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* MEMBER LISTS                                                       */
/* ------------------------------------------------------------------ */

function Lists({ report }: { report: AuditReport }) {
  return (
    <section className="mx-auto max-w-6xl space-y-12 px-5 py-16 sm:px-8 sm:py-20">
      <List
        title="Top deep sleepers"
        subtitle="Members 21–45 days without a visit, ranked by risk score. The most savable accounts in your book."
        icon={Activity}
        members={report.topDeepSleepers}
        column="daysSinceLastVisit"
        columnLabel="Days since visit"
      />
      <List
        title="Payment overdue"
        subtitle="Accounts where the next payment is at least one day late. Stage 3 (15+ days) is final-notice territory."
        icon={Wallet}
        members={report.topPaymentOverdue}
        column="daysOverdue"
        columnLabel="Days overdue"
      />
      <List
        title="New members at dropout risk"
        subtitle="Joined recently and haven't built a habit. Welcome them this week or lose them by month two."
        icon={Calendar}
        members={report.topNewMemberRisk}
        column="riskScore"
        columnLabel="Risk score"
      />
      {report.topFrozen.length > 0 && (
        <List
          title="Frozen members worth checking on"
          subtitle="Frozen the longest. A pre-unfreeze nudge prevents them quietly cancelling."
          icon={Snowflake}
          members={report.topFrozen}
          column="daysSinceLastVisit"
          columnLabel="Days since visit"
        />
      )}
    </section>
  )
}

function List({
  title,
  subtitle,
  icon: Icon,
  members,
  column,
  columnLabel,
}: {
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  members: ScoredMember[]
  column: 'daysSinceLastVisit' | 'daysOverdue' | 'riskScore'
  columnLabel: string
}) {
  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Icon className="h-4 w-4 text-zinc-400" />
          {title}
        </div>
        <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
        <p className="mt-4 text-sm text-emerald-700">Nothing to flag in this category. Nice.</p>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Icon className="h-4 w-4 text-zinc-400" />
          {title}
          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">
            {members.length}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-100">
          <thead className="bg-zinc-50/60">
            <tr>
              <Th>Member</Th>
              <Th>Email</Th>
              <Th className="hidden sm:table-cell">Status</Th>
              <Th className="hidden md:table-cell">Plan</Th>
              <Th className="text-right">{columnLabel}</Th>
              <Th className="text-right">Risk</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {members.map((m, i) => (
              <tr key={i} className="hover:bg-zinc-50/60">
                <Td className="font-medium text-zinc-900">{m.name ?? '—'}</Td>
                <Td className="text-zinc-500">{m.email ?? '—'}</Td>
                <Td className="hidden capitalize text-zinc-600 sm:table-cell">{m.status}</Td>
                <Td className="hidden text-zinc-600 md:table-cell">{m.membershipType ?? '—'}</Td>
                <Td className="text-right tabular-nums text-zinc-700">
                  {column === 'daysSinceLastVisit'
                    ? m.daysSinceLastVisit ?? '—'
                    : column === 'daysOverdue'
                    ? m.daysOverdue ?? '—'
                    : m.riskScore}
                </Td>
                <Td className="text-right">
                  <RiskBadge band={m.riskBand} score={m.riskScore} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${className}`}
    >
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-3 text-sm ${className}`}>{children}</td>
}

function RiskBadge({ band, score }: { band: 'low' | 'medium' | 'high'; score: number }) {
  const cls =
    band === 'high'
      ? 'bg-red-50 text-red-700 ring-red-100'
      : band === 'medium'
      ? 'bg-amber-50 text-amber-800 ring-amber-100'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}
    >
      <span className="font-semibold tabular-nums">{score}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* CALL TO ACTION                                                     */
/* ------------------------------------------------------------------ */

function CallToAction() {
  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/60 px-8 py-14 text-center sm:px-12">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          <Sparkles className="h-3.5 w-3.5" /> Want GymIQ to do this every day?
        </span>
        <h2 className="mx-auto mt-5 max-w-2xl text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          We&apos;ll run this analysis daily, flag the at-risk list each morning, and (with your permission) handle the cancel-save conversations for you.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
          Bolts on to your existing CRM. £179/month. Live in a day.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Start free trial
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:hello@gymiq.ai?subject=Audit follow-up"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Reply to talk to us
          </a>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* DIAGNOSTICS                                                        */
/* ------------------------------------------------------------------ */

function Diagnostics({ report }: { report: AuditReport }) {
  const r = report
  const cols = r.parseSummary.detectedColumns
  const detected: { key: string; value: string }[] = []
  ;(['fullName', 'email', 'phone', 'status', 'lastVisit', 'nextPayment', 'joinDate', 'visitCount30d', 'membershipType', 'monthlyValue'] as const).forEach((k) => {
    const v = cols[k]
    if (v) detected.push({ key: k, value: v })
  })
  const missing: string[] = []
  if (!cols.monthlyValue) missing.push('membership price')
  if (!cols.joinDate) missing.push('join date')
  if (!cols.visitCount30d) missing.push('visit count')
  if (!cols.membershipType) missing.push('plan/membership type')

  return (
    <section className="px-5 pb-24 sm:px-8">
      <div className="mx-auto max-w-6xl rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <ShieldCheck className="h-4 w-4 text-zinc-400" />
          How we read your file
        </div>
        <p className="mt-1.5 text-sm text-zinc-500">
          {r.totals.rowsParsed.toLocaleString('en-GB')} members parsed
          {r.parseSummary.rowsSkipped > 0 ? `, ${r.parseSummary.rowsSkipped} empty rows skipped` : ''}.
          {' '}Pricing source: <span className="font-medium text-zinc-700">{pricingSourceLabel(r.revenue.pricingSource)}</span>.
        </p>
        {detected.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {detected.map((d) => (
              <li
                key={d.key}
                className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-xs"
              >
                <span className="text-zinc-500">{labelFor(d.key)} →</span>{' '}
                <span className="font-mono text-zinc-700">{d.value}</span>
              </li>
            ))}
          </ul>
        )}
        {missing.length > 0 && (
          <p className="mt-3 text-xs text-amber-700">
            Not detected in your export: <span className="font-medium">{missing.join(', ')}</span>. Including these gives you sharper revenue, tenure, and engagement insights next time.
          </p>
        )}
        {r.parseSummary.warnings.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-700">
            {r.parseSummary.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function labelFor(k: string): string {
  switch (k) {
    case 'fullName': return 'Member name'
    case 'email': return 'Email'
    case 'phone': return 'Phone'
    case 'status': return 'Status'
    case 'lastVisit': return 'Last visit'
    case 'nextPayment': return 'Next payment'
    case 'joinDate': return 'Join date'
    case 'visitCount30d': return 'Visits (30d)'
    case 'membershipType': return 'Plan / membership'
    case 'monthlyValue': return 'Monthly fee'
    default: return k
  }
}

function gbp(n: number): string {
  if (!Number.isFinite(n)) return '£0'
  return `£${Math.round(n).toLocaleString('en-GB')}`
}
