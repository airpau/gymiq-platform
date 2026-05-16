import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  Users,
  MessageSquare,
  CheckCircle2,
  ShieldAlert,
  PoundSterling,
  ArrowRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface KPI {
  label: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'neutral' | 'good' | 'warn' | 'bad'
  href?: string
}

export default async function OverviewPage() {
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) {
    return (
      <Wrap title="Overview" subtitle="Service not configured.">
        <p className="text-sm text-zinc-500">
          The Supabase service key is missing — Paul needs to add SUPABASE_SERVICE_ROLE_KEY to Vercel.
        </p>
      </Wrap>
    )
  }

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name, messaging_enabled')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!gym) {
    return (
      <Wrap title="Overview" subtitle="Welcome to GymIQ — let's get you set up.">
        <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-12 text-center">
          <h2 className="text-base font-semibold text-zinc-900">No gym set up yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            Upload a member CSV on the homepage to generate your retention audit, then click &ldquo;Run this for me&rdquo; to claim it.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Start an audit <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Wrap>
    )
  }

  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()

  const [
    { count: memberCount },
    { count: highRiskCount },
    { count: outboundCount },
    { count: repliedCount },
    { count: convsActive },
    { data: cancelStats },
    { data: savedMembersForRevenue },
  ] = await Promise.all([
    svc.from('members').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id),
    svc
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gym.id)
      .gte('risk_score', 61),
    svc
      .from('messages')
      .select('id, conversations!inner(gym_id)', { count: 'exact', head: true })
      .eq('direction', 'outbound')
      .eq('conversations.gym_id', gym.id)
      .gte('created_at', since30),
    svc
      .from('messages')
      .select('id, conversations!inner(gym_id)', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .eq('conversations.gym_id', gym.id)
      .gte('created_at', since30),
    svc
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gym.id)
      .in('status', ['active', 'waiting_human']),
    svc
      .from('cancel_save_attempts')
      .select('outcome')
      .eq('gym_id', gym.id)
      .gte('created_at', since30),
    svc
      .from('cancel_save_attempts')
      .select('outcome, members!inner(monthly_fee)')
      .eq('gym_id', gym.id)
      .eq('outcome', 'saved')
      .gte('created_at', since30),
  ])

  const saveCounts = countOutcomes(cancelStats ?? [])
  const closed = saveCounts.saved + saveCounts.lost
  const saveRate = closed > 0 ? Math.round((saveCounts.saved / closed) * 100) : null
  const replyRate =
    outboundCount && outboundCount > 0
      ? Math.round(((repliedCount ?? 0) / outboundCount) * 100)
      : null

  const revenueProtected = (savedMembersForRevenue ?? []).reduce<number>((sum, row) => {
    // row.members may be an object or array depending on PG join shape
    const m = Array.isArray(row.members) ? row.members[0] : row.members
    const fee = typeof m?.monthly_fee === 'number' ? m.monthly_fee : 0
    return sum + fee * 12 // annualised LTV signal
  }, 0)

  const kpis: KPI[] = [
    {
      label: 'Active members',
      value: fmt(memberCount ?? 0),
      sub: 'In your imported book',
      icon: Users,
      tone: 'neutral',
      href: '/members',
    },
    {
      label: 'High-risk members',
      value: fmt(highRiskCount ?? 0),
      sub: 'Risk score ≥ 61',
      icon: ShieldAlert,
      tone: 'warn',
      href: '/members?filter=high-risk',
    },
    {
      label: 'Open conversations',
      value: fmt(convsActive ?? 0),
      sub: 'Active or waiting on you',
      icon: MessageSquare,
      tone: 'neutral',
      href: '/conversations',
    },
    {
      label: 'Reply rate (30d)',
      value: replyRate === null ? '—' : `${replyRate}%`,
      sub: `${fmt(repliedCount ?? 0)} replies / ${fmt(outboundCount ?? 0)} sent`,
      icon: MessageSquare,
      tone: 'neutral',
    },
    {
      label: 'Save rate (30d)',
      value: saveRate === null ? '—' : `${saveRate}%`,
      sub: `${saveCounts.saved} saved · ${saveCounts.lost} lost · ${saveCounts.in_progress} live`,
      icon: CheckCircle2,
      tone: saveRate !== null && saveRate >= 40 ? 'good' : 'neutral',
      href: '/cancel-save',
    },
    {
      label: 'Revenue protected (30d)',
      value: `£${fmt(Math.round(revenueProtected))}`,
      sub: 'Annualised saves × current plan fee',
      icon: PoundSterling,
      tone: 'good',
    },
  ]

  return (
    <Wrap title="Overview" subtitle={gym.name} pillLabel={gym.name}>
      {!gym.messaging_enabled && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <p className="font-medium text-amber-900">Live messaging is OFF</p>
          <p className="mt-0.5 text-xs text-amber-800">
            Outbound messages are logged as DRY-RUN until you flip the switch in{' '}
            <Link href="/settings" className="font-medium underline decoration-amber-700/30 underline-offset-2">
              Settings
            </Link>
            . Use this time to check the conversation queue and the audit imports.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Where to go next</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NavCard
            title="Conversations"
            body="Reply, escalate, or close active retention threads."
            href="/conversations"
          />
          <NavCard
            title="Cancel-save attempts"
            body="See which save offers landed, which reasons drove churn."
            href="/cancel-save"
          />
          <NavCard
            title="Members"
            body="Your imported member list, sorted by risk score."
            href="/members"
          />
        </div>
      </section>
    </Wrap>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-GB')
}

function countOutcomes(rows: Array<{ outcome: string }>): {
  saved: number
  lost: number
  in_progress: number
  escalated: number
} {
  const c = { saved: 0, lost: 0, in_progress: 0, escalated: 0 }
  for (const r of rows) {
    if (r.outcome === 'saved') c.saved++
    else if (r.outcome === 'lost') c.lost++
    else if (r.outcome === 'in_progress') c.in_progress++
    else if (r.outcome === 'escalated') c.escalated++
  }
  return c
}

function Wrap({
  title,
  subtitle,
  pillLabel,
  children,
}: {
  title: string
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

function KpiCard({ kpi }: { kpi: KPI }) {
  const Icon = kpi.icon
  const toneClasses = {
    neutral: 'border-zinc-200',
    good: 'border-emerald-200',
    warn: 'border-amber-200',
    bad: 'border-red-200',
  }[kpi.tone]
  const iconColor = {
    neutral: 'text-zinc-500',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
  }[kpi.tone]
  const card = (
    <div
      className={`rounded-2xl border ${toneClasses} bg-white p-5 transition hover:shadow-sm`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500">{kpi.label}</p>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-900">{kpi.value}</p>
      {kpi.sub && <p className="mt-1 text-xs text-zinc-500">{kpi.sub}</p>}
    </div>
  )
  return kpi.href ? <Link href={kpi.href}>{card}</Link> : card
}

function NavCard({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-sm"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700" />
      </div>
      <p className="mt-1 text-xs text-zinc-500">{body}</p>
    </Link>
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

