import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  PhoneOff,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface ConversationRow {
  id: string
  phone: string
  channel: string
  status: string
  last_message_at: string | null
  created_at: string
  member: { id: string; name: string; email: string | null; plan_name: string | null } | null
  last_message: { content: string; direction: string; reply_category: string | null } | null
}

export default async function ConversationsPage() {
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) {
    return <Empty title="Service not configured" body="SUPABASE_SERVICE_ROLE_KEY missing." />
  }

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!gym) {
    return (
      <Empty
        title="No gym set up yet"
        body="Run an audit and click 'Run this for me' to create your gym account first."
      />
    )
  }

  const { data: conversations } = await svc
    .from('conversations')
    .select('id, phone, channel, status, last_message_at, created_at, member_id')
    .eq('gym_id', gym.id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  const list = (conversations ?? []) as Array<{
    id: string
    phone: string
    channel: string
    status: string
    last_message_at: string | null
    created_at: string
    member_id: string | null
  }>

  const memberIds = Array.from(new Set(list.map((c) => c.member_id).filter(Boolean) as string[]))
  const convIds = list.map((c) => c.id)
  const [{ data: members }, { data: lastMsgs }] = await Promise.all([
    memberIds.length > 0
      ? svc.from('members').select('id, name, email, plan_name').in('id', memberIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; email: string | null; plan_name: string | null }> }),
    convIds.length > 0
      ? svc
          .from('messages')
          .select('id, conversation_id, content, direction, reply_category, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; conversation_id: string; content: string; direction: string; reply_category: string | null; created_at: string }> }),
  ])

  const memberMap = new Map((members ?? []).map((m) => [m.id, m]))
  const lastByConv = new Map<string, { content: string; direction: string; reply_category: string | null }>()
  for (const m of lastMsgs ?? []) {
    if (!lastByConv.has(m.conversation_id)) {
      lastByConv.set(m.conversation_id, { content: m.content, direction: m.direction, reply_category: m.reply_category })
    }
  }

  const rows: ConversationRow[] = list.map((c) => ({
    id: c.id,
    phone: c.phone,
    channel: c.channel,
    status: c.status,
    last_message_at: c.last_message_at,
    created_at: c.created_at,
    member: c.member_id ? memberMap.get(c.member_id) ?? null : null,
    last_message: lastByConv.get(c.id) ?? null,
  }))

  const buckets = {
    waiting_human: rows.filter((r) => r.status === 'waiting_human'),
    active: rows.filter((r) => r.status === 'active'),
    closed: rows.filter((r) => r.status === 'closed'),
  }

  return (
    <div className="px-8 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">
          {gym.name}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">Conversations</h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          Every outbound retention message and the replies that came back. Drill in to see the full thread and mark outcomes.
        </p>
      </header>

      {rows.length === 0 ? (
        <Empty
          title="No conversations yet"
          body="Members enrolled in your retention sequences will appear here as soon as the cron runner sends the first message (or once you turn messaging live)."
        />
      ) : (
        <div className="space-y-10">
          <Section title="Waiting for human" icon={AlertTriangle} iconClass="text-red-500" rows={buckets.waiting_human} />
          <Section title="Active" icon={MessageSquare} iconClass="text-emerald-600" rows={buckets.active} />
          <Section title="Closed" icon={CheckCircle2} iconClass="text-zinc-400" rows={buckets.closed} />
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  iconClass,
  rows,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  rows: ConversationRow[]
}) {
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Icon className={`h-4 w-4 ${iconClass}`} />
        {title}
        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">
          {rows.length}
        </span>
      </h2>
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/conversations/${r.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-zinc-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-zinc-900">{r.member?.name ?? 'Unknown member'}</span>
                  {r.member?.plan_name && (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                      {r.member.plan_name}
                    </span>
                  )}
                  {r.last_message?.reply_category && (
                    <CategoryBadge category={r.last_message.reply_category} />
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {r.last_message
                    ? `${r.last_message.direction === 'inbound' ? '↳' : '→'} ${r.last_message.content.slice(0, 120)}`
                    : 'No messages yet'}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {r.last_message_at ? timeSince(new Date(r.last_message_at)) : 'never'}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
                  {r.channel}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    busy: { bg: 'bg-amber-50', fg: 'text-amber-800', label: 'busy' },
    cost: { bg: 'bg-orange-50', fg: 'text-orange-800', label: 'cost' },
    problem: { bg: 'bg-red-50', fg: 'text-red-800', label: 'problem' },
    leaving: { bg: 'bg-red-100', fg: 'text-red-900', label: 'leaving' },
    positive: { bg: 'bg-emerald-50', fg: 'text-emerald-800', label: 'positive' },
    opt_out: { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'opt-out' },
    other: { bg: 'bg-zinc-50', fg: 'text-zinc-600', label: 'other' },
  }
  const e = map[category] ?? map.other
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${e.bg} ${e.fg}`}>
      {e.label}
    </span>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-8 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white px-8 py-12 text-center">
        <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <PhoneOff className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{body}</p>
      </div>
    </div>
  )
}

function timeSince(d: Date): string {
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-GB')
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
