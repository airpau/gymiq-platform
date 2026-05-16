'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react'

interface Props {
  gym: {
    id: string
    name: string
    timezone: string
    whatsapp_number: string | null
    sms_number: string | null
    messaging_enabled: boolean
  }
  messagingLiveGlobal: boolean
}

const TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

export default function SettingsForm({ gym, messagingLiveGlobal }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(gym.name)
  const [timezone, setTimezone] = useState(gym.timezone)
  const [whatsapp, setWhatsapp] = useState(gym.whatsapp_number ?? '')
  const [sms, setSms] = useState(gym.sms_number ?? '')
  const [messagingEnabled, setMessagingEnabled] = useState(gym.messaging_enabled)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      const res = await fetch('/api/gym/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          timezone,
          whatsappNumber: whatsapp.trim() || null,
          smsNumber: sms.trim() || null,
          messagingEnabled,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `${res.status} ${res.statusText}`)
      }
      setSaved(true)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      // Roll back the toggle visually if it was the cause.
      setMessagingEnabled(gym.messaging_enabled)
    } finally {
      setBusy(false)
    }
  }

  async function toggleMessaging() {
    if (messagingEnabled) {
      // Going OFF — no confirmation needed.
      const next = false
      setMessagingEnabled(next)
      await flipOnly(next)
    } else {
      // Going ON — confirm.
      const ok = window.confirm(
        'Enable LIVE messaging? Real WhatsApp / SMS messages will be sent to members in your sequences. Make sure your sender numbers and quiet hours are correct first.',
      )
      if (!ok) return
      setMessagingEnabled(true)
      await flipOnly(true)
    }
  }

  async function flipOnly(next: boolean) {
    setError(null)
    setSaved(false)
    setBusy(true)
    try {
      const res = await fetch('/api/gym/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messagingEnabled: next }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `${res.status} ${res.statusText}`)
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed')
      setMessagingEnabled(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Profile */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Gym profile</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Used in member-facing messages and your dashboard header.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Gym name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </Field>
          <Field label="Timezone (quiet-hours window)">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Senders */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Messaging senders</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Twilio numbers we&apos;ll send from. E.164 format (e.g. <span className="font-mono">+447700900123</span>).
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="WhatsApp sender">
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+447700900123"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:border-zinc-400 focus:outline-none"
            />
          </Field>
          <Field label="SMS sender (fallback)">
            <input
              value={sms}
              onChange={(e) => setSms(e.target.value)}
              placeholder="+447700900123"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:border-zinc-400 focus:outline-none"
            />
          </Field>
        </div>
      </section>

      {/* Live messaging toggle */}
      <section
        className={`rounded-2xl border p-6 ${
          messagingEnabled
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-amber-200 bg-amber-50/40'
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              {messagingEnabled ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Live messaging — ON
                </>
              ) : (
                <>
                  <ShieldOff className="h-4 w-4 text-amber-700" />
                  Live messaging — OFF (dry-run)
                </>
              )}
            </h2>
            <p className="mt-1 max-w-xl text-xs text-zinc-600">
              {messagingEnabled
                ? 'Real WhatsApp / SMS messages will be sent to members. Quiet hours 09:00–20:00 local, STOP opt-out enforced.'
                : 'Every outbound message is logged with a [DRY-RUN] prefix and never reaches members. Flip on once you\'re ready to go live.'}
            </p>
            {!messagingLiveGlobal && (
              <p className="mt-2 max-w-xl text-[11px] text-amber-700">
                Note: the global <span className="font-mono">MESSAGING_LIVE</span> environment variable is off, so even with this toggle on, sends will stay dry-run. Paul flips this once Twilio + WhatsApp are fully approved.
              </p>
            )}
          </div>
          <button
            onClick={toggleMessaging}
            disabled={busy}
            className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              messagingEnabled ? 'bg-emerald-600' : 'bg-zinc-300'
            }`}
            role="switch"
            aria-checked={messagingEnabled}
            aria-label="Toggle live messaging"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                messagingEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Settings saved.
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={save}
          disabled={busy || pending}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy || pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-zinc-700">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}
