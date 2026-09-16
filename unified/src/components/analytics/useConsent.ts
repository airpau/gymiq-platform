'use client'

import { useEffect, useState } from 'react'
import { onConsentChange, readConsent, type Consent } from '@/lib/analytics/consent'

/**
 * The visitor's stored consent. `ready` is false during the server render and
 * the first client render, so nothing consent gated renders until the cookie
 * has actually been read.
 */
export function useConsent(): { ready: boolean; consent: Consent | null } {
  const [state, setState] = useState<{ ready: boolean; consent: Consent | null }>({ ready: false, consent: null })
  useEffect(() => {
    setState({ ready: true, consent: readConsent() })
    return onConsentChange((c) => setState({ ready: true, consent: c }))
  }, [])
  return state
}
