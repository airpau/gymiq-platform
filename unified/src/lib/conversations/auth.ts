/**
 * Shared auth + scoping helper for the conversation-action API routes.
 *
 * Every staff-driven conversation action (mark saved, mark lost, escalate,
 * start cancel-save, manual reply) follows the same preamble:
 *
 *   1. Verify the request is from a logged-in Supabase user.
 *   2. Look up that user's gym.
 *   3. Verify the conversation belongs to that gym.
 *
 * Centralising it means a fix in one place applies to every route, and the
 * route handlers can focus on the actual action.
 */
import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export interface AuthorisedConversation {
  svc: SupabaseClient
  userId: string
  gym: {
    id: string
    name: string
    timezone: string
    messaging_enabled: boolean
    whatsapp_number: string | null
    sms_number: string | null
  }
  conversation: {
    id: string
    gym_id: string
    member_id: string | null
    phone: string
    channel: string
    status: string
  }
}

export type AuthorisedResult =
  | { ok: true; ctx: AuthorisedConversation }
  | { ok: false; response: NextResponse }

export async function authoriseConversation(
  conversationId: string,
): Promise<AuthorisedResult> {
  if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 }),
    }
  }

  const ssr = await createServerClient()
  const { data: authData } = await ssr.auth.getUser()
  const user = authData?.user
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }
  }

  const svc = serviceClient()
  if (!svc) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Storage not configured' }, { status: 500 }),
    }
  }

  const { data: gym } = await svc
    .from('gyms')
    .select('id, name, timezone, messaging_enabled, whatsapp_number, sms_number')
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!gym) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No gym found for this user' }, { status: 403 }),
    }
  }

  const { data: conversation } = await svc
    .from('conversations')
    .select('id, gym_id, member_id, phone, channel, status')
    .eq('id', conversationId)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (!conversation) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Conversation not found' }, { status: 404 }),
    }
  }

  return {
    ok: true,
    ctx: { svc, userId: user.id, gym, conversation },
  }
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
