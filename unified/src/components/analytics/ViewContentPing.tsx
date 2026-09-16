'use client'

import { useEffect } from 'react'
import { trackViewContent, newEventId } from '@/components/analytics/AdTracking'

/** Fires ViewContent once when the audit landing page mounts. Renders nothing. */
export default function ViewContentPing({ name = 'membership_file_audit' }: { name?: string }) {
  useEffect(() => {
    trackViewContent(name, newEventId('view'))
  }, [name])
  return null
}
