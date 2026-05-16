/**
 * POST /api/webhooks/twilio
 *
 * Twilio hits this URL for every inbound message on any of our numbers
 * (WhatsApp or SMS). The flow:
 *
 *   1. Verify the Twilio signature so randos can't drop fake replies into
 *      the system.
 *   2. Parse the form-urlencoded payload (From, To, Body, etc.).
 *   3. Honour STOP/START opt-out keywords before doing anything else.
 *   4. Find the member this phone belongs to and the conversation we're
 *      threading on. Auto-create the conversation if it doesn't exist.
 *   5. Persist the inbound message.
 *   6. Classify the reply (busy / cost / problem / leaving / positive /
 *      opt_out / other).
 *   7. Halt the member's pending sequence_runs so the cron stops messaging
 *      them while we're in a conversation.
 *   8. Route by classification:
 *        - cancellation intent → start (or continue) a cancel_save_attempt
 *          and send the engine's reply back via Twilio.
 *        - positive (coming in / staying) → mark sequence_runs as 'saved'.
 *        - opt_out → already handled in step 3.
 *        - escalate → flag conversation as waiting_human.
 *        - otherwise → leave it. A human can intervene from the dashboard.
 *   9. Respond to Twilio with empty TwiML — we send any reply via the
 *      outbound API, not via the webhook response, so we can log it.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { TwilioService } from '@/lib/messaging/twilio'
import { classifyReply, type ClassifiedReply } from '@/lib/ai/reply-classifier'
import { CancelSaveEngine } from '@/lib/services/cancel-save'

export const runtime = 'nodejs'
export const maxDuration = 30

const TWIML_OK = `<?xml version="1.0" encoding="UTF-8"?><Response/>`

export async function POST(req: NextRequest) {
  // Twilio webhooks are form-urlencoded.
  const raw = await req.text()
  const params = new URLSearchParams(raw)
  const body = Object.fromEntries(params.entries())

  // ─── 1. Signature check ─────────────────────────────────────────────────
  const twilio = new TwilioService()
  const sig = req.headers.get('x-twilio-signature') ?? ''
  const url = new URL(req.url)
  // Use forwarded host so Vercel's internal forwarding doesn't break the sig.
  const externalUrl = `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('host') ?? url.host}${url.pathname}`
  if (process.env.NODE_ENV === 'production' && !twilio.validateWebhook(externalUrl, body, sig)) {
    console.warn('[twilio webhook] bad signature, refusing')
    return new NextResponse('Forbidden', { status: 403 })
  }

  const fromRaw = (body.From ?? '').toString()
  const toRaw = (body.To ?? '').toString()
  const messageBody = (body.Body ?? '').toString().trim()
  const messageSid = (body.MessageSid ?? body.SmsMessageSid ?? '').toString()

  if (!fromRaw || !messageBody) {
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }

  const channel: 'whatsapp' | 'sms' = fromRaw.startsWith('whatsapp:') ? 'whatsapp' : 'sms'
  const fromPhone = fromRaw.replace(/^whatsapp:/i, '').trim()
  const toPhone = toRaw.replace(/^whatsapp:/i, '').trim()

  const supabase = serviceClient()
  if (!supabase) {
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }

  // ─── 2. Opt-out fast path ──────────────────────────────────────────────
  const optKeyword = await twilio.handleInboundOptOut(fromPhone, messageBody, supabase)
  if (optKeyword === 'stop') {
    await haltAllRunsForPhone(supabase, fromPhone, 'opted_out')
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }

  // ─── 3. Find the member + gym this number belongs to ───────────────────
  // Match by phone within any gym. If a phone is shared across gyms we use
  // the most-recently-active conversation.
  const target = await resolveMemberByPhone(supabase, fromPhone, toPhone)
  if (!target) {
    console.warn('[twilio webhook] inbound from unknown number', fromPhone)
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }
  const { gymId, memberId, member, gym } = target

  // ─── 4. Find or create the conversation ────────────────────────────────
  const conversationId = await findOrCreateConversation(supabase, {
    gymId,
    memberId,
    phone: fromPhone,
    channel,
  })

  // ─── 5. Persist the inbound message ────────────────────────────────────
  const { data: inboundRow } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      direction: 'inbound',
      content: messageBody,
      channel,
      twilio_sid: messageSid || null,
    })
    .select('id')
    .single()

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // ─── 6. Classify the reply ─────────────────────────────────────────────
  const recentMessages = await fetchRecentConversation(supabase, conversationId, 8)
  let classified: ClassifiedReply
  try {
    classified = await classifyReply(messageBody, {
      history: recentMessages,
      memberContext: {
        planName: member.plan_name ?? undefined,
        lastVisitDays: member.last_visit
          ? Math.floor((Date.now() - new Date(member.last_visit).getTime()) / 86_400_000)
          : undefined,
      },
    })
  } catch (err) {
    console.error('[twilio webhook] classify failed:', err)
    classified = {
      category: 'other',
      outcome: 'continue',
      confidence: 0,
      rationale: 'classifier error',
      suggestedAction: 'no_action',
      costUsd: 0,
    }
  }

  if (inboundRow?.id) {
    await supabase
      .from('messages')
      .update({
        reply_category: classified.category,
        reply_confidence: classified.confidence,
        reply_rationale: classified.rationale,
        ai_model: 'gpt-4o-mini',
        ai_cost_usd: classified.costUsd,
      })
      .eq('id', inboundRow.id)
  }

  // ─── 7. Always halt pending sequence_runs for this member ─────────────
  // We don't want the cron to keep messaging while we're in a conversation.
  await markRunsReplied(supabase, memberId, classified.outcome)

  // ─── 8. Route based on outcome ─────────────────────────────────────────

  // Already handled opt-out above. If classifier suggests opt-out (e.g.
  // member wrote "leave me alone" rather than a literal STOP), honour it.
  if (classified.outcome === 'mark_opt_out') {
    await supabase
      .from('messaging_optouts')
      .upsert({ phone: fromPhone, opted_out_at: new Date().toISOString(), reason: 'inferred_from_reply' })
    await haltAllRunsForPhone(supabase, fromPhone, 'opted_out')
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }

  if (classified.outcome === 'escalate_to_human') {
    await supabase
      .from('conversations')
      .update({ status: 'waiting_human' })
      .eq('id', conversationId)
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }

  if (classified.outcome === 'mark_saved') {
    // Positive reply (member's coming in / staying). No further AI reply.
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }

  // Cancellation intent → engage the cancel-save engine.
  // Also engage for cost/problem/busy categories even without a hard "leaving"
  // signal, because those are exactly the saveable conversations.
  const shouldEngage =
    classified.outcome === 'mark_lost' ||
    (['cost', 'problem', 'busy', 'leaving'].includes(classified.category) && classified.confidence >= 0.6)

  if (!shouldEngage) {
    // 'continue' / 'positive' / 'other' — leave it. Staff can pick it up
    // in the dashboard if they want to reply manually.
    return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
  }

  // ─── 9. Hand off to cancel-save engine ────────────────────────────────
  const engine = new CancelSaveEngine(supabase)
  let engineReply: string | null = null
  try {
    const existing = await findInProgressAttempt(supabase, memberId)
    if (existing) {
      const turn = await engine.processTurn({
        attemptId: existing,
        memberMessage: messageBody,
        member: {
          name: member.name,
          planName: member.plan_name ?? undefined,
          monthlyFee: member.monthly_fee ?? undefined,
          tenureMonths: member.tenure_months ?? undefined,
          lastVisitDays: member.last_visit_days ?? undefined,
        },
      })
      engineReply = turn.reply
    } else {
      const started = await engine.startAttempt({
        gymId,
        memberId,
        triggerMessage: messageBody,
        member: {
          name: member.name,
          planName: member.plan_name ?? undefined,
          monthlyFee: member.monthly_fee ?? undefined,
          tenureMonths: member.tenure_months ?? undefined,
          lastVisitDays: member.last_visit_days ?? undefined,
        },
      })
      engineReply = started.reply
    }
  } catch (err) {
    console.error('[twilio webhook] cancel-save engine failed:', err)
  }

  // ─── 10. Send the engine's reply back via Twilio ──────────────────────
  if (engineReply && gym.messaging_enabled) {
    const sendResult = await twilio.send({
      to: fromPhone,
      body: engineReply,
      channel,
      from:
        channel === 'whatsapp'
          ? gym.whatsapp_number ?? undefined
          : gym.sms_number ?? undefined,
      timezone: gym.timezone,
      supabase,
      // Cancel-save replies should bypass quiet hours — they're already
      // mid-conversation. Member messaged us, we should reply now.
      bypassQuietHours: true,
    })
    const sid = 'sid' in sendResult && sendResult.ok ? sendResult.sid : null
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content: engineReply,
      channel,
      twilio_sid: sid,
      sent_at: new Date().toISOString(),
    })
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)
  } else if (engineReply) {
    // Dry-run / messaging disabled: log the reply we would have sent so
    // staff can see it in the dashboard.
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content: `[DRY-RUN] ${engineReply}`,
      channel,
      twilio_sid: null,
    })
  }

  return new NextResponse(TWIML_OK, { headers: { 'content-type': 'application/xml' } })
}

// ─── helpers ────────────────────────────────────────────────────────────

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

interface ResolvedTarget {
  gymId: string
  memberId: string
  member: {
    id: string
    name: string
    plan_name: string | null
    monthly_fee: number | null
    last_visit: string | null
    tenure_months: number | undefined
    last_visit_days: number | undefined
  }
  gym: {
    id: string
    name: string
    timezone: string
    whatsapp_number: string | null
    sms_number: string | null
    messaging_enabled: boolean
  }
}

async function resolveMemberByPhone(
  supabase: SupabaseClient,
  fromPhone: string,
  toPhone: string,
): Promise<ResolvedTarget | null> {
  // Strategy: find any member whose phone matches, ranked by most-recent
  // conversation. We also try the `to` number — that should match either
  // the gym's whatsapp_number or sms_number, narrowing the gym.

  // Try matching by gym's inbound number first (more specific).
  let gymCandidates: Array<{
    id: string
    name: string
    timezone: string
    whatsapp_number: string | null
    sms_number: string | null
    messaging_enabled: boolean
  }> = []
  if (toPhone) {
    const { data } = await supabase
      .from('gyms')
      .select('id, name, timezone, whatsapp_number, sms_number, messaging_enabled')
      .or(`whatsapp_number.eq.${toPhone},sms_number.eq.${toPhone}`)
    gymCandidates = data ?? []
  }

  // Find the member by phone (fuzzy — strip non-digits).
  const digits = fromPhone.replace(/\D/g, '')
  const variants = [fromPhone, `+${digits}`, digits]
  const { data: members } = await supabase
    .from('members')
    .select('id, gym_id, name, phone, plan_name, monthly_fee, last_visit, join_date')
    .in('phone', variants)
    .limit(10)

  if (!members || members.length === 0) return null

  // Pick the member whose gym matches the inbound number (if we resolved any).
  const matched = gymCandidates.length > 0
    ? members.find((m) => gymCandidates.some((g) => g.id === m.gym_id))
    : null

  const member = matched ?? members[0]

  // Fetch the gym if we don't have it.
  let gym = gymCandidates.find((g) => g.id === member.gym_id)
  if (!gym) {
    const { data: g } = await supabase
      .from('gyms')
      .select('id, name, timezone, whatsapp_number, sms_number, messaging_enabled')
      .eq('id', member.gym_id)
      .maybeSingle()
    if (!g) return null
    gym = g
  }

  const tenureMonths = member.join_date
    ? Math.max(0, Math.floor((Date.now() - new Date(member.join_date).getTime()) / (30 * 86_400_000)))
    : undefined
  const lastVisitDays = member.last_visit
    ? Math.floor((Date.now() - new Date(member.last_visit).getTime()) / 86_400_000)
    : undefined

  return {
    gymId: member.gym_id,
    memberId: member.id,
    member: {
      id: member.id,
      name: member.name,
      plan_name: member.plan_name,
      monthly_fee: member.monthly_fee,
      last_visit: member.last_visit,
      tenure_months: tenureMonths,
      last_visit_days: lastVisitDays,
    },
    gym,
  }
}

async function findOrCreateConversation(
  supabase: SupabaseClient,
  args: { gymId: string; memberId: string; phone: string; channel: 'whatsapp' | 'sms' },
): Promise<string> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('gym_id', args.gymId)
    .eq('phone', args.phone)
    .maybeSingle()
  if (existing) return existing.id
  const { data: created } = await supabase
    .from('conversations')
    .insert({
      gym_id: args.gymId,
      member_id: args.memberId,
      phone: args.phone,
      channel: args.channel,
      status: 'active',
    })
    .select('id')
    .single()
  return created!.id
}

async function fetchRecentConversation(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number,
): Promise<Array<{ direction: 'inbound' | 'outbound'; content: string }>> {
  const { data } = await supabase
    .from('messages')
    .select('direction, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = (data ?? []) as Array<{ direction: 'inbound' | 'outbound'; content: string }>
  return rows.reverse() // oldest first for the model
}

async function markRunsReplied(
  supabase: SupabaseClient,
  memberId: string,
  outcome: ClassifiedReply['outcome'],
): Promise<void> {
  // Map the classifier's outcome to a sequence_runs.status value.
  const newStatus =
    outcome === 'mark_saved' ? 'replied'
    : outcome === 'mark_lost' ? 'replied'
    : outcome === 'mark_opt_out' ? 'opted_out'
    : 'replied'

  const replyCategoryNull = outcome // we'll let the column carry the outcome for now
  await supabase
    .from('sequence_runs')
    .update({
      status: newStatus,
      replied_at: new Date().toISOString(),
      reply_category: replyCategoryNull,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('status', 'pending')
}

async function haltAllRunsForPhone(
  supabase: SupabaseClient,
  phone: string,
  status: 'opted_out' | 'replied',
): Promise<void> {
  // Find every member who shares this phone (rare but possible across gyms)
  // and halt their pending runs.
  const digits = phone.replace(/\D/g, '')
  const { data: members } = await supabase
    .from('members')
    .select('id')
    .in('phone', [phone, `+${digits}`, digits])
  const ids = (members ?? []).map((m) => m.id)
  if (ids.length === 0) return
  await supabase
    .from('sequence_runs')
    .update({ status, updated_at: new Date().toISOString() })
    .in('member_id', ids)
    .eq('status', 'pending')
}

async function findInProgressAttempt(
  supabase: SupabaseClient,
  memberId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('cancel_save_attempts')
    .select('id')
    .eq('member_id', memberId)
    .eq('outcome', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
