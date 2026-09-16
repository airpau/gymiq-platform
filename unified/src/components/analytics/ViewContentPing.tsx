'use client'

import { useEffect, useRef } from 'react'
import { trackViewContent, newEventId } from '@/components/analytics/AdTracking'
import { useConsent } from '@/components/analytics/useConsent'

/**
 * Fires ViewContent once for the audit landing page, as soon as advertising
 * consent exists (on arrival, or when it is given on this page). The pixel
 * script may still be starting, so wait briefly for it. Renders nothing.
 */
export default function ViewContentPing({ name = 'membership_file_audit' }: { name?: string }) {
  const { consent } = useConsent()
  const ads = consent?.ads === true
  const sent = useRef(false)
  useEffect(() => {
    if (!ads || sent.current) return
    let tries = 0
    const t = setInterval(() => {
      tries += 1
      if (typeof window.fbq === 'function') {
        sent.current = true
        trackViewContent(name, newEventId('view'))
        clearInterval(t)
      } else if (tries > 30) {
        clearInterval(t)
      }
    }, 100)
    return () => clearInterval(t)
  }, [ads, name])
  return null
}
