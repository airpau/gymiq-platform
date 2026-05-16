/**
 * Cancel-save engine.
 *
 * When a member replies to a retention sequence with cancellation intent (or
 * the upload audit flags them as deep-sleeper), the engine runs a 5-stage
 * conversation aimed at saving the membership:
 *
 *   1. Initiate           – empathetic acknowledgement
 *   2. Reason inquiry     – probe the reason category
 *   3. Offer              – propose a save offer matched to the reason
 *   4. Objection handling – address concerns, accept gracefully if needed
 *   5. Closing            – confirm outcome (saved / lost / escalated)
 *
 * State is stored in the Supabase `cancel_save_attempts` table (created in
 * the schema migration). Each call appends to `conversation_log` and updates
 * the `stage`, `outcome`, and `offer_*` fields.
 *
 * Twilio sending is OUT OF SCOPE for this module — callers wire the engine's
 * reply text into the TwilioService themselves. This keeps the engine pure
 * and unit-testable.
 */
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { classifyReply, type ClassifiedReply } from '../ai/reply-classifier'

const MODEL = 'claude-sonnet-4-20250514'
const RATE_PER_1K = { input: 0.003, output: 0.015 }

export type CancelSaveStage =
  | 'initiate'
  | 'reason_inquiry'
  | 'offer'
  | 'objection_handling'
  | 'closing'

export type CancelSaveOutcome = 'in_progress' | 'saved' | 'lost' | 'escalated'

export type OfferType =
  | 'freeze'
  | 'downgrade'
  | 'discount'
  | 'free_session'
  | 'pt_session'
  | 'none'

export type ReasonCategory =
  | 'too_expensive'
  | 'not_using'
  | 'moving'
  | 'injury'
  | 'unhappy'
  | 'other'

export interface CancelSaveTurnInput {
  attemptId: string
  /** The most recent member message. */
  memberMessage: string
  /** Member metadata to anchor the model. */
  member: {
    name?: string
    tenureMonths?: number
    planName?: string
    lastVisitDays?: number
    monthlyFee?: number
  }
}

export interface CancelSaveTurnOutput {
  reply: string
  stage: CancelSaveStage
  outcome: CancelSaveOutcome
  offerMade?: OfferType
  offerDetails?: string
  classifiedReply: ClassifiedReply
  costUsd: number
}

export interface AttemptRecord {
  id: string
  gym_id: string
  member_id: string
  stage: CancelSaveStage
  outcome: CancelSaveOutcome
  reason: string | null
  reason_category: ReasonCategory | null
  offer_made: OfferType | null
  offer_details: string | null
  conversation_log: Array<{ direction: 'inbound' | 'outbound'; content: string; at: string }>
}

export class CancelSaveEngine {
  constructor(private supabase: SupabaseClient) {}

  // ────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────

  /** Begin a new attempt. Returns the AI's opening reply. */
  async startAttempt(args: {
    gymId: string
    memberId: string
    triggerMessage: string
    member: CancelSaveTurnInput['member']
  }): Promise<{ attemptId: string; reply: string; costUsd: number }> {
    const { data: row, error } = await this.supabase
      .from('cancel_save_attempts')
      .insert({
        gym_id: args.gymId,
        member_id: args.memberId,
        stage: 'initiate',
        outcome: 'in_progress',
        conversation_log: [
          { direction: 'inbound', content: args.triggerMessage, at: new Date().toISOString() },
        ],
      })
      .select('id')
      .single()
    if (error || !row) throw new Error(`Failed to create cancel-save attempt: ${error?.message}`)

    const reply = await this.generate('initiate', args.triggerMessage, args.member, [])
    await this.appendOutbound(row.id, reply.text)
    return { attemptId: row.id, reply: reply.text, costUsd: reply.costUsd }
  }

