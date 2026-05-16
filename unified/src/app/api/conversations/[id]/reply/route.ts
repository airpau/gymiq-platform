/**
 * POST /api/conversations/[id]/reply
 *
 * Sends a manual reply on this conversation. Goes through the TwilioService
 * so the dry-run / opt-out / live-mode safety rails still apply — but we
 * bypass quiet hours because a human is sending this and they're already
 * mid-thread.
 *
 * If messaging is disabled for the gym (or MESSAGING_LIVE is off globally)
 * we log the reply with a [DRY-RUN] prefix so staff still see it threaded.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authoriseConversation } from '@/lib/conversations/auth'
import { TwilioService } from '@/lib/messaging/twilio'

export const runtime = 'nodejs'
export const maxDuration = 30

interface ReplyBody {
  body?: string
}

const MAX_LEN = 1500

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await authoriseConversation(id)
  if (!auth.ok) return auth.response
  const { svc, conversation, gym } = auth.ctx

  let payload: ReplyBody = {}
  try {
    payload = (await req.json()) as ReplyBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = (payload.body ?? '').toString().trim()
  if (text.length < 2) {
    return NextResponse.json({ error: 'Reply body is too short' }, { status: 400 })
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `Reply must be ≤${MAX_LEN} characters` }, { status: 400 })
  }

  const channel: 'whatsapp' | 'sms' = conversation.channel === 'sms' ? 'sms' : 'whatsapp'
  const twilio = new TwilioService()
  let twilioSid: string | null = null
  let logBody = text
  let result: 'sent' | 'dry_run' | 'skipped' = 'dry_run'
  let skipReason: string | undefined

  if (gym.messaging_enabled) {
    const send = await twilio.send({
      to: conversation.phone,
      body: text,
      channel,
      from:
        channel === 'whatsapp'
          ? gym.whatsapp_number ?? undefined
          : gym.sms_number ?? undefined,
      timezone: gym.timezone,
      supabase: svc,
      bypassQuietHours: true,
    })
    if ('sid' in send && send.ok) {
      twilioSid = send.sid
      result = 'sent'
    } else if ('dryRun' in send && send.ok && send.dryRun) {
      logBody = `[DRY-RUN] ${text}`
      result = 'dry_run'
    } else if (!send.ok && 'skipped' in send) {
      result = 'skipped'
      skipReason = send.reason
      return NextResponse.json(
        { error: `Cannot send: ${send.reason}`, skipped: send.skipped },
        { status: 409 },
      )
    } else if (!send.ok && 'error' in send) {
      return NextResponse.json({ error: send.error }, { status: 502 })
    }
  } else {
    logBody = `[DRY-RUN] ${text}`
  }

  await svc.from('messages').insert({
    conversation_id: conversation.id,
    direction: 'outbound',
    content: logBody,
    channel,
    twilio_sid: twilioSid,
    sent_at: result === 'sent' ? new Date().toISOString() : null,
  })

  await svc
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id)

  return NextResponse.json({ ok: true, result, skipReason })
}
