'use client'

/**
 * PostHog client-side provider.
 *
 * Initialises PostHog once on mount (no-op if NEXT_PUBLIC_POSTHOG_KEY is
 * absent) and captures a pageview on every client-side route change. Wraps
 * the root layout so it covers marketing + dashboard pages alike.
 *
 * Consent (lib/analytics/consent):
 *   no choice yet     memory persistence: page views are counted but nothing
 *                     is stored on the device and visits are not linked.
 *   analytics: true   normal persistence (first party cookie + localStorage).
 *   analytics: false  capturing is switched off entirely.
 *
 * We use a Suspense boundary because usePathname/useSearchParams need it in
 * Next 15 client components when called outside a page boundary.
 */
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { onConsentChange, readConsent, type Consent } from '@/lib/analytics/consent'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

function applyConsent(c: Consent | null) {
  if (c?.analytics === true) {
    posthog.set_config({ persistence: 'localStorage+cookie', disable_session_recording: false })
    if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing({ captureEventName: false })
  } else if (c?.analytics === false) {
    posthog.set_config({ persistence: 'memory' })
    if (!posthog.has_opted_out_capturing()) posthog.opt_out_capturing()
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return
    if (typeof window === 'undefined') return
    // Idempotent: if already initialised, skip.
    // posthog-js exposes __loaded internally but we use a public guard instead.
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) return
    const consent = readConsent()
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false, // we fire manually per route change
      capture_pageleave: true,
      person_profiles: 'identified_only',
      persistence: consent?.analytics ? 'localStorage+cookie' : 'memory',
      disable_session_recording: !consent?.analytics,
      opt_out_capturing_by_default: consent?.analytics === false,
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') ph.opt_out_capturing()
      },
    })
    applyConsent(consent)
    return onConsentChange((c) => applyConsent(c))
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  )
}

function PageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!POSTHOG_KEY) return
    if (typeof window === 'undefined') return
    const qs = searchParams?.toString()
    const url = qs ? `${pathname}?${qs}` : pathname
    posthog.capture('$pageview', { $current_url: window.location.origin + url })
  }, [pathname, searchParams])

  return null
}
