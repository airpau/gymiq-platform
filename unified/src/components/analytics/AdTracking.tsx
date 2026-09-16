'use client'

/**
 * Meta Pixel and Google tag, loaded only when their IDs are set in the
 * environment, so a preview build never fires real conversions.
 *
 *   NEXT_PUBLIC_META_PIXEL_ID         e.g. 1234567890 (falls back to the gymIQ pixel in lib/site)
 *   NEXT_PUBLIC_GOOGLE_ADS_ID         e.g. AW-123456789
 *   NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL e.g. AbCdEfGhIj (the conversion label for "audit requested")
 *
 * The event ladder, browser side, each mirrored by the Conversions API from
 * the matching route with the same eventID so Meta deduplicates:
 *
 *   PageView          every page (pixel init)
 *   ViewContent       the /audit landing page rendered
 *   InitiateCheckout  a valid email typed into the audit form
 *   Lead              audit details submitted (step 1). This is what the ads optimise for.
 *   AuditCompleted    a membership file parsed and a report produced (custom event)
 */
import Script from 'next/script'
import { META_PIXEL_ID } from '@/lib/site'

const PIXEL = META_PIXEL_ID
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

/** A fresh event id shared between the pixel call and the server side mirror. */
export function newEventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function fb(method: 'track' | 'trackCustom', name: string, data: Record<string, unknown>, eventId?: string) {
  try {
    if (typeof window === 'undefined') return
    window.fbq?.(method, name, data, eventId ? { eventID: eventId } : undefined)
  } catch {
    // Tracking must never break the page.
  }
}

/** The audit landing page was shown. */
export function trackViewContent(name = 'membership_file_audit', eventId?: string) {
  fb('track', 'ViewContent', { content_name: name, content_category: 'audit' }, eventId)
}

/** A valid email has been typed into the audit form. */
export function trackFormStart(eventId?: string) {
  fb('track', 'InitiateCheckout', { content_name: 'membership_file_audit' }, eventId)
  try {
    window.gtag?.('event', 'begin_audit', { method: 'audit' })
  } catch {
    // ignore
  }
}

/** Audit details submitted. Fires the Lead on both networks. */
export function trackLead(params: { eventId?: string; gymName?: string; value?: number }) {
  fb('track', 'Lead', { content_name: 'membership_file_audit', value: params.value ?? 495, currency: 'GBP' }, params.eventId)
  try {
    const label = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL
    if (ADS && label) {
      window.gtag?.('event', 'conversion', { send_to: `${ADS}/${label}`, value: params.value ?? 495, currency: 'GBP' })
    }
    window.gtag?.('event', 'generate_lead', { method: 'audit', gym: params.gymName ?? '' })
  } catch {
    // ignore
  }
}

/** A file was parsed and a report produced. Custom event, higher intent than Lead. */
export function trackAuditCompleted(params: { eventId?: string; gymName?: string; value?: number }) {
  fb('trackCustom', 'AuditCompleted', { content_name: 'membership_file_audit', value: params.value ?? 495, currency: 'GBP' }, params.eventId)
  try {
    window.gtag?.('event', 'audit_completed', { method: 'audit', gym: params.gymName ?? '' })
  } catch {
    // ignore
  }
}
