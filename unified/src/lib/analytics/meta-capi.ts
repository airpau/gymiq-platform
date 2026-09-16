/**
 * Meta Conversions API, server side.
 *
 * Mirrors the browser pixel events with hashed user data so Meta can attribute
 * a conversion even when the pixel is blocked. Each call carries the same
 * event_id the browser used, so Meta keeps one of the pair.
 *
 * No-op unless both NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_TOKEN are set.
 */
import { createHash } from 'crypto'
import { META_PIXEL_ID } from '@/lib/site'

const PIXEL = META_PIXEL_ID
const TOKEN = process.env.META_CAPI_TOKEN
const TEST_CODE = process.env.META_CAPI_TEST_EVENT_CODE

const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')

export interface MetaUser {
  email: string
  phone?: string | null
  firstName?: string | null
  userAgent?: string | null
  ip?: string | null
  fbc?: string | null
  fbp?: string | null
}

export interface MetaEventParams extends MetaUser {
  eventName: 'Lead' | 'AuditCompleted' | 'InitiateCheckout' | 'ViewContent' | 'Schedule'
  eventId: string
  sourceUrl: string
  value?: number
  contentName?: string
}

export async function sendMetaEvent(params: MetaEventParams): Promise<{ sent: boolean; error?: string }> {
  if (!PIXEL || !TOKEN) return { sent: false, error: 'not configured' }
  const userData: Record<string, unknown> = {
    em: [sha256(params.email)],
    client_user_agent: params.userAgent ?? undefined,
    client_ip_address: params.ip ?? undefined,
    fbc: params.fbc || undefined,
    fbp: params.fbp || undefined,
  }
  if (params.phone) {
    const digits = params.phone.replace(/\D/g, '')
    // UK numbers typed as 07... become 447... so they match Meta's E.164 hash.
    const e164 = digits.startsWith('0') && digits.length === 11 ? `44${digits.slice(1)}` : digits
    if (e164) userData.ph = [sha256(e164)]
  }
  if (params.firstName) userData.fn = [sha256(params.firstName)]
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: params.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        event_source_url: params.sourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: { currency: 'GBP', value: params.value ?? 495, content_name: params.contentName ?? 'membership_file_audit' },
      },
    ],
  }
  if (TEST_CODE) body.test_event_code = TEST_CODE
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PIXEL}/events?access_token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { sent: false, error: `Meta CAPI ${res.status} ${text.slice(0, 200)}` }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

/** Kept for existing callers: the Lead event. */
export async function sendMetaLead(params: MetaUser & { eventId: string; sourceUrl: string; value?: number }) {
  return sendMetaEvent({ ...params, eventName: 'Lead' })
}

export async function sendMetaAuditCompleted(params: MetaUser & { eventId: string; sourceUrl: string; value?: number }) {
  return sendMetaEvent({ ...params, eventName: 'AuditCompleted' })
}
