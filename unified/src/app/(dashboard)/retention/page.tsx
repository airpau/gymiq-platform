import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Play, PauseCircle, CheckCircle2, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface SequenceRow {
  id: string
  name: string
  description: string | null
  status: string
  steps: Array<{ delay_hours: number; channel: string; body: string }> | null
  created_at: string
}

interface RunRow {
  id: string
  status: string
  current_step: number
  next_send_at: string | null
  member_id: string | null
  sequence_id: string
}

export default async function RetentionPage() {
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) {
    return <Wrap><Empty title="Service not configured" body="SUPABASE_SERVICE_ROLE_KEY missing." /></Wrap>
  }

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name, messaging_enabled')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!gym) {
    return (
      <Wrap>
        <Empty
          title="No gym set up yet"
          body="Run an audit on the homepage and click 'Run this for me' to enrol your sleepers in a recovery sequence."
        />
      </Wrap>
    )
  }

  const { data: sequences } = await svc
    .from('sequences')
    .select('id, name, description, status, steps, created_at')
    .eq('gym_id', gym.id)
    .order('created_at', { ascending: false })

  const seqs = (sequences ?? []) as SequenceRow[]
  const seqIds = seqs.map((s) => s.id)

  const { data: runs } = seqIds.length
    ? await svc
        .from('sequence_runs')
        .select('id, status, current_step, next_send_at, member_id, sequence_id')
        .in('sequence_id', seqIds)
    : { data: [] as RunRow[] }

  const allRuns = (runs ?? []) as RunRow[]
  const runStats = countRuns(allRuns)

  return (
    <Wrap title="Retention" subtitle="Outbound recovery sequences for sleepers + at-risk members" pillLabel={gym.name}>
      {!gym.messaging_enabled && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-medium text-amber-900">Sequences are running in DRY-RUN</p>
          <p className="mt-0.5 text-xs text-amber-800">
            The cron is firing on schedule, but no real messages are reaching members. Open{' '}
            <Link href="/conversations" className="font-medium underline decoration-amber-700/30 underline-offset-2">
              Conversations
            </Link>{' '}
            to see what would have gone out.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pending" value={runStats.pending} icon={Clock} tone="warn" />
        <StatCard label="In progress" value={runStats.in_progress} icon={Play} tone="neutral" />
        <StatCard label="Completed" value={runStats.completed} icon={CheckCircle2} tone="good" />
        <StatCard label="Halted" value={runStats.halted + runStats.opted_out} icon={PauseCircle} tone="neutral" />
      </div>

      <section className="mt-8 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-900">Sequences</h2>
        {seqs.length === 0 ? (
          <Empty
            title="No sequences yet"
            body="Sequences are created automatically when you claim an audit. If you don't see one, re-run the audit claim flow."
          />
        ) : (
          <div className="space-y-4">
            {seqs.map((s) => {
              const stats = countRuns(allRuns.filter((r) => r.sequence_id === s.id))
              return (
                <div key={s.id} className="rounded-2xl border border-zinc-200 bg-white p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-900">{s.name}</h3>
                      {s.description && (
                        <p className="mt-1 text-sm text-zinc-500">{s.description}</p>
                      )}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat label="Pending" value={stats.pending} />
                    <MiniStat label="In progress" value={stats.in_progress} />
                    <MiniStat label="Completed" value={stats.completed} />
                    <MiniStat label="Halted" value={stats.halted + stats.opted_out} />
                  </div>

                  {s.steps && s.steps.length > 0 && (
                    <ol className="mt-5 space-y-3">
                      {s.steps.map((step, i) => (
                        <li
                          key={i}
                          className="rounded-lg border border-zinc-200 bg-zinc-50/40 px-4 py-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white">
                              Step {i + 1}
                            </span>
                            <span>after {humaniseDelay(step.delay_hours)}</span>
                            <span className="uppercase tracking-wider">{step.channel}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-zinc-800">{step.body}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </Wrap>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function countRuns(runs: RunRow[]) {
  const c = { pending: 0, in_progress: 0, completed: 0, halted: 0, opted_out: 0, saved: 0 }
  for (const r of runs) {
    if (r.status === 'pending') c.pending++
    else if (r.status === 'in_progress') c.in_progress++
    else if (r.status === 'completed') c.completed++
    else if (r.status === 'halted') c.halted++
    else if (r.status === 'opted_out') c.opted_out++
    else if (r.status === 'saved') c.saved++
  }
  return c
}

function humaniseDelay(hours: number): string {
  if (hours === 0) return 'immediately'
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    active: { bg: 'bg-emerald-50', fg: 'text-emerald-800' },
    paused: { bg: 'bg-amber-50', fg: 'text-amber-800' },
    draft: { bg: 'bg-zinc-100', fg: 'text-zinc-700' },
    archived: { bg: 'bg-zinc-100', fg: 'text-zinc-500' },
  }
  const e = map[status] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700' }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.bg} ${e.fg}`}>
      {status}
    </span>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{value}</p>
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
  tone: 'neutral' | 'good' | 'warn'
}) {
  const border = {
    neutral: 'border-zinc-200',
    good: 'border-emerald-200',
    warn: 'border-amber-200',
  }[tone]
  const colour = {
    neutral: 'text-zinc-500',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
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

function Wrap({
  title = 'Retention',
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
