'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  UserCheck,
  AlertCircle,
  Send,
  Sparkles,
  Loader2,
} from 'lucide-react'

type OfferType = 'freeze' | 'downgrade' | 'discount' | 'free_session' | 'pt_session' | 'none'

type ReasonCategory = 'too_expensive' | 'not_using' | 'moving' | 'injury' | 'unhappy' | 'other'

interface Props {
  conversationId: string
  memberId: string | null
  status: string
  hasActiveCancelSave: boolean
  messagingEnabled: boolean
}

type Panel = null | 'saved' | 'lost' | 'reply'

export default function ConversationActions({
  conversationId,
  memberId,
  status,
  hasActiveCancelSave,
  messagingEnabled,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const closed = status === 'closed'

  async function post(path: string, body?: Record<string, unknown>) {
    setError(null)
    setBusy(path)
    try {
      const res = await fetch(`/api/conversations/${conversationId}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `${res.status} ${res.statusText}`)
      }
      setPanel(null)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  if (closed) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Actions</p>
        <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
          This conversation is closed. Open it again from the cancel-save dashboard if needed.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">Actions</p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}

      {!messagingEnabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Messaging is in dry-run for this gym. Replies you send will be logged with a [DRY-RUN] prefix and not delivered.
        </p>
      )}

      {!panel && (
        <div className="space-y-1.5">
          <ActionButton
            icon={Send}
            label="Send manual reply"
            onClick={() => setPanel('reply')}
            tone="primary"
          />
          {memberId && !hasActiveCancelSave && (
            <ActionButton
              icon={Sparkles}
              label="Start cancel-save"
              onClick={() => post('/start-cancel-save')}
              busy={busy === '/start-cancel-save' || pending}
              tone="secondary"
            />
          )}
          <ActionButton
            icon={CheckCircle2}
            label="Mark saved"
            onClick={() => setPanel('saved')}
            tone="success"
          />
          <ActionButton
            icon={XCircle}
            label="Mark lost"
            onClick={() => setPanel('lost')}
            tone="danger"
          />
          {status !== 'waiting_human' && (
            <ActionButton
              icon={UserCheck}
              label="Escalate to me"
              onClick={() => post('/escalate')}
              busy={busy === '/escalate' || pending}
              tone="secondary"
            />
          )}
        </div>
      )}

      {panel === 'reply' && (
        <ReplyPanel
          messagingEnabled={messagingEnabled}
          busy={busy === '/reply' || pending}
          onCancel={() => setPanel(null)}
          onSubmit={(body) => post('/reply', { body })}
        />
      )}

      {panel === 'saved' && (
        <SavedPanel
          busy={busy === '/save' || pending}
          onCancel={() => setPanel(null)}
          onSubmit={(offerType, offerDetails) => post('/save', { offerType, offerDetails })}
        />
      )}

      {panel === 'lost' && (
        <LostPanel
          busy={busy === '/lost' || pending}
          onCancel={() => setPanel(null)}
          onSubmit={(reasonCategory, note) => post('/lost', { reasonCategory, note })}
        />
      )}
    </div>
  )
}

// ─── sub-components ─────────────────────────────────────────────────────────

function ActionButton({
  icon: Icon,
  label,
  onClick,
  busy,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  busy?: boolean
  tone: 'primary' | 'secondary' | 'success' | 'danger'
}) {
  const tones = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
    secondary: 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
    success: 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    danger: 'border border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
  }
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${tones[tone]}`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    </button>
  )
}

function ReplyPanel({
  busy,
  messagingEnabled,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  messagingEnabled: boolean
  onCancel: () => void
  onSubmit: (body: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-xs font-medium text-zinc-900">Manual reply</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your reply…"
        rows={4}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
      />
      <p className="text-[10px] text-zinc-500">
        {messagingEnabled
          ? 'Sent immediately via Twilio (bypasses quiet hours).'
          : 'Logged as DRY-RUN — not delivered to the member.'}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(text)}
          disabled={busy || text.trim().length < 2}
          className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function SavedPanel({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (offerType: OfferType, offerDetails: string) => void
}) {
  const [offerType, setOfferType] = useState<OfferType>('freeze')
  const [offerDetails, setOfferDetails] = useState('')
  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-900">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Mark as saved
      </p>
      <label className="block text-[11px] font-medium text-emerald-900">
        Offer that saved them
        <select
          value={offerType}
          onChange={(e) => setOfferType(e.target.value as OfferType)}
          className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
        >
          <option value="freeze">Freeze (1–3 months)</option>
          <option value="downgrade">Downgrade plan</option>
          <option value="discount">Discount</option>
          <option value="free_session">Free session / PT taster</option>
          <option value="pt_session">PT session credit</option>
          <option value="none">None — they just stayed</option>
        </select>
      </label>
      <input
        value={offerDetails}
        onChange={(e) => setOfferDetails(e.target.value)}
        placeholder="Optional note (e.g. '2-month freeze starts 1 June')"
        className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(offerType, offerDetails)}
          disabled={busy}
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Confirm saved'}
        </button>
      </div>
    </div>
  )
}

function LostPanel({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (reasonCategory: ReasonCategory, note: string) => void
}) {
  const [reasonCategory, setReasonCategory] = useState<ReasonCategory>('too_expensive')
  const [note, setNote] = useState('')
  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-red-900">
        <AlertCircle className="h-3.5 w-3.5" />
        Mark as lost
      </p>
      <label className="block text-[11px] font-medium text-red-900">
        Why
        <select
          value={reasonCategory}
          onChange={(e) => setReasonCategory(e.target.value as ReasonCategory)}
          className="mt-1 w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
        >
          <option value="too_expensive">Too expensive</option>
          <option value="not_using">Not using / too busy</option>
          <option value="injury">Injury / health</option>
          <option value="moving">Moving away</option>
          <option value="unhappy">Unhappy with gym</option>
          <option value="other">Other</option>
        </select>
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note"
        className="w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(reasonCategory, note)}
          disabled={busy}
          className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Confirm lost'}
        </button>
      </div>
    </div>
  )
}
