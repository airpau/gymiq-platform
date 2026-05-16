import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Mail, Calendar, Globe } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface LeadRow {
  id: string
  email: string
  first_name: string | null
  gym_name: string | null
  source: string
  stage: string
  referrer: string | null
  user_agent: string | null
  converted_user_id: string | null
  created_at: string
  updated_at: string
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

  // Only Paul (the platform owner) should see the global leads pipeline. For
  // gym owners this view is the future home of their Lead Recovery AI inbox —
  // for now we just gate it behind a placeholder so it doesn't crash.
  const isPlatformOwner = user.email === 'aireypaul@googlemail.com'

  if (!isPlatformOwner) {
    return (
      <Wrap>
        <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-12 text-center">
          <h2 className="text-base font-semibold text-zinc-900">Lead Recovery AI — coming next</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            This is where your inbound web-form / Facebook / Instagram leads will land. The
            engine&apos;s being built — for retention customers it&apos;s a paid add-on (£179/mo)
            but is rolling in once we have the first paying retention customer through the door.
          </p>
        </div>
      </Wrap>
    )
  }

  const { data: leads } = await svc
    .from('leads')
    .select('id, email, first_name, gym_name, source, stage, referrer, user_agent, converted_user_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500)

  const rows = (leads ?? []) as LeadRow[]

  const buckets: Record<string, LeadRow[]> = {
    audit_started: [],
    audit_completed: [],
    signed_up: [],
    other: [],
  }
  for (const l of rows) {
    if (buckets[l.stage]) buckets[l.stage].push(l)
    else buckets.other.push(l)
  }

  return (
    <Wrap title="Lead pipeline" subtitle="Audit-form captures across all visitors (platform-owner view)">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total" value={rows.length} />
        <Stat label="Audit started" value={buckets.audit_started.length} />
        <Stat label="Audit completed" value={buckets.audit_completed.length} />
        <Stat label="Signed up" value={buckets.signed_up.length} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Most recent</h2>
        {rows.length === 0 ? (
          <Empty
            title="No leads yet"
            body="Once visitors land on the audit form and enter an email, they'll appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Gym / name</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                        <Mail className="h-3 w-3 text-zinc-400" />
                        {l.email}
                      </div>
                      {l.referrer && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                          <Globe className="h-3 w-3" />
                          <span className="truncate" title={l.referrer}>{trimReferrer(l.referrer)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {l.gym_name ?? '—'}
                      {l.first_name && (
                        <div className="text-[11px] text-zinc-500">{l.first_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StageBadge stage={l.stage} />
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{l.source}</td>
                    <td className="px-4 py-3 text-zinc-700">
                      <span className="flex items-center gap-1 text-[11px]">
                        <Calendar className="h-3 w-3 text-zinc-400" />
                        {new Date(l.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
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

// ─── helpers ────────────────────────────────────────────────────────────────

function trimReferrer(url: string): string {
  try {
    const u = new URL(url)
    return u.host + u.pathname
  } catch {
    return url.slice(0, 60)
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
    </div>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    audit_started: { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'Started' },
    audit_completed: { bg: 'bg-amber-50', fg: 'text-amber-800', label: 'Completed audit' },
    signed_up: { bg: 'bg-emerald-50', fg: 'text-emerald-800', label: 'Signed up' },
  }
  const e = map[stage] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: stage }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.bg} ${e.fg}`}>
      {e.label}
    </span>
  )
}

function Wrap({
  title = 'Lead pipeline',
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
