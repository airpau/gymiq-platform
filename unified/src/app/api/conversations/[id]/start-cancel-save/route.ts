/**
 * POST /api/conversations/[id]/start-cancel-save
 *
 * Manually starts a cancel-save attempt from the dashboard. This is the
 * "the member emailed us / phoned us to cancel" path — staff click this to
 * fire the empathetic opening message, then the engine takes over from
 * subsequent replies via the Twilio webhook.
 *
 * The trigger message is synthetic: we use the conversation's most recent
 * inbound message body, or a generic seed if there isn't one yet.
 */
import { NextResponse } from 'next/server'
import { authoriseConversation } from '@/lib/conversations/auth'
import { CancelSaveEngine } from '@/lib/services/cancel-save'
import { TwilioService } from '@/lib/messaging/twilio'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await authoriseConversation(id)
  if (!auth.ok) return auth.response
  const { svc, conversation, gym } = auth.ctx

  if (!conversation.member_id) {
    return NextResponse.json(
      { error: 'Cancel-save requires a linked member record' },
      { status: 400 },
    )
  }

  // Refuse if an attempt is already in progress for this member.
  const { data: existing } = await svc
    .from('cancel_save_attempts')
    .select('id, outcome')
    .eq('gym_id', gym.id)
    .eq('member_id', conversation.member_id)
    .eq('outcome', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { error: 'A cancel-save attempt is already in progress for this member', attemptId: existing.id },
      { status: 409 },
    )
  }

  // Load member context for the engine.
  const { data: member } = await svc
    .from('members')
    .select('name, plan_name, monthly_fee, join_date, last_visit')
    .eq('id', conversation.member_id)
    .maybeSingle()

  const tenureMonths = member?.join_date
    ? Math.max(0, Math.round((Date.now() - new Date(member.join_date).getTime()) / (30 * 86_400_000)))
    : undefined
  const lastVisitDays = member?.last_visit
    ? Math.floor((Date.now() - new Date(member.last_visit).getTime()) / 86_400_000)
    : undefined

  // Pick the trigger — most recent inbound, else a generic seed.
  const { data: lastInbound } = await svc
    .from('messages')
    .select('content')
    .eq('conversation_id', conversation.id)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const triggerMessage =
    lastInbound?.content ?? 'Member has signalled they want to cancel their membership.'

  const engine = new CancelSaveEngine(svc)
  const started = await engine.startAttempt({
    gymId: gym.id,
    memberId: conversation.member_id,
    triggerMessage,
    member: {
      name: member?.name,
      planName: member?.plan_name ?? undefined,
      monthlyFee: member?.monthly_fee ?? undefined,
      tenureMonths,
      lastVisitDays,
    },
  })

  // Send the opening message back via Twilio (or log as dry-run).
  const channel: 'whatsapp' | 'sms' = conversation.channel === 'sms' ? 'sms' : 'whatsapp'
  const twilio = new TwilioService()
  if (gym.messaging_enabled) {
    const sendResult = await twilio.send({
      to: conversation.phone,
      body: started.reply,
      channel,
      from:
        channel === 'whatsapp'
          ? gym.whatsapp_number ?? undefined
          : gym.sms_number ?? undefined,
      timezone: gym.timezone,
      supabase: svc,
      bypassQuietHours: true,
    })
    const sid = 'sid' in sendResult && sendResult.ok ? sendResult.sid : null
    await svc.from('messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      content: started.reply,
      channel,
      twilio_sid: sid,
      sent_at: new Date().toISOString(),
    })
  } else {
    await svc.from('messages').insert({
      conversation_id: conversation.id,
      direction: 'outbound',
      content: `[DRY-RUN] ${started.reply}`,
      channel,
      twilio_sid: null,
    })
  }

  await svc
    .from('conversations')
    .update({ status: 'active', last_message_at: new Date().toISOString() })
    .eq('id', conversation.id)

  return NextResponse.json({ ok: true, attemptId: started.attemptId })
}