  /** Continue an existing attempt with the member's next message. */
  async processTurn(input: CancelSaveTurnInput): Promise<CancelSaveTurnOutput> {
    const attempt = await this.loadAttempt(input.attemptId)
    if (!attempt) throw new Error(`Attempt ${input.attemptId} not found`)
    if (attempt.outcome !== 'in_progress') {
      throw new Error(`Attempt ${input.attemptId} already resolved as ${attempt.outcome}`)
    }

    // Classify the member's reply first — gives us category + outcome signal.
    const classified = await classifyReply(input.memberMessage, {
      history: attempt.conversation_log.map((m) => ({ direction: m.direction, content: m.content })),
      memberContext: input.member,
    })

    // Hard-route on definitive signals before spending Claude tokens.
    if (classified.outcome === 'mark_opt_out') {
      const reply = "Understood — you won't hear from me again. If you change your mind, just reply START."
      await this.appendInbound(input.attemptId, input.memberMessage)
      await this.appendOutbound(input.attemptId, reply)
      await this.resolve(input.attemptId, 'escalated', 'closing', {
        offerType: 'none',
        offerDetails: 'Opt-out received',
      })
      return {
        reply,
        stage: 'closing',
        outcome: 'escalated',
        classifiedReply: classified,
        costUsd: classified.costUsd,
      }
    }

    if (classified.outcome === 'escalate_to_human' && classified.confidence >= 0.7) {
      const reply = "I hear you. I'm passing this to a real teammate who'll come back to you within a working day."
      await this.appendInbound(input.attemptId, input.memberMessage)
      await this.appendOutbound(input.attemptId, reply)
      await this.resolve(input.attemptId, 'escalated', 'closing', {
        offerType: 'none',
        offerDetails: 'Human escalation',
      })
      return {
        reply,
        stage: 'closing',
        outcome: 'escalated',
        classifiedReply: classified,
        costUsd: classified.costUsd,
      }
    }

    // Decide which stage we're heading into based on the prior stage + signal.
    const nextStage = chooseNextStage(attempt.stage, classified)

    // Generate the reply.
    const gen = await this.generate(
      nextStage,
      input.memberMessage,
      input.member,
      attempt.conversation_log,
      classified,
    )

    // Persist the round-trip.
    await this.appendInbound(input.attemptId, input.memberMessage)
    await this.appendOutbound(input.attemptId, gen.text)
    await this.supabase
      .from('cancel_save_attempts')
      .update({
        stage: nextStage,
        reason_category: classified.category === 'cost' ? 'too_expensive' :
          classified.category === 'busy' ? 'not_using' :
          classified.category === 'problem' ? 'unhappy' :
          classified.category === 'leaving' ? 'other' : null,
      })
      .eq('id', input.attemptId)

    // Auto-resolve on definitive saved/lost signals.
    let outcome: CancelSaveOutcome = 'in_progress'
    if (classified.outcome === 'mark_saved' && classified.confidence >= 0.85) {
      outcome = 'saved'
      await this.resolve(input.attemptId, 'saved', 'closing', { offerType: gen.offerMade ?? 'none' })
    } else if (classified.outcome === 'mark_lost' && classified.confidence >= 0.85) {
      outcome = 'lost'
      await this.resolve(input.attemptId, 'lost', 'closing', { offerType: gen.offerMade ?? 'none' })
    }

    return {
      reply: gen.text,
      stage: nextStage,
      outcome,
      offerMade: gen.offerMade,
      offerDetails: gen.offerDetails,
      classifiedReply: classified,
      costUsd: classified.costUsd + gen.costUsd,
    }
  }

