import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Phone, Mail, User } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface DeskRow {
  lead_id: string
  name: string | null
  phone_e164: string | null
  email: string | null
  source: string | null
  owner: string | null
  current_stage: string
  call_attempts: number
  last_outcome: string | null
  age_minutes: number
  priority: number
  sla_breached: boolean
  due_at: string | null
}

export default async function LeadsPage() {
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) {
    return (
      <Wrap>
        <Empty title="Service not configured" body="SUPABASE_SERVICE_ROLE_KEY missing." />
      </Wrap>
    )
  }

  // A login reaches a gym two ways: it owns the gym outright, or it has a row in
  // gym_users. Check both, otherwise a perfectly valid staff login sees nothing.
  let { data: gym } = await svc
    .from('gyms')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .maybeSingle()

  if (!gym) {
    const { data: membership } = await svc
      .from('gym_users')
      .select('gym_id, gyms(id, name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    const linked = membership?.gyms as { id: string; name: string } | null | undefined
    if (linked) gym = linked
  }

  if (!gym) {
    return (
      <Wrap>
        <Empty
          title="No gym linked to this account"
          body="This login isn't linked to a gym yet. Once it is, your lead desk appears here."
        />
      </Wrap>
    )
  }

  // v_lead_desk already excludes dead / opted-out / joined / lost, so this is
  // the live call list. It is a small set, so we fetch it all and compute the
  // tiles from it rather than issuing separate count queries.
  const { data: deskData } = await svc
    .from('v_lead_desk')
    .select('lead_id, name, phone_e164, email, source, owner, current_stage, call_attempts, last_outcome, age_minutes, priority, sla_breached, due_at')
    .eq('gym_id', gym.id)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1000)

  const desk = (deskData ?? []) as DeskRow[]

  const [{ count: parkedCount }, { count: optedOutCount }] = await Promise.all([
    svc.from('leads').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id).eq('current_stage', 'dead'),
    svc.from('leads').select('id', { count: 'exact', head: true }).eq('gym_id', gym.id).eq('current_stage', 'opted_out'),
  ])

  const breached = desk.filter((d) => d.priority === 1).length
  const dueNow = desk.filter((d) => d.priority === 2).length

  return (
    <Wrap title="Lead desk" subtitle={`${gym.name}. The live call list, every lead with an owner and a due time.`}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Active leads" value={desk.length} />
        <Stat label="Past first-touch SLA" value={breached} tone={breached > 0 ? 'bad' : 'neutral'} />
        <Stat label="Due a call now" value={dueNow} tone={dueNow > 0 ? 'warn' : 'neutral'} />
        <Stat label="Parked / suppressed" value={(parkedCount ?? 0) + (optedOutCount ?? 0)} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Call list</h2>
        {desk.length === 0 ? (
          <Empty title="No active leads" body="New leads and abandoned sign-ups appear here as they come in." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3 font-medium">Attempts</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {desk.map((d) => (
                  <tr key={d.lead_id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{d.name || '(no name)'}</div>
                      <div className="mt-0.5 flex flex-col gap-0.5 text-[11px] text-zinc-500">
                        {d.phone_e164 && (
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{d.phone_e164}</span>
                        )}
                        {d.email && (
                          <span className="flex items-center gap-1"><Mail className="h-3 w-3" /><span className="truncate" title={d.email}>{d.email}</span></span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{d.source ?? '-'}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      <span className="flex items-center gap-1"><User className="h-3 w-3 text-zinc-400" />{d.owner ?? 'Unowned'}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{formatAge(d.age_minutes)}</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700">{d.call_attempts}</td>
                    <td className="px-4 py-3"><PriorityBadge priority={d.priority} lastOutcome={d.last_outcome} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Wrap>
  )
}

function formatAge(mins: number): string {
  if (mins == null) return '-'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'warn' | 'bad' }) {
  const toneCls = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-zinc-900'
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  )
}

function PriorityBadge({ priority, lastOutcome }: { priority: number; lastOutcome: string | null }) {
  const map: Record<number, { bg: string; fg: string; label: string }> = {
    1: { bg: 'bg-red-50', fg: 'text-red-700', label: 'SLA breached' },
    2: { bg: 'bg-amber-50', fg: 'text-amber-800', label: 'Due now' },
    3: { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'Awaiting first call' },
    4: { bg: 'bg-emerald-50', fg: 'text-emerald-800', label: lastOutcome || 'In progress' },
  }
  const e = map[priority] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: '-' }
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.bg} ${e.fg}`}>{e.label}</span>
}

function Wrap({
  title = 'Lead desk',
  subtitle,
  children,
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
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
