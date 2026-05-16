import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { CheckCircle2, XCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface AttemptRow {
  id: string
  stage: string
  outcome: string
  reason_category: string | null
  reason: string | null
  offer_made: string | null
  offer_details: string | null
  created_at: string
  resolved_at: string | null
  member_id: string
  members: { id: string; name: string; plan_name: string | null; monthly_fee: number | null } | null
}

interface ConvRow {
  id: string
  member_id: string | null
}

export default async function CancelSavePage() {
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) {
    return <Wrap><Empty title="Service not configured" body="SUPABASE_SERVICE_ROLE_KEY missing." /></Wrap>
  }

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!gym) {
    return (
      <Wrap>
        <Empty
          title="No gym set up yet"
          body="Run an audit on the homepage and click 'Run this for me' to start."
        />
      </Wrap>
    )
  }

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: attempts } = await svc
    .from('cancel_save_attempts')
    .select(
      'id, stage, outcome, reason_category, reason, offer_made, offer_details, created_at, resolved_at, member_id, members(id, name, plan_name, monthly_fee)',
    )
    .eq('gym_id', gym.id)
    .gte('created_at', since30)
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = ((attempts ?? []) as unknown) as AttemptRow[]

  // Look up the latest conversation per member so we can deep-link from each row.
  const memberIds = Array.from(new Set(rows.map((r) => r.member_id).filter(Boolean)))
  const { data: convs } = memberIds.length
    ? await svc
        .from('conversations')
        .select('id, member_id, last_message_at')
        .eq('gym_id', gym.id)
        .in('member_id', memberIds)
        .order('last_message_at', { ascending: false })
    : { data: [] as ConvRow[] }
  const convByMember = new Map<string, string>()
  for (const c of (convs ?? []) as Array<ConvRow>) {
    if (c.member_id && !convByMember.has(c.member_id)) convByMember.set(c.member_id, c.id)
  }

  const stats = computeStats(rows)
  const reasonBreakdown = reasonCounts(rows)
  const offerBreakdown = offerCounts(rows.filter((r) => r.outcome === 'saved'))

  return (
    <Wrap title="Cancel-save" subtitle="Last 30 days" pillLabel={gym.name}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Attempts" value={stats.total} icon={AlertTriangle} tone="neutral" />
        <StatCard label="Saved" value={stats.saved} icon={CheckCircle2} tone="good" />
        <StatCard label="Lost" value={stats.lost} icon={XCircle} tone="bad" />
        <StatCard label="In progress" value={stats.in_progress} icon={Clock} tone="warn" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Save rate</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums text-zinc-900">
            {stats.closed > 0 ? `${Math.round((stats.saved / stats.closed) * 100)}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            of {stats.closed} resolved attempts (industry benchmark: ~25–40%)
          </p>
        </div>

        <Breakdown
          title="Why they cancelled"
          rows={reasonBreakdown}
          empty="No reasons captured yet — they'll fill in as attempts close."
        />

        <Breakdown
          title="What saved them"
          rows={offerBreakdown}
          empty="No saves yet. Once an attempt closes saved, the offer that worked shows up here."
        />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Recent attempts</h2>
        {rows.length === 0 ? (
          <Empty
            title="No cancel-save attempts yet"
            body="When a member replies with cancellation intent, the engine kicks in automatically and the attempt shows up here."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Member</th>
                  <th className="px-4 py-3 font-medium">Stage / outcome</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Offer</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((a) => {
                  const convId = a.member_id ? convByMember.get(a.member_id) : null
                  return (
                    <tr key={a.id} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3">
                        <div className="font-medium text-zinc-900">{a.members?.name ?? 'Unknown'}</div>
                        <div className="text-[11px] text-zinc-500">
                          {a.members?.plan_name ?? '—'}
                          {a.members?.monthly_fee !== null && a.members?.monthly_fee !== undefined && (
                            <> · £{a.members.monthly_fee}/mo</>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <OutcomeBadge outcome={a.outcome} />
                        <div className="mt-0.5 text-[11px] text-zinc-500">stage: {a.stage}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {a.reason_category ? humanise(a.reason_category) : '—'}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {a.offer_made ? humanise(a.offer_made) : '—'}
                        {a.offer_details && (
                          <div className="text-[11px] text-zinc-500">{a.offer_details}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-700">
                        {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {convId && (
                          <Link
                            href={`/conversations/${convId}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900"
                          >
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Wrap>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function computeStats(rows: AttemptRow[]) {
  const stats = { total: rows.length, saved: 0, lost: 0, in_progress: 0, escalated: 0, closed: 0 }
  for (const r of rows) {
    if (r.outcome === 'saved') stats.saved++
    else if (r.outcome === 'lost') stats.lost++
    else if (r.outcome === 'in_progress') stats.in_progress++
    else if (r.outcome === 'escalated') stats.escalated++
  }
  stats.closed = stats.saved + stats.lost
  return stats
}

function reasonCounts(rows: AttemptRow[]): Array<{ label: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.reason_category) continue
    m.set(r.reason_category, (m.get(r.reason_category) ?? 0) + 1)
  }
  return Array.from(m.entries())
    .map(([k, v]) => ({ label: humanise(k), count: v }))
    .sort((a, b) => b.count - a.count)
}

function offerCounts(rows: AttemptRow[]): Array<{ label: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.offer_made || r.offer_made === 'none') continue
    m.set(r.offer_made, (m.get(r.offer_made) ?? 0) + 1)
  }
  return Array.from(m.entries())
    .map(([k, v]) => ({ label: humanise(k), count: v }))
    .sort((a, b) => b.count - a.count)
}

function humanise(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

function Wrap({
  title = 'Cancel-save',
  subtitle,
  pillLabel,
  children,
}: {
  title?: string
  subtitle?: string
  pillLabel?: string
  children: React.ReactNode
}) {
  return (
    <div className="px-8 py-10">
      <header className="mb-8">
        {pillLabel && (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
            {pillLabel}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-zinc-500">{subtitle}</p>}
      </header>
      {children}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const border = {
    neutral: 'border-zinc-200',
    good: 'border-emerald-200',
    warn: 'border-amber-200',
    bad: 'border-red-200',
  }[tone]
  const colour = {
    neutral: 'text-zinc-500',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  }[tone]
  return (
    <div className={`rounded-2xl border ${border} bg-white p-5`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <Icon className={`h-4 w-4 ${colour}`} />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
    </div>
  )
}

function Breakdown({
  title,
  rows,
  empty,
}: {
  title: string
  rows: Array<{ label: string; count: number }>
  empty: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-zinc-700">{r.label}</span>
                <span className="font-semibold tabular-nums text-zinc-900">{r.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full bg-emerald-500/70"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    saved: { bg: 'bg-emerald-50', fg: 'text-emerald-800', label: 'Saved' },
    lost: { bg: 'bg-red-50', fg: 'text-red-800', label: 'Lost' },
    in_progress: { bg: 'bg-amber-50', fg: 'text-amber-800', label: 'In progress' },
    escalated: { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'Escalated' },
  }
  const e = map[outcome] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: outcome }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.bg} ${e.fg}`}>
      {e.label}
    </span>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-12 text-center">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{body}</p>
    </div>
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
