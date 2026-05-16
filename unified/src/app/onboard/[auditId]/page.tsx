'use client'

/**
 * /onboard/[auditId]
 *
 * Landing page that runs immediately after a freshly-signed-up user comes
 * back from /auth/signup?audit=<id>. Triggers /api/onboard/claim, then shows
 * a confirmation screen with what was imported and what happens next.
 */
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  Workflow,
  Send,
  ArrowRight,
} from 'lucide-react'

interface ClaimResult {
  gymId: string
  membersImported: number
  sequenceId: string
  enrolledCount: number
}

interface ClaimError {
  error: string
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; result: ClaimResult }
  | { status: 'error'; message: string }

export default function OnboardPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params)
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const res = await fetch('/api/onboard/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ auditId }),
        })
        const body = (await res.json()) as ClaimResult | ClaimError
        if (cancelled) return
        if (!res.ok || 'error' in body) {
          setState({
            status: 'error',
            message: 'error' in body ? body.error : `Failed (${res.status})`,
          })
          return
        }
        setState({ status: 'ready', result: body })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        setState({ status: 'error', message })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [auditId])

  return (
    <div className="min-h-screen bg-white text-zinc-900 antialiased">
      <OnboardNav />
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        {state.status === 'loading' && <Loading />}
        {state.status === 'error' && <ErrorView message={state.message} />}
        {state.status === 'ready' && <Success result={state.result} />}
      </div>
    </div>
  )
}

function OnboardNav() {
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

function Loading() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
        Setting up your gym…
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Importing your member list, creating the default retention sequence, and queuing up the deep sleepers. Should be done in a few seconds.
      </p>
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-10 shadow-sm">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
        We couldn&apos;t finish setting up.
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/#audit"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
        >
          Run another audit
        </Link>
        <a
          href="mailto:hello@gymiq.ai?subject=Onboarding issue"
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Email us — we&apos;ll fix it
        </a>
      </div>
    </div>
  )
}

function Success({ result }: { result: ClaimResult }) {
  return (
    <div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-8 shadow-sm">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Your gym is live in GymIQ.
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
          Everything from your audit is now wired up. Here&apos;s what just happened:
        </p>
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card icon={Users} label="Members imported" value={result.membersImported.toLocaleString('en-GB')} />
        <Card icon={Workflow} label="Sequence created" value="3-step default" />
        <Card icon={Send} label="Deep sleepers enrolled" value={result.enrolledCount.toLocaleString('en-GB')} />
      </ul>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-base font-semibold text-zinc-900">What happens next</h2>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-600">
          <li>
            <span className="font-medium text-zinc-900">1. WhatsApp setup —</span> we need to finish registering your WhatsApp Business sender with Meta before the first message can fly. We&apos;ll guide you through it from your dashboard.
          </li>
          <li>
            <span className="font-medium text-zinc-900">2. Dry-run preview —</span> until WhatsApp is live, every queued message stays in dry-run mode. You see exactly what we&apos;d send, nothing leaves the door.
          </li>
          <li>
            <span className="font-medium text-zinc-900">3. Approval to go live —</span> once you flip the switch, the queued sequences start firing at the right hours, classify replies automatically, and route real save offers via the cancel-save engine.
          </li>
        </ol>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/overview"
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Open dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/#audit"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
        >
          Run another audit
        </Link>
      </div>
    </div>
  )
}

function Card({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-zinc-400" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
    </li>
  )
}
