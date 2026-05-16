/**
 * Public audit report — anyone with the unguessable reportId UUID can view.
 * Server component: loads the audit JSON from Supabase, then renders.
 */
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import {
  ArrowUpRight,
  AlertTriangle,
  TrendingDown,
  Users,
  Wallet,
  Sparkles,
  Calendar,
  Activity,
  ShieldCheck,
} from 'lucide-react'
import type { AuditReport, ScoredMember } from '@/lib/services/audit-analysis'

interface PageProps {
  params: Promise<{ reportId: string }>
}

export default async function AuditReportPage({ params }: PageProps) {
  const { reportId } = await params

  if (!isUuid(reportId)) notFound()

  const supabase = createServiceClient()
  if (!supabase) notFound()

  const { data, error } = await supabase
    .from('audits')
    .select('id, first_name, gym_name, created_at, report')
    .eq('id', reportId)
    .single()

  if (error || !data) notFound()

  const report = data.report as AuditReport
  const created = new Date(data.created_at)

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased">
      <ReportNav />
      <ReportHeader gymName={data.gym_name} firstName={data.first_name} createdAt={created} />
      <KeyMetrics report={report} />
      <SleeperBreakdown report={report} />
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
        Retention audit
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
  const liveMembers =
    r.totals.activeMembers + r.totals.frozenMembers + r.totals.sleeperMembers

  const metrics = [
    {
      label: 'Monthly revenue at risk',
      value: gbp(r.revenue.monthlyRevenueAtRisk),
      hint: r.revenue.monthlyFeeAssumed
        ? `Assumes ${gbp(r.revenue.avgMonthlyFee)}/member — your file didn't include fees.`
        : `Based on the fees in your upload (avg ${gbp(r.revenue.avgMonthlyFee)}/member).`,
      tone: 'risk' as const,
      icon: TrendingDown,
    },
    {
      label: 'Members at high risk',
      value: `${r.risk.high.toLocaleString('en-GB')}`,
      hint: `${r.risk.highRiskPercent}% of ${liveMembers.toLocaleString('en-GB')} live members`,
      tone: 'neutral' as const,
      icon: AlertTriangle,
    },
    {
      label: 'Deep sleepers (21–45 days)',
      value: r.sleepers.deep.toLocaleString('en-GB'),
      hint: 'The intervention sweet spot — call these this week.',
      tone: 'neutral' as const,
      icon: Activity,
    },
    {
      label: 'Payments outstanding',
      value: gbp(r.revenue.monthlyRevenueOverdue),
      hint: `${r.payments.overdueCount} accounts overdue.`,
      tone: 'neutral' as const,
      icon: Wallet,
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

/* ------------------------------------------------------------------ */

function SleeperBreakdown({ report }: { report: AuditReport }) {
  const r = report
  const total = r.sleepers.light + r.sleepers.deep + r.sleepers.critical + r.sleepers.lost
  const seg = (n: number) => (total === 0 ? 0 : (n / total) * 100)
  const buckets = [
    { label: 'Light sleepers (14–20d)', n: r.sleepers.light, body: 'Habit at risk. A friendly check-in here is enough.', tone: 'bg-amber-200', text: 'text-amber-900' },
    { label: 'Deep sleepers (21–45d)', n: r.sleepers.deep, body: 'Habit broken, still salvageable. Highest-leverage band.', tone: 'bg-orange-300', text: 'text-orange-900' },
    { label: 'Critical (46–60d)', n: r.sleepers.critical, body: 'Last chance. Manual call only.', tone: 'bg-red-300', text: 'text-red-900' },
    { label: 'Lost (60d+)', n: r.sleepers.lost, body: 'Do not contact — outreach may trigger cancellation.', tone: 'bg-zinc-300', text: 'text-zinc-700' },
  ]

  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            Intervention windows
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Who&apos;s still recoverable. <span className="text-zinc-500">Who isn&apos;t.</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            Members move through windows as they stop visiting. Each window has a different best-action — and contacting someone in the wrong window often makes things worse, not better.
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
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function ActionPlan({ report }: { report: AuditReport }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
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
                    Est. {gbp(a.estimatedRevenueImpact)} / month
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{a.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function Lists({ report }: { report: AuditReport }) {
  return (
    <section className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl space-y-12">
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
          subtitle="Accounts where the next payment date has passed. Stage 3 (15+ days late) is final-notice territory."
          icon={Wallet}
          members={report.topPaymentOverdue}
          column="daysOverdue"
          columnLabel="Days overdue"
        />
        <List
          title="New members at dropout risk"
          subtitle="Joined recently and haven't built a habit yet. Welcome them this week or lose them by month two."
          icon={Calendar}
          members={report.topNewMemberRisk}
          column="riskScore"
          columnLabel="Risk score"
        />
      </div>
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

function CallToAction() {
  return (
    <section className="px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/60 px-8 py-14 text-center sm:px-12">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
          <Sparkles className="h-3.5 w-3.5" /> Want GymIQ to do this every day?
        </span>
        <h2 className="mx-auto mt-5 max-w-2xl text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          We&apos;ll run this analysis daily, flag the at-risk list each morning, and (with your permission) handle the cancel-save conversations for you.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
          Bolts on to your existing CRM. £99/month. Live in a day.
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

function Diagnostics({ report }: { report: AuditReport }) {
  const r = report
  const cols = r.parseSummary.detectedColumns
  const detected: { key: string; value: string }[] = []
  ;(['fullName', 'email', 'status', 'lastVisit', 'nextPayment', 'joinDate', 'visitCount30d', 'monthlyValue'] as const).forEach((k) => {
    const v = cols[k]
    if (v) detected.push({ key: k, value: v })
  })
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
          {r.revenue.monthlyFeeAssumed && ` Monthly-fee column not found — used a ${gbp(r.revenue.avgMonthlyFee)}/member estimate.`}
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
    case 'status': return 'Status'
    case 'lastVisit': return 'Last visit'
    case 'nextPayment': return 'Next payment'
    case 'joinDate': return 'Join date'
    case 'visitCount30d': return 'Visits (30d)'
    case 'monthlyValue': return 'Monthly fee'
    default: return k
  }
}

/* ------------------------------------------------------------------ */

function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
