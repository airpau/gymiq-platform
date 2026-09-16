'use client'

/**
 * Runs captureAttribution() on every route change so utm_* / fbclid / gclid
 * from an ad click survive into the lead routes. Only with advertising
 * consent; if consent is given on the landing page, the tags still in the
 * address bar are captured at that moment. Renders nothing.
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { captureAttribution } from '@/lib/analytics/attribution'
import { useConsent } from '@/components/analytics/useConsent'

export default function AttributionCapture() {
  const pathname = usePathname()
  const { consent } = useConsent()
  const ads = consent?.ads === true
  useEffect(() => {
    if (ads) captureAttribution()
  }, [pathname, ads])
  return null
}
