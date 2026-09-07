'use client'

/**
 * Meta Pixel and Google tag, loaded only when their IDs are set in the
 * environment, so a preview build never fires real conversions.
 *
 *   NEXT_PUBLIC_META_PIXEL_ID        e.g. 1234567890
 *   NEXT_PUBLIC_GOOGLE_ADS_ID        e.g. AW-123456789
 *   NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL e.g. AbCdEfGhIj (the conversion label for "audit completed")
 *
 * Conversions are fired from trackLead() below, called by the audit form on a
 * successful upload, and mirrored server side by /api/audit through the Meta
 * Conversions API when META_CAPI_TOKEN is set.
 */
import Script from 'next/script'

const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID
const ADS = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

export default function AdTracking() {
  return (
    <>
      {PIXEL && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');`}
        </Script>
      )}
      {ADS && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ADS}`} strategy="afterInteractive" />
          <Script id="google-tag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${ADS}');`}
          </Script>
        </>
      )}
    </>
  )
}

/** Fire the "audit completed" conversion on both networks. Safe to call when neither is configured. */
export function trackLead(params: { email?: string; gymName?: string; value?: number }) {
  try {
    if (typeof window === 'undefined') return
    window.fbq?.('track', 'Lead', { content_name: 'membership_file_audit', value: params.value ?? 395, currency: 'GBP' })
    const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL
    if (ADS && label) {
      window.gtag?.('event', 'conversion', { send_to: `${ADS}/${label}`, value: params.value ?? 395, currency: 'GBP' })
    }
    window.gtag?.('event', 'generate_lead', { method: 'audit', gym: params.gymName ?? '' })
  } catch {
    // Tracking must never break the form.
  }
}
