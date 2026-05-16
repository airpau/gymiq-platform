/**
 * POST /api/conversations/[id]/lost
 *
 * Marks the most recent in-progress cancel_save_attempt as lost (or creates
 * a synthetic one if none exists) and closes the conversation. We capture
 * the reason category so the dashboard can break down churn drivers.
 */
import { NextRequest, NextResponse } from 'next/server'
import { authoriseConversation } from '@/lib/conversations/auth'
import { CancelSaveEngine, type ReasonCategory } from '@/lib/services/cancel-save'

export const runtime = 'nodejs'

const VALID_REASONS: ReasonCategory[] = [
  'too_expensive',
  'not_using',
  'moving',
  'injury',
  'unhappy',
  'other',
]

interface LostBody {
  reasonCategory?: ReasonCategory
  note?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await authoriseConversation(id)
  if (!auth.ok) return auth.response
  const { svc, conversation, gym } = auth.ctx

  let body: LostBody = {}
  try {
    body = (await req.json()) as LostBody
  } catch {
    // body optional
  }

  const reasonCategory: ReasonCategory =
    body.reasonCategory && VALID_REASONS.includes(body.reasonCategory)
      ? body.reasonCategory
      : 'other'
  const note = (body.note ?? '').toString().slice(0, 500) || undefined

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
      // Update reason then resolve.
      await svc
        .from('cancel_save_attempts')
        .update({ reason_category: reasonCategory, reason: note ?? null })
        .eq('id', attempt.id)
      const engine = new CancelSaveEngine(svc)
      await engine.resolve(attempt.id, 'lost', 'closing', {
        offerType: 'none',
        offerDetails: note,
      })
    } else {
      await svc.from('cancel_save_attempts').insert({
        gym_id: gym.id,
        member_id: conversation.member_id,
        stage: 'closing',
        outcome: 'lost',
        reason_category: reasonCategory,
        reason: note ?? null,
        offer_made: 'none',
        offer_details: 'Marked lost manually from dashboard',
        resolved_at: new Date().toISOString(),
      })
    }

    // Mark the member as churned in our local mirror (the gym's CRM is
    // still the source of truth — they need to cancel the actual billing).
    await svc
      .from('members')
      .update({ status: 'churned' })
      .eq('id', conversation.member_id)
  }

  await svc
    .from('conversations')
    .update({ status: 'closed', last_message_at: new Date().toISOString() })
    .eq('id', conversation.id)

  return NextResponse.json({ ok: true, outcome: 'lost', reasonCategory })
}