  /** Manually resolve an attempt (called from staff dashboard "marked as saved" etc.). */
  async resolve(
    attemptId: string,
    outcome: CancelSaveOutcome,
    stage: CancelSaveStage,
    opts: { offerType?: OfferType; offerDetails?: string } = {},
  ): Promise<void> {
    await this.supabase
      .from('cancel_save_attempts')
      .update({
        outcome,
        stage,
        offer_made: opts.offerType ?? null,
        offer_details: opts.offerDetails ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', attemptId)
  }

  async getStats(gymId: string, sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
    const { data, error } = await this.supabase
      .from('cancel_save_attempts')
      .select('outcome, reason_category, offer_made')
      .eq('gym_id', gymId)
      .gte('created_at', since)
    if (error) throw error
    const rows = data ?? []
    const total = rows.length
    const counts = { saved: 0, lost: 0, in_progress: 0, escalated: 0 } as Record<CancelSaveOutcome, number>
    for (const r of rows) counts[r.outcome as CancelSaveOutcome]++
    const saveRate = total > 0 ? counts.saved / (counts.saved + counts.lost || 1) : 0
    return { total, ...counts, saveRate }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────────

  private async loadAttempt(id: string): Promise<AttemptRecord | null> {
    const { data } = await this.supabase
      .from('cancel_save_attempts')
      .select('id, gym_id, member_id, stage, outcome, reason, reason_category, offer_made, offer_details, conversation_log')
      .eq('id', id)
      .maybeSingle()
    return (data as AttemptRecord | null) ?? null
  }

  private async appendInbound(attemptId: string, content: string) {
    await this.appendToLog(attemptId, { direction: 'inbound', content, at: new Date().toISOString() })
  }

  private async appendOutbound(attemptId: string, content: string) {
    await this.appendToLog(attemptId, { direction: 'outbound', content, at: new Date().toISOString() })
  }

  private async appendToLog(
    attemptId: string,
    entry: { direction: 'inbound' | 'outbound'; content: string; at: string },
  ) {
    // Append-to-JSONB pattern: read, modify, write. Cheap for ≤20 turns.
    const { data } = await this.supabase
      .from('cancel_save_attempts')
      .select('conversation_log')
      .eq('id', attemptId)
      .single()
    const log = ((data?.conversation_log as AttemptRecord['conversation_log']) ?? []).concat(entry)
    await this.supabase.from('cancel_save_attempts').update({ conversation_log: log }).eq('id', attemptId)
  }

  private async generate(
    stage: CancelSaveStage,
    memberMessage: string,
    member: CancelSaveTurnInput['member'],
    history: AttemptRecord['conversation_log'],
    classified?: ClassifiedReply,
  ): Promise<{ text: string; costUsd: number; offerMade?: OfferType; offerDetails?: string }> {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const systemPrompt = buildSystemPrompt(stage, member, classified)
    const userPrompt = buildUserPrompt(memberMessage, history)

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      temperature: 0.6,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    let content = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

    type Parsed = { reply: string; offerType?: OfferType; offerDetails?: string }
    let parsed: Parsed = { reply: '' }
    try {
      parsed = JSON.parse(content) as Parsed
    } catch {
      parsed = { reply: content }
    }

    const cost =
      ((response.usage?.input_tokens ?? 0) / 1000) * RATE_PER_1K.input +
      ((response.usage?.output_tokens ?? 0) / 1000) * RATE_PER_1K.output

    return {
      text: parsed.reply || 'Thanks for replying — let me check what I can do and come back to you.',
      offerMade: parsed.offerType,
      offerDetails: parsed.offerDetails,
      costUsd: cost,
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function chooseNextStage(current: CancelSaveStage, classified: ClassifiedReply): CancelSaveStage {
  if (current === 'initiate') return 'reason_inquiry'
  if (current === 'reason_inquiry') return 'offer'
  if (current === 'offer') return 'objection_handling'
  if (current === 'objection_handling') return 'closing'
  return 'closing'
}

function buildSystemPrompt(
  stage: CancelSaveStage,
  member: CancelSaveTurnInput['member'],
  classified?: ClassifiedReply,
): string {
  const memberContext = [
    member.name && `Name: ${member.name}`,
    member.tenureMonths !== undefined && `Tenure: ${member.tenureMonths} months`,
    member.planName && `Plan: ${member.planName}`,
    member.lastVisitDays !== undefined && `Last visit: ${member.lastVisitDays} days ago`,
    member.monthlyFee !== undefined && `Monthly fee: £${member.monthlyFee}`,
  ].filter(Boolean).join('\n')

  const stageInstructions: Record<CancelSaveStage, string> = {
    initiate: `STAGE: INITIATE. Open warmly, acknowledge the member by name, mention that you noticed they're thinking about leaving (or haven't visited recently — adjust to what triggered the conversation), and ask one open-ended question about what's going on. Do NOT pitch anything yet.`,
    reason_inquiry: `STAGE: REASON INQUIRY. Reflect back what they said in one sentence. Ask one short follow-up to clarify which reason category fits (cost, busy/not using, injury, unhappy, moving, other). Don't offer anything yet.`,
    offer: `STAGE: OFFER. Based on the reason category, propose ONE specific option. Most independent gyms do NOT want to offer discounts — they erode price integrity and set a precedent. The default offer ladder is:

- cost / too_expensive → offer_downgrade FIRST (a cheaper tier or off-peak plan if the gym has one). Only fall back to offer_discount if the gym has no cheaper tier OR they decline downgrade and the member is clearly going to leave otherwise. Never lead with a discount.
- busy / not_using → offer_freeze (1–3 month pause). Acknowledge upfront that saying no is fine — don't push them.
- injury / health → offer_freeze framed around recovery. Mention you'll keep their spot, no charge, until they're ready. Optionally mention rehab-friendly classes if relevant.
- unhappy / complaint → route_to_staff. Do NOT try to fix the complaint yourself. Acknowledge their frustration and tell them a real person from the team will be in touch within a working day.
- moving → ask if a freeze + reactivation discount when they return would be useful (some "movers" are short trips, some are permanent). If they say it's permanent, accept gracefully and offer_freeze=none with offerDetails="confirmed permanent move".
- other / unclear → ask one more probing question to figure out the real reason. Don't offer yet.

Include offerType and a short offerDetails string in your JSON response.`,
    objection_handling: `STAGE: OBJECTION HANDLING. Acknowledge the objection in one sentence — "fair enough", "I hear you", etc. Then EITHER soften the offer slightly (e.g. if freeze was declined as too short, offer the longer option once) OR accept the cancellation gracefully. Never push more than once. If they push back twice, accept the outcome — pushing harder destroys the relationship and means they won't come back later either.`,
    closing: `STAGE: CLOSING. Confirm the outcome clearly and warmly. If saved: confirm exactly what's happening next ("I'll process the freeze tonight, you'll get a confirmation email"). If lost: thank them for their time, leave the door open ("anytime you want to come back, we're here"), don't push. Brief and human.`,
  }

  return `You are an empathetic retention specialist for a UK independent gym. Tone:
warm, human, never salesy. Keep replies under 60 words. Use 'we' and 'us' for the
gym, and address the member by their first name when natural.

CRITICAL RULES:
- Never invent gym facts you weren't told.
- Never quote prices except for the offer you're being asked to make.
- If the member is angry, threatening, or has a billing dispute → escalate.
- If the member explicitly says STOP, never message them again.

MEMBER CONTEXT:
${memberContext || '(no profile data available)'}

${classified ? `LATEST REPLY CLASSIFIED AS: ${classified.category} (confidence ${classified.confidence.toFixed(2)}) — ${classified.rationale}` : ''}

${stageInstructions[stage]}

Return STRICT JSON ONLY:
{
  "reply": "the message text to send to the member",
  "offerType": "freeze | downgrade | discount | free_session | pt_session | none",
  "offerDetails": "short human-readable description, or null"
}`
}

function buildUserPrompt(memberMessage: string, history: AttemptRecord['conversation_log']): string {
  let prompt = ''
  if (history.length > 0) {
    prompt += `CONVERSATION SO FAR:\n`
    for (const m of history.slice(-8)) {
      prompt += `${m.direction === 'inbound' ? 'MEMBER' : 'AGENT'}: ${m.content}\n`
    }
  }
  prompt += `\nLATEST MEMBER MESSAGE:\n"${memberMessage.trim()}"\n\nRespond with JSON only.`
  return prompt
}
