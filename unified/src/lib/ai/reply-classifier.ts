/**
 * Retention-reply classifier.
 *
 * Takes an inbound message from a member who's been contacted by the retention
 * agent, and classifies their reply into one of the cancel-save reason buckets
 * plus a "saved" / "lost" / "still_engaging" outcome signal.
 *
 * This is the narrow MVP version aligned to Paul's brief:
 *   busy / cost / problem / leaving / other
 *
 * The fuller 12-intent classifier from the legacy monorepo lived in
 * apps/api/src/services/intent-classifier.ts. It's preserved on the
 * legacy-monorepo branch if/when we expand to inbound receptionist scope.
 */
import OpenAI from 'openai'

export type ReplyCategory =
  | 'busy' // life got in the way, will return
  | 'cost' // price-sensitive — open to downgrade or freeze
  | 'problem' // specific complaint to resolve
  | 'leaving' // hard cancel intent — escalate to save flow
  | 'positive' // engaging, planning to come in
  | 'opt_out' // STOP / don't message me
  | 'other'

export type ReplyOutcomeSignal =
  | 'continue' // keep the conversation going, possibly offer a save
  | 'escalate_to_human' // angry / complex — human takes over
  | 'mark_saved' // member explicitly says they'll stay
  | 'mark_lost' // member explicitly cancels
  | 'mark_opt_out' // member asked to be removed

export interface ClassifiedReply {
  category: ReplyCategory
  outcome: ReplyOutcomeSignal
  /** 0..1 — only act on `category` if confidence ≥ 0.7. */
  confidence: number
  /** A short, model-supplied reason for the classification (for audit). */
  rationale: string
  /** A suggested next-action label. Just a hint — the save engine decides. */
  suggestedAction:
    | 'offer_freeze'
    | 'offer_downgrade'
    | 'offer_discount'
    | 'route_to_staff'
    | 'send_reassuring_followup'
    | 'accept_cancellation'
    | 'no_action'
  /** Estimated cost in USD for this classification call. */
  costUsd: number
}

const SYSTEM_PROMPT = `You classify replies from gym members who were contacted by an
AI retention agent. The agent reached out because the member hasn't visited in 21+
days. Your job is to read the member's reply and decide:

1. Which **category** best describes the reply.
2. Which **outcome signal** the system should record.
3. A **suggested next action**.

Categories (pick exactly one):
- busy: Life got in the way (work, illness, family). Member is open in principle.
- cost: Price-sensitive. Money is the obstacle.
- problem: Specific complaint about the gym (equipment, staff, cleanliness).
- leaving: Member explicitly wants to cancel or has already decided to leave.
- positive: Member is engaging warmly, plans to visit, or already came back.
- opt_out: Member uses STOP / UNSUBSCRIBE / "don't message me" / similar wording.
- other: Genuinely unclear or off-topic.

Outcome signals:
- continue: keep the retention conversation going.
- escalate_to_human: anger, legal threats, billing dispute, repeat complaint.
- mark_saved: member explicitly says they're staying or will visit soon.
- mark_lost: member explicitly says they're cancelling and will not return.
- mark_opt_out: STOP keyword or equivalent.

Suggested actions:
- offer_freeze, offer_downgrade, offer_discount,
  route_to_staff, send_reassuring_followup,
  accept_cancellation, no_action.

Return STRICT JSON ONLY (no markdown fence, no extra commentary):
{
  "category": "...",
  "outcome": "...",
  "confidence": 0.0,
  "rationale": "one short sentence",
  "suggestedAction": "..."
}

Be conservative with confidence. Only return ≥0.85 when the wording is
unambiguous (e.g. literal "cancel my membership"). When the member is venting
but not explicitly cancelling, prefer 'busy' or 'problem' over 'leaving'.`

interface ClassifyOptions {
  /** Last few messages of the conversation, oldest first. Helps the model see context. */
  history?: Array<{ direction: 'inbound' | 'outbound'; content: string }>
  /** Optional Supabase-stored member metadata to anchor the response. */
  memberContext?: { tenureMonths?: number; planName?: string; lastVisitDays?: number }
}

const CHEAP_RATE_PER_1K = { input: 0.00015, output: 0.0006 }

export async function classifyReply(
  message: string,
  opts: ClassifyOptions = {},
): Promise<ClassifiedReply> {
  // Cheap pre-filter: if the message is just a STOP keyword, skip the model.
  const trimmed = message.trim().toUpperCase()
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(trimmed)) {
    return {
      category: 'opt_out',
      outcome: 'mark_opt_out',
      confidence: 1,
      rationale: 'Literal STOP keyword.',
      suggestedAction: 'no_action',
      costUsd: 0,
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const userPrompt = buildUserPrompt(message, opts)

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  let parsed: Partial<ClassifiedReply> = {}
  try {
    parsed = JSON.parse(raw) as Partial<ClassifiedReply>
  } catch {
    // Fall through to defaults
  }

  const cost =
    ((response.usage?.prompt_tokens ?? 0) / 1000) * CHEAP_RATE_PER_1K.input +
    ((response.usage?.completion_tokens ?? 0) / 1000) * CHEAP_RATE_PER_1K.output

  return {
    category: (parsed.category as ReplyCategory) ?? 'other',
    outcome: (parsed.outcome as ReplyOutcomeSignal) ?? 'continue',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
    suggestedAction:
      (parsed.suggestedAction as ClassifiedReply['suggestedAction']) ?? 'no_action',
    costUsd: cost,
  }
}

function buildUserPrompt(message: string, opts: ClassifyOptions): string {
  let prompt = `MEMBER REPLY:\n"${message.trim()}"`
  if (opts.history && opts.history.length > 0) {
    const recent = opts.history.slice(-4)
    prompt += `\n\nRECENT MESSAGES (oldest first):`
    for (const m of recent) {
      prompt += `\n  ${m.direction === 'inbound' ? 'MEMBER' : 'AGENT'}: ${m.content}`
    }
  }
  if (opts.memberContext) {
    const c = opts.memberContext
    const lines: string[] = []
    if (c.tenureMonths !== undefined) lines.push(`Tenure: ${c.tenureMonths} months`)
    if (c.planName) lines.push(`Plan: ${c.planName}`)
    if (c.lastVisitDays !== undefined) lines.push(`Days since last visit: ${c.lastVisitDays}`)
    if (lines.length > 0) prompt += `\n\nMEMBER CONTEXT:\n  ${lines.join('\n  ')}`
  }
  prompt += `\n\nReturn JSON only.`
  return prompt
}
