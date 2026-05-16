import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  PoundSterling,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MemberDetailPage({ params }: PageProps) {
  const { id } = await params
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) notFound()

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name, timezone, messaging_enabled')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!gym) redirect('/overview')

  const { data: member } = await svc
    .from('members')
    .select('*')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (!member) notFound()

  const m = member as {
    id: string
    name: string
    email: string | null
    phone: string | null
    status: string
    plan_name: string | null
    monthly_fee: number | null
    last_visit: string | null
    next_payment: string | null
    join_date: string | null
    visit_count_30d: number
    lifetime_value: number
    risk_score: number
    risk_factors: unknown
    source_metadata: { sleeper_category?: string; payment_failed?: boolean; tenure_days?: number } | null
  }

  const [{ data: conversations }, { data: attempts }, { data: sequenceRuns }] = await Promise.all([
    svc
      .from('conversations')
      .select('id, channel, status, last_message_at, created_at')
      .eq('gym_id', gym.id)
      .eq('member_id', m.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(10),
    svc
      .from('cancel_save_attempts')
      .select('id, stage, outcome, reason_category, offer_made, offer_details, created_at, resolved_at')
      .eq('gym_id', gym.id)
      .eq('member_id', m.id)
      .order('created_at', { ascending: false })
      .limit(10),
    svc
      .from('sequence_runs')
      .select('id, status, current_step, next_send_at, sequence_id, sequences(name)')
      .eq('gym_id', gym.id)
      .eq('member_id', m.id)
      .order('created_at', { ascending: false }),
  ])

  const convs = (conversations ?? []) as Array<{ id: string; channel: string; status: string; last_message_at: string | null; created_at: string }>
  const cancelAttempts = (attempts ?? []) as Array<{ id: string; stage: string; outcome: string; reason_category: string | null; offer_made: string | null; offer_details: string | null; created_at: string; resolved_at: string | null }>
  const runs = (sequenceRuns ?? []) as Array<{ id: string; status: string; current_step: number; next_send_at: string | null; sequence_id: string; sequences: { name: string } | { name: string }[] | null }>

  const factors = Array.isArray(m.risk_factors) ? (m.risk_factors as string[]) : []
  const tenureDays = m.source_metadata?.tenure_days
  const sleeperCategory = m.source_metadata?.sleeper_category

  return (
    <div className="px-8 py-10">
      <Link
        href="/members"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All members
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{m.name}</h1>
            <StatusBadge status={m.status} />
            {m.source_metadata?.payment_failed && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800">
                Payment overdue
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {m.plan_name ?? 'No plan recorded'}
            {m.monthly_fee !== null && <> · £{m.monthly_fee}/mo</>}
            {sleeperCategory && <> · {humanise(sleeperCategory)}</>}
          </p>
        </div>
        <RiskCard score={m.risk_score} factors={factors} />
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-6">
          {/* Activity stats */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">Activity</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Visits (30d)" value={m.visit_count_30d.toString()} icon={Activity} />
              <Stat label="Tenure" value={tenureDays ? `${Math.round(tenureDays / 30)}mo` : '—'} icon={Calendar} />
              <Stat label="Lifetime value" value={`£${Number(m.lifetime_value || 0).toFixed(0)}`} icon={PoundSterling} />
              <Stat
                label="Last visit"
                value={m.last_visit ? formatRelativeDate(m.last_visit) : '—'}
                icon={Calendar}
              />
            </div>
          </section>

          {/* Conversations */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">Conversations</h2>
            {convs.length === 0 ? (
              <p className="text-sm text-zinc-500">No retention conversations yet for this member.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {convs.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/conversations/${c.id}`}
                      className="flex items-center justify-between gap-2 py-3 transition hover:bg-zinc-50"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-zinc-900">{c.channel.toUpperCase()}</span>
                          <ConversationStatusBadge status={c.status} />
                        </div>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Last activity{' '}
                          {c.last_message_at
                            ? formatRelativeDate(c.last_message_at)
                            : 'no activity'}{' '}
                          · opened {new Date(c.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-zinc-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Cancel-save attempts */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">Cancel-save history</h2>
            {cancelAttempts.length === 0 ? (
              <p className="text-sm text-zinc-500">No cancel-save attempts on record.</p>
            ) : (
              <ul className="space-y-3">
                {cancelAttempts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/40 px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <OutcomeBadge outcome={a.outcome} />
                      <span className="text-[11px] text-zinc-500">stage: {a.stage}</span>
                      <span className="ml-auto text-[11px] text-zinc-500">
                        {new Date(a.created_at).toLocaleString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-700">
                      {a.reason_category ? `Reason: ${humanise(a.reason_category)}` : 'Reason not yet captured'}
                      {a.offer_made && a.offer_made !== 'none' && (
                        <> · Offer: {humanise(a.offer_made)}</>
                      )}
                      {a.offer_details && <> · {a.offer_details}</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Sequence runs */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-zinc-900">Sequence enrolments</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-zinc-500">Not currently enrolled in any recovery sequence.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {runs.map((r) => {
                  const seq = Array.isArray(r.sequences) ? r.sequences[0] : r.sequences
                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">{seq?.name ?? 'Sequence'}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          Step {r.current_step + 1}
                          {r.next_send_at && r.status !== 'completed' && (
                            <> · next send {formatRelativeDate(r.next_send_at)}</>
                          )}
                        </p>
                      </div>
                      <RunStatusBadge status={r.status} />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Contact</p>
            <dl className="mt-3 space-y-3 text-sm">
              {m.email && (
                <Field icon={Mail} label="Email" value={m.email} />
              )}
              {m.phone && (
                <Field icon={Phone} label="Phone" value={m.phone} />
              )}
              {m.join_date && (
                <Field
                  icon={Calendar}
                  label="Joined"
                  value={new Date(m.join_date).toLocaleDateString('en-GB')}
                />
              )}
              {m.next_payment && (
                <Field
                  icon={Calendar}
                  label="Next payment"
                  value={new Date(m.next_payment).toLocaleDateString('en-GB')}
                />
              )}
            </dl>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Risk factors</p>
            {factors.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No risk factors identified.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-700">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function humanise(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function formatRelativeDate(d: string): string {
  const date = new Date(d)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days < -1) return date.toLocaleDateString('en-GB')
  if (days < 0) return `in ${Math.abs(days)}d`
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums text-zinc-900">{value}</p>
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-zinc-900" title={value}>{value}</dd>
    </div>
  )
}

function RiskCard({ score, factors }: { score: number; factors: string[] }) {
  const tone = score >= 80 ? 'bad' : score >= 61 ? 'warn' : score >= 40 ? 'mid' : 'good'
  const colours = {
    bad: 'border-red-200 bg-red-50 text-red-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    mid: 'border-zinc-200 bg-zinc-50 text-zinc-700',
    good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[tone]
  return (
    <div className={`rounded-xl border px-4 py-3 ${colours}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">Risk score</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{score}/100</p>
      {factors.length > 0 && (
        <p className="mt-1 text-[11px] opacity-80">{factors.length} factors flagged</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    active: { bg: 'bg-emerald-50', fg: 'text-emerald-800' },
    frozen: { bg: 'bg-blue-50', fg: 'text-blue-800' },
    sleeper: { bg: 'bg-amber-50', fg: 'text-amber-800' },
    churned: { bg: 'bg-red-50', fg: 'text-red-800' },
    cancelled: { bg: 'bg-zinc-100', fg: 'text-zinc-700' },
  }
  const e = map[status] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700' }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.bg} ${e.fg}`}>
      {humanise(status)}
    </span>
  )
}

function ConversationStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active: { bg: 'bg-emerald-50', fg: 'text-emerald-800', label: 'Active' },
    waiting_human: { bg: 'bg-red-50', fg: 'text-red-800', label: 'Waiting' },
    closed: { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'Closed' },
  }
  const e = map[status] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: status }
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${e.bg} ${e.fg}`}>
      {e.label}
    </span>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { Icon: React.ComponentType<{ className?: string }>; bg: string; fg: string; label: string }> = {
    saved: { Icon: CheckCircle2, bg: 'bg-emerald-50', fg: 'text-emerald-800', label: 'Saved' },
    lost: { Icon: XCircle, bg: 'bg-red-50', fg: 'text-red-800', label: 'Lost' },
    in_progress: { Icon: Clock, bg: 'bg-amber-50', fg: 'text-amber-800', label: 'In progress' },
    escalated: { Icon: AlertTriangle, bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'Escalated' },
  }
  const e = map[outcome] ?? { Icon: Clock, bg: 'bg-zinc-100', fg: 'text-zinc-700', label: outcome }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${e.bg} ${e.fg}`}>
      <e.Icon className="h-3 w-3" />
      {e.label}
    </span>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    pending: { bg: 'bg-amber-50', fg: 'text-amber-800' },
    in_progress: { bg: 'bg-emerald-50', fg: 'text-emerald-800' },
    completed: { bg: 'bg-zinc-100', fg: 'text-zinc-700' },
    halted: { bg: 'bg-zinc-100', fg: 'text-zinc-500' },
    opted_out: { bg: 'bg-red-50', fg: 'text-red-800' },
    saved: { bg: 'bg-emerald-50', fg: 'text-emerald-800' },
  }
  const e = map[status] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700' }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${e.bg} ${e.fg}`}>
      {humanise(status)}
    </span>
  )
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
