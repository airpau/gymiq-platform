import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { ArrowLeft, Phone, Mail, Calendar } from 'lucide-react'
import ConversationActions from '@/components/dashboard/ConversationActions'

export const dynamic = 'force-dynamic'

interface MessageRow {
  id: string
  direction: 'inbound' | 'outbound'
  content: string
  channel: string
  reply_category: string | null
  reply_confidence: number | null
  reply_rationale: string | null
  sent_at: string | null
  created_at: string
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ConversationDetailPage({ params }: PageProps) {
  const { id } = await params
  const ssr = await createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) redirect('/auth/login')

  const svc = serviceClient()
  if (!svc) notFound()

  // Resolve user's gym + verify conversation belongs to it.
  const { data: gym } = await svc
    .from('gyms')
    .select('id, name, messaging_enabled, timezone')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!gym) redirect('/overview')

  const { data: conv } = await svc
    .from('conversations')
    .select('id, gym_id, member_id, phone, channel, status, created_at, last_message_at')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (!conv) notFound()

  const [{ data: messages }, { data: member }, { data: attempt }] = await Promise.all([
    svc
      .from('messages')
      .select('id, direction, content, channel, reply_category, reply_confidence, reply_rationale, sent_at, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(200),
    conv.member_id
      ? svc
          .from('members')
          .select('id, name, email, phone, plan_name, monthly_fee, status, last_visit, next_payment, join_date, risk_score')
          .eq('id', conv.member_id)
          .maybeSingle()
      : Promise.resolve({ data: null as unknown }),
    conv.member_id
      ? svc
          .from('cancel_save_attempts')
          .select('id, stage, outcome, reason_category, offer_made, offer_details, created_at, resolved_at')
          .eq('member_id', conv.member_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as unknown }),
  ])

  const m = member as null | {
    id: string
    name: string
    email: string | null
    phone: string | null
    plan_name: string | null
    monthly_fee: number | null
    status: string
    last_visit: string | null
    next_payment: string | null
    join_date: string | null
    risk_score: number
  }

  const cancelAttempt = attempt as null | {
    id: string
    stage: string
    outcome: string
    reason_category: string | null
    offer_made: string | null
    offer_details: string | null
    created_at: string
    resolved_at: string | null
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_320px]">
      {/* Main thread column */}
      <div className="border-r border-zinc-200 px-6 py-8 sm:px-8">
        <Link
          href="/conversations"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All conversations
        </Link>

        <header className="mt-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {m?.name ?? 'Unknown member'}
            </h1>
            <StatusBadge status={conv.status} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {conv.phone} · {conv.channel.toUpperCase()}{' '}
            {m?.plan_name && <> · {m.plan_name}</>}
            {m?.monthly_fee && <> · £{m.monthly_fee}/mo</>}
          </p>
        </header>

        {cancelAttempt && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm">
            <p className="font-medium text-amber-900">
              Cancel-save in progress · stage <span className="font-mono">{cancelAttempt.stage}</span> · outcome{' '}
              <span className="font-mono">{cancelAttempt.outcome}</span>
            </p>
            {cancelAttempt.reason_category && (
              <p className="mt-1 text-xs text-amber-800">Reason: {cancelAttempt.reason_category}</p>
            )}
            {cancelAttempt.offer_made && (
              <p className="text-xs text-amber-800">Offer: {cancelAttempt.offer_made} — {cancelAttempt.offer_details}</p>
            )}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {(messages ?? []).length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 text-sm text-zinc-500">
              No messages yet. The first will appear here once the sequence runner fires.
            </p>
          ) : (
            (messages as MessageRow[]).map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
        </div>
      </div>

      {/* Member sidebar + actions */}
      <aside className="bg-zinc-50/60 px-6 py-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700">Member</p>
        <h2 className="mt-1 text-base font-semibold text-zinc-900">{m?.name ?? '—'}</h2>

        <dl className="mt-5 space-y-3 text-sm">
          {m?.email && (
            <Field icon={Mail} label="Email" value={m.email} />
          )}
          {m?.phone && (
            <Field icon={Phone} label="Phone" value={m.phone} />
          )}
          {m?.last_visit && (
            <Field icon={Calendar} label="Last visit" value={new Date(m.last_visit).toLocaleDateString('en-GB')} />
          )}
          {m?.next_payment && (
            <Field icon={Calendar} label="Next payment" value={new Date(m.next_payment).toLocaleDateString('en-GB')} />
          )}
          {m?.join_date && (
            <Field icon={Calendar} label="Joined" value={new Date(m.join_date).toLocaleDateString('en-GB')} />
          )}
          {m && (
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs">
              <p className="text-zinc-500">Risk score</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900">{m.risk_score}/100</p>
            </div>
          )}
        </dl>

        <div className="mt-8">
          <ConversationActions
            conversationId={conv.id}
            memberId={conv.member_id}
            status={conv.status}
            hasActiveCancelSave={Boolean(cancelAttempt && cancelAttempt.outcome === 'in_progress')}
            messagingEnabled={Boolean(gym.messaging_enabled)}
          />
        </div>
      </aside>
    </div>
  )
}

function MessageBubble({ msg }: { msg: MessageRow }) {
  const isInbound = msg.direction === 'inbound'
  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isInbound
            ? 'border border-zinc-200 bg-white text-zinc-900'
            : msg.content.startsWith('[DRY-RUN]')
            ? 'border border-amber-200 bg-amber-50 text-zinc-900'
            : 'bg-zinc-900 text-white'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{msg.content.replace(/^\[DRY-RUN\]\s*/, '')}</p>
        <div
          className={`mt-1 flex flex-wrap items-center gap-2 text-[10px] ${
            isInbound ? 'text-zinc-400' : msg.content.startsWith('[DRY-RUN]') ? 'text-amber-700' : 'text-zinc-400'
          }`}
        >
          <span>{new Date(msg.created_at).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
          <span className="uppercase tracking-wider">{msg.channel}</span>
          {msg.content.startsWith('[DRY-RUN]') && <span className="font-semibold">DRY-RUN</span>}
          {msg.reply_category && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5">
              {msg.reply_category}
              {msg.reply_confidence !== null && ` ${Math.round(msg.reply_confidence * 100)}%`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active: { bg: 'bg-emerald-50', fg: 'text-emerald-800', label: 'Active' },
    waiting_human: { bg: 'bg-red-50', fg: 'text-red-800', label: 'Waiting for human' },
    closed: { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: 'Closed' },
  }
  const e = map[status] ?? { bg: 'bg-zinc-100', fg: 'text-zinc-700', label: status }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.bg} ${e.fg}`}>
      {e.label}
    </span>
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
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm text-zinc-900" title={value}>{value}</p>
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
