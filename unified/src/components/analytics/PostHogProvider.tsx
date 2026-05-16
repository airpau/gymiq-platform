'use client'

/**
 * PostHog client-side provider.
 *
 * Initialises PostHog once on mount (no-op if NEXT_PUBLIC_POSTHOG_KEY is
 * absent) and captures a pageview on every client-side route change. Wraps
 * the root layout so it covers marketing + dashboard pages alike.
 *
 * We use a Suspense boundary because usePathname/useSearchParams need it in
 * Next 15 client components when called outside a page boundary.
 */
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return
    if (typeof window === 'undefined') return
    // Idempotent: if already initialised, skip.
    // posthog-js exposes __loaded internally but we use a public guard instead.
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) return
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false, // we fire manually per route change
      capture_pageleave: true,
      person_profiles: 'identified_only',
      loaded: (ph) => {
        if (process.env.NODE_ENV === 'development') ph.opt_out_capturing()
      },
    })
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
