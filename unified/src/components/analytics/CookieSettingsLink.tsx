'use client'

import { openConsentSettings } from '@/lib/analytics/consent'

/** Footer link that reopens the cookie choices. */
export default function CookieSettingsLink({ className = 'hover:text-ink', label = 'Cookie settings' }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={() => openConsentSettings()} className={className}>
      {label}
    </button>
  )
}
