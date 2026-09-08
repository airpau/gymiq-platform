'use client'

import { useState, FormEvent } from 'react'
import { ArrowRight, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { CONTACT, PRICE_PER_CLUB, SYSTEMS } from '@/lib/site'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function BookForm({ intent = 'walkthrough' }: { intent?: 'walkthrough' | 'start' }) {
  const [f, setF] = useState({ firstName: '', gymName: '', email: '', phone: '', software: '', members: '', preferredTime: '', message: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!f.firstName.trim() || !f.gymName.trim() || !EMAIL_RE.test(f.email) || f.phone.replace(/\D/g, '').length < 9) {
      setError('Name, club, a working email and a phone number are needed so I can call you.')
      setState('error')
      return
    }
    setState('sending'); setError(null)
    try {
      const res = await fetch('/api/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, intent }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Something went wrong')
      setState('done')
      try { window.fbq?.('track', 'Schedule', { content_name: intent }) } catch { /* ignore */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl border border-moss/30 bg-moss-soft p-6" role="status">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-moss" />
          <div>
            <p className="font-display text-lg font-bold text-ink">Got it, {f.firstName}. I will call you {f.preferredTime ? `around ${f.preferredTime}` : 'today or tomorrow'}.</p>
            <p className="mt-2 text-sm text-slate">
              {intent === 'start'
                ? `Your request has reached me on my phone. I will send the setup link for ${f.gymName} and confirm the first review date on the call.`
                : `Your request has reached me on my phone and by email. A confirmation is on its way to ${f.email}. If you would rather pick a slot, reply to it.`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const input = 'w-full rounded-xl border border-mist bg-white px-4 py-3 text-[15px] text-ink placeholder-slate/60 focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20'
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <input type="text" name="company_url_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink">First name
          <input className={`${input} mt-1.5`} value={f.firstName} onChange={set('firstName')} autoComplete="given-name" placeholder="Dan" required />
        </label>
        <label className="block text-sm font-medium text-ink">Club
          <input className={`${input} mt-1.5`} value={f.gymName} onChange={set('gymName')} autoComplete="organization" placeholder="Riverside Fitness" required />
        </label>
        <label className="block text-sm font-medium text-ink">Email
          <input className={`${input} mt-1.5`} type="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@yourclub.co.uk" required />
        </label>
        <label className="block text-sm font-medium text-ink">Mobile
          <input className={`${input} mt-1.5`} type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="07700 900000" required />
        </label>
        <label className="block text-sm font-medium text-ink">Gym software
          <select className={`${input} mt-1.5`} value={f.software} onChange={set('software')}>
            <option value="">Choose</option>
            {['Glofox', 'ClubRight', 'Mindbody', 'PerfectGym', 'GymMaster', 'Xplor', 'TeamUp', 'Other or spreadsheet'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">Members
          <select className={`${input} mt-1.5`} value={f.members} onChange={set('members')}>
            <option value="">Choose</option>
            {['Under 300', '300 to 800', '800 to 1,500', '1,500 to 3,000', 'Over 3,000', 'More than one club'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium text-ink">Best time to call
        <input className={`${input} mt-1.5`} value={f.preferredTime} onChange={set('preferredTime')} placeholder="Weekday mornings, or Thursday after 2" />
      </label>
      <label className="block text-sm font-medium text-ink">Anything I should know first <span className="font-normal text-slate">(optional)</span>
        <textarea className={`${input} mt-1.5 min-h-[96px]`} value={f.message} onChange={set('message')} placeholder="What you are trying to fix, how many clubs, who else should be on the call" />
      </label>
      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-signal/10 px-4 py-3 text-sm text-signal" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
      )}
      <button type="submit" disabled={state === 'sending'} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-paper transition hover:bg-ink-2 disabled:opacity-60 sm:w-auto">
        {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {intent === 'start' ? `Start gymIQ at £${PRICE_PER_CLUB} a month` : 'Book my walkthrough'}
        <ArrowRight className="h-4 w-4" />
      </button>
      <p className="text-xs text-slate">Works with {SYSTEMS}. Prefer email? <a href={`mailto:${CONTACT}`} className="text-moss underline-offset-2 hover:underline">{CONTACT}</a>. No mailing list, no sales team, you get me.</p>
    </form>
  )
}
