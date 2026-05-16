'use client'

/**
 * /auth/signup
 *
 * Supports two entry paths:
 *
 *   1. From the audit report — URL has ?audit=<UUID>.
 *      Pre-fills email + firstName + gymName from the audit row, locks the
 *      email (must match the audit's email to avoid hijacks), and on success
 *      redirects to /onboard/<auditId> which runs the claim flow.
 *
 *   2. Direct signup — no ?audit param.
 *      Plain signup; lands on /overview after. The user can run an audit and
 *      claim it later.
 */
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Loader2, AlertCircle, Sparkles } from 'lucide-react'

interface AuditPrefill {
  firstName: string
  gymName: string
  email: string
  liveMembers: number
  highRisk: number
  monthlyRevenueAtRisk: number
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<Shell />}>
      <SignUpForm />
    </Suspense>
  )
}

function SignUpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const auditId = searchParams.get('audit')

  const [prefill, setPrefill] = useState<AuditPrefill | null>(null)
  const [loadingAudit, setLoadingAudit] = useState(Boolean(auditId))
  const [firstName, setFirstName] = useState('')
  const [gymName, setGymName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load audit prefill data if we have an audit param.
  useEffect(() => {
    if (!auditId) return
    fetch(`/api/audit/${auditId}/prefill`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Audit not found'))))
      .then((data: AuditPrefill) => {
        setPrefill(data)
        setFirstName(data.firstName)
        setGymName(data.gymName)
        setEmail(data.email)
        setLoadingAudit(false)
      })
      .catch(() => {
        // If audit lookup fails, fall through to a plain signup form.
        setLoadingAudit(false)
      })
  }, [auditId])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name: firstName, gym_name: gymName },
      },
    })

    if (authError) {
      setError(authError.message)
      setSubmitting(false)
      return
    }

    // If email confirmation is OFF in Supabase settings, we're signed in
    // immediately and the session cookie is set. If it's ON, the user has
    // to click a link in their email first — we'll route them through the
    // callback. For the MVP we assume confirmation is OFF so we can run
    // the claim flow right after.
    if (!data.session) {
      // Try a sign-in to ensure we have a session before the claim call.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInErr) {
        setError('Account created. Please check your email to confirm and then sign in.')
        setSubmitting(false)
        return
      }
    }

    if (auditId) {
      router.push(`/onboard/${auditId}`)
    } else {
      router.push('/overview')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased">
      <Nav />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-2 lg:gap-16">
        {/* Left rail: context */}
        <div className="order-2 lg:order-1">
          {loadingAudit ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
              <p className="mt-3 text-sm text-zinc-500">Loading your audit…</p>
            </div>
          ) : prefill ? (
            <PrefillContext prefill={prefill} />
          ) : (
            <PlainContext />
          )}
        </div>

        {/* Right rail: form */}
        <div className="order-1 lg:order-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {prefill ? 'Run this on autopilot' : 'Create your GymIQ account'}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              {prefill
                ? `We'll set ${prefill.gymName} up with the audit results in under a minute.`
                : 'Start with a free trial. No card required.'}
            </p>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/60 px-3 py-2.5 text-xs text-red-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSignUp} className="mt-5 space-y-3">
              <Field
                id="gymName"
                label="Gym name"
                value={gymName}
                onChange={setGymName}
                autoComplete="organization"
                required
              />
              <Field
                id="firstName"
                label="Your first name"
                value={firstName}
                onChange={setFirstName}
                autoComplete="given-name"
                required
              />
              <Field
                id="email"
                label="Work email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                required
                disabled={Boolean(prefill)}
                hint={prefill ? 'Locked to the email you used for the audit' : undefined}
              />
              <Field
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                required
                minLength={8}
                hint="Min 8 characters"
              />

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating your account…
                  </>
                ) : prefill ? (
                  <>Run this on autopilot</>
                ) : (
                  <>Create account</>
                )}
              </button>

              <p className="pt-2 text-center text-xs text-zinc-500">
                Already on GymIQ?{' '}
                <Link href="/auth/login" className="font-medium text-emerald-700 hover:text-emerald-800">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

function Shell() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    </div>
  )
}

function Nav() {
  return (
    <header className="border-b border-zinc-200/70 bg-white/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-700 text-[11px] font-bold text-white shadow-sm">
            IQ
          </span>
          GymIQ
        </Link>
      </div>
    </header>
  )
}

function PrefillContext({ prefill }: { prefill: AuditPrefill }) {
  return (
    <div>
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
        <Sparkles className="h-3.5 w-3.5" />
        Picking up from your audit
      </span>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        We&apos;ll contact the right members at the right time.
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-600">
        Your account takes 30 seconds to set up. From there, GymIQ runs your retention sequences on autopilot. The first messages stay in dry-run mode so you can review every word before anything goes out.
      </p>
      <ul className="mt-6 space-y-3">
        <Stat label={`${gbp(prefill.monthlyRevenueAtRisk)}/month at risk`} hint="across all live members in your upload" />
        <Stat label={`${prefill.highRisk.toLocaleString('en-GB')} high-risk members`} hint="that GymIQ will queue first" />
        <Stat label={`${prefill.liveMembers.toLocaleString('en-GB')} members imported`} hint="from your audit file — no re-upload needed" />
      </ul>
    </div>
  )
}

function PlainContext() {
  return (
    <div>
      <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        Predict gym churn. Save members. Grow revenue.
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-600">
        GymIQ adds AI churn prediction, cancel-save conversations, and instant lead follow-up to the CRM you already use. Free trial, no card.
      </p>
    </div>
  )
}

function Stat({ label, hint }: { label: string; hint: string }) {
  return (
    <li className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{hint}</p>
    </li>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required,
  disabled,
  minLength,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  required?: boolean
  disabled?: boolean
  minLength?: number
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-600"
      />
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  )
}

function gbp(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}
