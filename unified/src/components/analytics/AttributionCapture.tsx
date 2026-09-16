'use client'

/**
 * Runs captureAttribution() on every route change so utm_* / fbclid / gclid
 * from an ad click survive into the lead routes. Renders nothing.
 */
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { captureAttribution } from '@/lib/analytics/attribution'

export default function AttributionCapture() {
  const pathname = usePathname()
  useEffect(() => {
    captureAttribution()
  }, [pathname])
  return null
}
