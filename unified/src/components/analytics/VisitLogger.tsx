'use client'

/**
 * Fires one POST to /api/visit per browser session, on the first marketing
 * page the visitor lands on.
 *
 * This runs regardless of cookie consent, and deliberately so: it sets no
 * cookie, reads no cookie, stores no personal data, and records only the
 * campaign parameters the ad platform itself put in the URL. It is the
 * first party equivalent of a server access log. The Meta pixel and the
 * Google tag stay behind consent in AdTracking.tsx and are untouched.
 *
 * sessionStorage is used only to avoid logging the same session twice as the
 * visitor moves between pages. If it is unavailable the worst case is a
 * duplicate row, which the unique index on visit_id absorbs.
 */
import { useEffect } from 'react'
import { isPrivatePage } from '@/components/analytics/AdTracking'

const KEY = 'gymiq_visit_id'

function sessionVisitId(): { id: string; isNew: boolean } {
  try {
    const existing = window.sessionStorage.getItem(KEY)
    if (existing) return { id: existing, isNew: false }
    const id = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    window.sessionStorage.setItem(KEY, id)
    return { id, isNew: true }
  } catch {
    // Private mode or storage blocked: still log, just without dedupe.
    return { id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, isNew: true }
  }
}

export default function VisitLogger() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isPrivatePage(window.location.pathname, window.location.search)) return

    const { id, isNew } = sessionVisitId()
    if (!isNew) return

    const payload = JSON.stringify({
      visitId: id,
      landingPage: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
    })

    // keepalive so the request survives the visitor bouncing straight back,
    // which is exactly the visit we most need to count.
    try {
      void fetch('/api/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    } catch {
      // never break the page
    }
  }, [])

  return null
}
