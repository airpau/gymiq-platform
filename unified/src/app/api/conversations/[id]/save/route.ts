/**
 * POST /api/conversations/[id]/save
 *
 * Marks the most recent in-progress cancel_save_attempt as saved (or creates
 * a synthetic one if none exists) and closes the conversation. The staff
 * member tells us which offer landed — we record it so we can report on
 * which offers actually save members.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authoriseConversation } from '@/lib/conversations/auth'
import { CancelSaveEngine, type OfferType } from '@/lib/services/cancel-save'

export const runtime = 'nodejs'

const VALID_OFFERS: OfferType[] = ['freeze', 'downgrade', 'discount', 'free_session', 'pt_session', 'none']

interface SaveBody {
  offerType?: OfferType
  offerDetails?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await authoriseConversation(id)
  if (!auth.ok) return auth.response
  const { svc, conversation, gym } = auth.ctx

  let body: SaveBody = {}
  try {
    body = (await req.json()) as SaveBody
  } catch {
    // Body is optional — defaults to offerType=none.
  }

  const offerType: OfferType =
    body.offerType && VALID_OFFERS.includes(body.offerType) ? body.offerType : 'none'
  const offerDetails = (body.offerDetails ?? '').toString().slice(0, 500) || undefined

  // Resolve any existing in-progress attempt for this member.
  if (conversation.member_id) {
    const { data: attempt } = await svc
      .from('cancel_save_attempts')
      .select('id')
      .eq('gym_id', gym.id)
      .eq('member_id', conversation.member_id)
      .eq('outcome', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (attempt?.id) {
      const engine = new CancelSaveEngine(svc)
      await engine.resolve(attempt.id, 'saved', 'closing', { offerType, offerDetails })
    } else {
      // No attempt yet — record a "manual save" so it shows up in reporting.
      await svc.from('cancel_save_attempts').insert({
        gym_id: gym.id,
        member_id: conversation.member_id,
        stage: 'closing',
        outcome: 'saved',
        offer_made: offerType,
        offer_details: offerDetails ?? 'Marked saved manually from dashboard',
        resolved_at: new Date().toISOString(),
      })
    }
  }

  // Close the conversation.
  await svc
    .from('conversations')
    .update({ status: 'closed', last_message_at: new Date().toISOString() })
    .eq('id', conversation.id)

  return NextResponse.json({ ok: true, outcome: 'saved', offerType })
}
