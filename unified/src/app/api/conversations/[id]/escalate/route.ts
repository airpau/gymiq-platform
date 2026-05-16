/**
 * POST /api/conversations/[id]/escalate
 *
 * Flips the conversation status to 'waiting_human' so it surfaces in the
 * staff queue. We don't touch the cancel-save attempt — a human can still
 * mark it saved or lost afterwards.
 */
import { NextResponse } from 'next/server'
import { authoriseConversation } from '@/lib/conversations/auth'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await authoriseConversation(id)
  if (!auth.ok) return auth.response
  const { svc, conversation } = auth.ctx

  await svc
    .from('conversations')
    .update({ status: 'waiting_human' })
    .eq('id', conversation.id)

  return NextResponse.json({ ok: true, status: 'waiting_human' })
}
