/**
 * Meta Conversions API, server side.
 *
 * Sends a hashed Lead event when an audit completes so Meta can attribute the
 * conversion even when the browser pixel is blocked. No-op unless both
 * NEXT_PUBLIC_META_PIXEL_ID and META_CAPI_TOKEN are set.
 */
import { createHash } from 'crypto'
import { META_PIXEL_ID } from '@/lib/site'

const PIXEL = META_PIXEL_ID
const TOKEN = process.env.META_CAPI_TOKEN

const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex')

export async function sendMetaLead(params: {
  email: string
  phone?: string | null
  firstName?: string | null
  eventId: string
  sourceUrl: string
  userAgent?: string | null
  ip?: string | null
  fbc?: string | null
  fbp?: string | null
  value?: number
}): Promise<{ sent: boolean; error?: string }> {
  if (!PIXEL || !TOKEN) return { sent: false, error: 'not configured' }
  const userData: Record<string, unknown> = {
    em: [sha256(params.email)],
    client_user_agent: params.userAgent ?? undefined,
    client_ip_address: params.ip ?? undefined,
    fbc: params.fbc ?? undefined,
    fbp: params.fbp ?? undefined,
  }
  if (params.phone) userData.ph = [sha256(params.phone.replace(/\D/g, ''))]
  if (params.firstName) userData.fn = [sha256(params.firstName)]
  const body = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        event_source_url: params.sourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: { currency: 'GBP', value: params.value ?? 495, content_name: 'membership_file_audit' },
      },
    ],
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PIXEL}/events?access_token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { sent: false, error: `Meta CAPI ${res.status}` }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
