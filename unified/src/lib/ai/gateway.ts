/**
 * AI Gateway — Cost-optimised multi-model router
 *
 * Routes tasks to the cheapest adequate model:
 * - Member replies: GPT-4o-mini ($0.00015/1K tokens)
 * - Intent classification: GPT-4o-mini ($0.00015/1K tokens)
 * - Churn analysis: Claude Sonnet ($0.003/1K tokens)
 * - Cancel-save: Claude Sonnet ($0.003/1K tokens)
 * - CSV parsing: GPT-4.1 ($0.002/1K tokens)
 *
 * Estimated monthly AI cost per gym: £4-6
 */

import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

interface CostEntry {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  task: string
  timestamp: Date
}

export class AIGateway {
  private openai: OpenAI
  private anthropic: Anthropic
  private costLog: CostEntry[] = []

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  /**
   * Member-facing conversations — cheapest model
   */
  async generateMemberReply(
    message: string,
    context: Record<string, unknown>,
    knowledgeBase: Record<string, unknown>
  ): Promise<{ reply: string; cost: number }> {
    const systemPrompt = this.buildMemberReplyPrompt(knowledgeBase)

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Context: ${JSON.stringify(context)}\n\nMember message: ${message}` },
        ],
        temperature: 0.7,
        max_tokens: 300,
      })

      const cost = this.calculateOpenAICost('gpt-4o-mini', response.usage)
      this.track('gpt-4o-mini', 'member_reply', response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0, cost)

      return { reply: response.choices[0]?.message?.content || 'Sorry, I did not understand that.', cost }
    } catch (error) {
      console.error('[AI Gateway] GPT-4o-mini failed, falling back to Claude Haiku:', error)

      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-3-5-20241022',
        max_tokens: 300,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      })

      const cost = this.calculateClaudeCost('claude-3-5-haiku', response.usage)
      this.track('claude-3-5-haiku', 'member_reply', response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, cost)

      return {
        reply: response.content[0]?.type === 'text' ? response.content[0].text : 'Sorry, I did not understand that.',
        cost,
      }
    }
  }

  /**
   * Intent classification — fast and cheap
   */
  async classifyIntent(message: string): Promise<{ intent: string; confidence: number; cost: number }> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify the intent of this gym member message. Respond with JSON only: {"intent": "...", "confidence": 0.0-1.0}
Possible intents: book_class, check_hours, pricing_inquiry, freeze_membership, cancel_membership, complaint, general_question, greeting, unknown`,
        },
        { role: 'user', content: message },
      ],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const result = JSON.parse(content)
    const cost = this.calculateOpenAICost('gpt-4o-mini', response.usage)
    this.track('gpt-4o-mini', 'intent_classification', response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0, cost)

    return { intent: result.intent || 'unknown', confidence: result.confidence || 0.5, cost }
  }

  /**
   * Cancel-save conversation — empathy required, higher quality model
   */
  async handleCancelRequest(
    message: string,
    memberData: Record<string, unknown>,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<{ response: string; action: string; cost: number }> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      temperature: 0.7,
      system: `You are a gym retention specialist. A member wants to cancel.
Your goal: understand their reason, offer alternatives (freeze, downgrade, pause),
and save the membership if possible. Be empathetic but persuasive.

Respond with JSON: {"response": "...", "action": "saved|escalate|pending"}

Escalate to human if:
- Member is angry or threatening legal action
- Complex billing dispute
- Already tried alternatives and still wants to cancel`,
      messages: [
        {
          role: 'user',
          content: `Member data: ${JSON.stringify(memberData)}\n\nHistory: ${JSON.stringify(conversationHistory)}\n\nMessage: ${message}`,
        },
      ],
    })

    let content = response.content[0]?.type === 'text' ? response.content[0].text : '{}'
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    const result = JSON.parse(content)
    const cost = this.calculateClaudeCost('claude-sonnet-4', response.usage)
    this.track('claude-sonnet-4', 'cancel_save', response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, cost)

    return { response: result.response || 'I understand. Let me see how I can help.', action: result.action || 'pending', cost }
  }

  /**
   * Persist accumulated costs to Supabase
   */
  async flushCosts(supabase: SupabaseClient, gymId: string): Promise<void> {
    if (this.costLog.length === 0) return

    const rows = this.costLog.map((e) => ({
      gym_id: gymId,
      model: e.model,
      task: e.task,
      input_tokens: e.inputTokens,
      output_tokens: e.outputTokens,
      cost_usd: e.costUsd,
      created_at: e.timestamp.toISOString(),
    }))

    await supabase.from('ai_cost_log').insert(rows)
    this.costLog = []
  }

  getCostSummary(): { totalCost: number; byModel: Record<string, number> } {
    const totalCost = this.costLog.reduce((sum, t) => sum + t.costUsd, 0)
    const byModel = this.costLog.reduce((acc, t) => {
      acc[t.model] = (acc[t.model] || 0) + t.costUsd
      return acc
    }, {} as Record<string, number>)
    return { totalCost, byModel }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private calculateOpenAICost(model: string, usage: unknown): number {
    const rates: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4.1': { input: 0.002, output: 0.008 },
    }
    const rate = rates[model] || rates['gpt-4o-mini']
    const u = usage as { prompt_tokens?: number; completion_tokens?: number } | null
    return ((u?.prompt_tokens || 0) / 1000) * rate.input + ((u?.completion_tokens || 0) / 1000) * rate.output
  }

  private calculateClaudeCost(model: string, usage: unknown): number {
    const rates: Record<string, { input: number; output: number }> = {
      'claude-3-5-haiku': { input: 0.0008, output: 0.004 },
      'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
      'claude-sonnet-4': { input: 0.003, output: 0.015 },
    }
    const rate = rates[model] || rates['claude-3-5-sonnet']
    const u = usage as { input_tokens?: number; output_tokens?: number } | null
    return ((u?.input_tokens || 0) / 1000) * rate.input + ((u?.output_tokens || 0) / 1000) * rate.output
  }

  private track(model: string, task: string, inputTokens: number, outputTokens: number, costUsd: number) {
    this.costLog.push({ model, task, inputTokens, outputTokens, costUsd, timestamp: new Date() })
    console.log(`[AI Cost] ${model}/${task}: $${costUsd.toFixed(6)} (${inputTokens} in / ${outputTokens} out)`)
  }

  private buildMemberReplyPrompt(knowledgeBase: Record<string, unknown>): string {
    return `You are a helpful gym assistant. Answer member questions based on the gym's knowledge base.

Gym Information:
${JSON.stringify(knowledgeBase, null, 2)}

Guidelines:
- Be friendly and professional
- Keep responses concise (under 100 words)
- If you don't know something, say you'll connect them with staff
- For booking requests, provide the booking link
- For complaints, acknowledge and escalate
- Never make up information not in the knowledge base`
  }
}
