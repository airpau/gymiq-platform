import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Search, AlertTriangle, Snowflake, UserX, Sparkles } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ filter?: string; q?: string }>
}

interface MemberRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  plan_name: string | null
  monthly_fee: number | null
  last_visit: string | null
  next_payment: string | null
  risk_score: number
  source_metadata: { sleeper_category?: string; payment_failed?: boolean } | null
}

export default async function MembersPage({ searchParams }: PageProps) {
  const { filter, q } = await searchParams
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
          body="Run an audit on the homepage and click 'Run this for me' to populate your member list."
        />
      </Wrap>
    )
  }

  let query = svc
    .from('members')
    .select('id, name, email, phone, status, plan_name, monthly_fee, last_visit, next_payment, risk_score, source_metadata')
    .eq('gym_id', gym.id)
    .order('risk_score', { ascending: false })
    .limit(500)

  if (filter === 'high-risk') query = query.gte('risk_score', 61)
  if (filter === 'frozen') query = query.eq('status', 'frozen')
  if (filter === 'sleeper') query = query.eq('status', 'sleeper')
  if (filter === 'churned') query = query.eq('status', 'churned')
  if (q) query = query.ilike('name', `%${q}%`)

  const { data: members } = await query
  const rows = (members ?? []) as MemberRow[]

  const counts = await getCounts(svc, gym.id)

  return (
    <Wrap title="Members" subtitle={`${counts.total.toLocaleString('en-GB')} imported from your latest audit`} pillLabel={gym.name}>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <FilterChip href="/members" label="All" count={counts.total} active={!filter} />
        <FilterChip
          href="/members?filter=high-risk"
          label="High risk"
          count={counts.highRisk}
          icon={AlertTriangle}
          active={filter === 'high-risk'}
          tone="warn"
        />
        <FilterChip
          href="/members?filter=sleeper"
          label="Sleepers"
          count={counts.sleeper}
          icon={Sparkles}
          active={filter === 'sleeper'}
        />
        <FilterChip
          href="/members?filter=frozen"
          label="Frozen"
          count={counts.frozen}
          icon={Snowflake}
          active={filter === 'frozen'}
        />
        <FilterChip
          href="/members?filter=churned"
          label="Churned"
          count={counts.churned}
          icon={UserX}
          active={filter === 'churned'}
          tone="bad"
        />

        <form action="/members" method="get" className="ml-auto flex items-center gap-2">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder="Search by name…"
              className="rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </form>
      </div>

      {rows.length === 0 ? (
        <Empty
          title={q ? `No members match "${q}"` : 'No members in this view'}
          body="Try a different filter or import members via the audit upload."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Last visit</th>
                <th className="px-4 py-3 font-medium">Next payment</th>
                <th className="px-4 py-3 text-right font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-zinc-50/60">
                  <td className="px-4 py-3">
                    <Link
                      href={`/members/${m.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {m.name}
                    </Link>
                    <div className="text-[11px] text-zinc-500">
                      {m.email && <span>{m.email}</span>}
                      {m.email && m.phone && <span className="mx-1.5 text-zinc-300">·</span>}
                      {m.phone && <span className="font-mono">{m.phone}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {m.plan_name ?? '—'}
                    {m.monthly_fee !== null && (
                      <span className="ml-1 text-[11px] text-zinc-500">£{m.monthly_fee}/mo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {m.last_visit ? formatRelativeDate(m.last_visit) : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {m.next_payment ? new Date(m.next_payment).toLocaleDateString('en-GB') : '—'}
                    {m.source_metadata?.payment_failed && (
                      <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                        Overdue
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RiskPill score={m.risk_score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Wrap>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function getCounts(svc: ReturnType<typeof serviceClient>, gymId: string) {
  if (!svc) return { total: 0, highRisk: 0, sleeper: 0, frozen: 0, churned: 0 }
  const [a, b, c, d, e] = await Promise.all([
    svc.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId),
    svc.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).gte('risk_score', 61),
    svc.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'sleeper'),
    svc.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'frozen'),
    svc.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'churned'),
  ])
  return {
    total: a.count ?? 0,
    highRisk: b.count ?? 0,
    sleeper: c.count ?? 0,
    frozen: d.count ?? 0,
    churned: e.count ?? 0,
  }
}

function formatRelativeDate(d: string): string {
  const date = new Date(d)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days < 0) return date.toLocaleDateString('en-GB')
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function RiskPill({ score }: { score: number }) {
  const tone = score >= 80 ? 'bad' : score >= 61 ? 'warn' : score >= 40 ? 'mid' : 'good'
  const colours = {
    bad: 'bg-red-50 text-red-800',
    warn: 'bg-amber-50 text-amber-800',
    mid: 'bg-zinc-100 text-zinc-700',
    good: 'bg-emerald-50 text-emerald-800',
  }[tone]
  return (
    <span className={`inline-flex min-w-[44px] justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${colours}`}>
      {score}
    </span>
  )
}

function FilterChip({
  href,
  label,
  count,
  icon: Icon,
  active,
  tone,
}: {
  href: string
  label: string
  count?: number
  icon?: React.ComponentType<{ className?: string }>
  active?: boolean
  tone?: 'warn' | 'bad'
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition'
  const toneClass = tone === 'warn'
    ? 'border border-amber-200'
    : tone === 'bad'
      ? 'border border-red-200'
      : 'border border-zinc-200'
  const activeClass = active ? 'bg-zinc-900 text-white border-zinc-900' : `bg-white text-zinc-700 hover:bg-zinc-50 ${toneClass}`
  return (
    <Link href={href} className={`${base} ${activeClass}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/15' : 'bg-zinc-100 text-zinc-600'}`}>
          {count.toLocaleString('en-GB')}
        </span>
      )}
    </Link>
  )
}

function Wrap({
  title = 'Members',
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
