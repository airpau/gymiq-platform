/**
 * POST /api/gym/settings
 *
 * Updates the signed-in user's gym row. Two kinds of updates:
 *   - Lightweight profile (name, timezone, WhatsApp/SMS sender)
 *   - The MESSAGING_ENABLED toggle, which is the critical safety flip from
 *     dry-run to live outreach.
 *
 * We never allow flipping `messaging_enabled` to true without both senders
 * being set AND the global MESSAGING_LIVE env var being on — surfaced as
 * blocking errors so the dashboard explains why the toggle didn't take.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface SettingsBody {
  name?: string
  timezone?: string
  whatsappNumber?: string | null
  smsNumber?: string | null
  messagingEnabled?: boolean
}

const TIMEZONES = new Set([
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
])

const E164 = /^\+[1-9]\d{6,14}$/

export async function POST(req: NextRequest) {
  const ssr = await createServerClient()
  const { data: authData } = await ssr.auth.getUser()
  const user = authData?.user
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const svc = serviceClient()
  if (!svc) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })

  let payload: SettingsBody
  try {
    payload = (await req.json()) as SettingsBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name, timezone, whatsapp_number, sms_number, messaging_enabled')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!gym) return NextResponse.json({ error: 'No gym found for this user' }, { status: 404 })

  const updates: Record<string, unknown> = {}

  if (typeof payload.name === 'string') {
    const trimmed = payload.name.trim()
    if (trimmed.length < 2 || trimmed.length > 100) {
      return NextResponse.json({ error: 'Gym name must be 2–100 chars' }, { status: 400 })
    }
    updates.name = trimmed
  }

  if (typeof payload.timezone === 'string') {
    if (!TIMEZONES.has(payload.timezone)) {
      return NextResponse.json({ error: `Unsupported timezone "${payload.timezone}"` }, { status: 400 })
    }
    updates.timezone = payload.timezone
  }

  if ('whatsappNumber' in payload) {
    const val = payload.whatsappNumber === null ? null : (payload.whatsappNumber ?? '').toString().trim() || null
    if (val !== null && !E164.test(val)) {
      return NextResponse.json({ error: 'WhatsApp number must be E.164 (e.g. +447700900123)' }, { status: 400 })
    }
    updates.whatsapp_number = val
  }

  if ('smsNumber' in payload) {
    const val = payload.smsNumber === null ? null : (payload.smsNumber ?? '').toString().trim() || null
    if (val !== null && !E164.test(val)) {
      return NextResponse.json({ error: 'SMS number must be E.164 (e.g. +447700900123)' }, { status: 400 })
    }
    updates.sms_number = val
  }

  if (typeof payload.messagingEnabled === 'boolean') {
    if (payload.messagingEnabled === true) {
      // Block flip-to-live unless we have a sender and the global gate is on.
      const finalWhatsapp = 'whatsapp_number' in updates ? updates.whatsapp_number : gym.whatsapp_number
      const finalSms = 'sms_number' in updates ? updates.sms_number : gym.sms_number
      if (!finalWhatsapp && !finalSms) {
        return NextResponse.json(
          {
            error:
              'Add at least one sender (WhatsApp or SMS) before enabling live messaging.',
          },
          { status: 400 },
        )
      }
      if (process.env.MESSAGING_LIVE !== 'true') {
        return NextResponse.json(
          {
            error:
              'The global MESSAGING_LIVE flag is off. Until Paul flips it in Vercel env vars, every send stays in dry-run.',
          },
          { status: 409 },
        )
      }
    }
    updates.messaging_enabled = payload.messagingEnabled
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, noChanges: true })
  }

  updates.updated_at = new Date().toISOString()
  const { error } = await svc.from('gyms').update(updates).eq('id', gym.id)
  if (error) {
    console.error('[gym/settings] update failed:', error)
    return NextResponse.json({ error: 'Failed to update gym' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, updates })
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
