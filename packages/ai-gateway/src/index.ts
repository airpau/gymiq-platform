import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Cost tracking per request
interface CostTracker {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// AI Router configuration
interface RouterConfig {
  useCheapest: boolean;
  maxCostPerRequest: number;
  fallbackEnabled: boolean;
}

export class AIGateway {
  private openai: OpenAI;
  private anthropic: Anthropic;
  private costTracker: CostTracker[] = [];

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Route to cheapest model for member-facing conversations
   * Cost: ~$0.00015 per message vs $0.03 for GPT-4 (200x cheaper)
   */
  async generateMemberReply(
    message: string,
    context: any,
    knowledgeBase: any
  ): Promise<{ reply: string; cost: number }> {
    const systemPrompt = this.buildMemberReplyPrompt(knowledgeBase);
    
    try {
      // Primary: GPT-4o-mini (cheapest, good quality)
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Context: ${JSON.stringify(context)}\n\nMember message: ${message}` }
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const cost = this.calculateCost('gpt-4o-mini', response.usage);
      this.trackCost('gpt-4o-mini', response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0, cost);

      return {
        reply: response.choices[0]?.message?.content || 'Sorry, I did not understand that.',
        cost
      };
    } catch (error) {
      console.error('GPT-4o-mini failed, falling back to Claude Haiku:', error);
      
      // Fallback: Claude Haiku
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-3-5-20241022',
        max_tokens: 300,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      });

      const cost = this.calculateClaudeCost('claude-3-5-haiku', response.usage);
      this.trackCost('claude-3-5-haiku', response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, cost);

      return {
        reply: response.content[0]?.type === 'text' ? response.content[0].text : 'Sorry, I did not understand that.',
        cost
      };
    }
  }

  /**
   * Intent classification - fast and cheap
   * Cost: ~$0.0001 per classification
   */
  async classifyIntent(message: string): Promise<{ intent: string; confidence: number; cost: number }> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify the intent of this gym member message. Respond with JSON only: {"intent": "...", "confidence": 0.0-1.0}
          
Possible intents: book_class, check_hours, pricing_inquiry, freeze_membership, cancel_membership, complaint, general_question, greeting, unknown`
        },
        { role: 'user', content: message }
      ],
      temperature: 0,
      max_tokens: 100,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    const cost = this.calculateCost('gpt-4o-mini', response.usage);
    this.trackCost('gpt-4o-mini-intent', response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0, cost);

    return {
      intent: result.intent || 'unknown',
      confidence: result.confidence || 0.5,
      cost
    };
  }

  /**
   * Churn risk analysis - higher quality model
   * Cost: ~$0.003 per analysis (worth it for high-value decisions)
   */
  async analyzeChurnRisk(memberData: any): Promise<{ riskScore: number; factors: string[]; cost: number }> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      temperature: 0.3,
      system: `You are a gym retention expert. Analyze member data and predict churn risk.
      Respond with JSON only: {"riskScore": 0-100, "factors": ["reason1", "reason2"]}
      
      Risk scoring:
      - 0-30: Low risk
      - 31-60: Medium risk  
      - 61-100: High risk (immediate intervention needed)`,
      messages: [{ role: 'user', content: `Analyze this member: ${JSON.stringify(memberData)}` }]
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
    const result = JSON.parse(content);
    const cost = this.calculateClaudeCost('claude-3-5-sonnet', response.usage);
    this.trackCost('claude-3-5-sonnet-churn', response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, cost);

    return {
      riskScore: result.riskScore || 50,
      factors: result.factors || [],
      cost
    };
  }

  /**
   * Cancel-save conversation - empathy required
   * Cost: ~$0.005 per conversation (high-value retention)
   */
  async handleCancelRequest(
    message: string,
    memberData: any,
    conversationHistory: any[]
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
        { role: 'user', content: `Member data: ${JSON.stringify(memberData)}\n\nHistory: ${JSON.stringify(conversationHistory)}\n\nMessage: ${message}` }
      ]
    });

    let content = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
    // Strip markdown code blocks if AI wraps JSON in ```json ... ```
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const result = JSON.parse(content);
    const cost = this.calculateClaudeCost('claude-sonnet-4', response.usage);
    this.trackCost('claude-sonnet-4-cancel', response.usage?.input_tokens || 0, response.usage?.output_tokens || 0, cost);

    return {
      response: result.response || 'I understand. Let me see how I can help.',
      action: result.action || 'pending',
      cost
    };
  }

  /**
   * Parse CSV/Excel data
   * Cost: ~$0.01 per file (GPT-4.1 for structured extraction)
   */
  async parseCSVData(csvContent: string, expectedSchema: any): Promise<{ data: any[]; cost: number }> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `Parse this CSV data and extract structured information.
          Expected schema: ${JSON.stringify(expectedSchema)}
          Return JSON: {"data": [...]}`
        },
        { role: 'user', content: csvContent }
      ],
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{}';
    const result = JSON.parse(content);
    const cost = this.calculateCost('gpt-4.1', response.usage);
    this.trackCost('gpt-4.1-parse', response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0, cost);

    return {
      data: result.data || [],
      cost
    };
  }

  // Cost calculation helpers
  private calculateCost(model: string, usage: any): number {
    const rates: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'gpt-4.1': { input: 0.002, output: 0.008 },
    };

    const rate = rates[model] || rates['gpt-4o-mini'];
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;

    return (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  }

  private calculateClaudeCost(model: string, usage: any): number {
    const rates: Record<string, { input: number; output: number }> = {
      'claude-3-5-haiku': { input: 0.0008, output: 0.004 },
      'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-opus': { input: 0.015, output: 0.075 },
    };

    const rate = rates[model] || rates['claude-3-5-sonnet'];
    const inputTokens = usage?.input_tokens || 0;
    const outputTokens = usage?.output_tokens || 0;

    return (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  }

  private trackCost(model: string, inputTokens: number, outputTokens: number, cost: number) {
    this.costTracker.push({ model, inputTokens, outputTokens, costUsd: cost });
    
    // Log for monitoring
    console.log(`[AI Cost] ${model}: $${cost.toFixed(6)} (${inputTokens} in / ${outputTokens} out)`);
  }

  private buildMemberReplyPrompt(knowledgeBase: any): string {
    return `You are a helpful gym assistant. Answer member questions based on the gym's knowledge base.

Gym Information:
${JSON.stringify(knowledgeBase, null, 2)}

Guidelines:
- Be friendly and professional
- Keep responses concise (under 100 words)
- If you don't know something, say you'll connect them with staff
- For booking requests, provide the booking link
- For complaints, acknowledge and escalate
- Never make up information not in the knowledge base`;
  }

  // Public method to get cost summary
  getCostSummary(): { totalCost: number; byModel: Record<string, number> } {
    const totalCost = this.costTracker.reduce((sum, t) => sum + t.costUsd, 0);
    const byModel = this.costTracker.reduce((acc, t) => {
      acc[t.model] = (acc[t.model] || 0) + t.costUsd;
      return acc;
    }, {} as Record<string, number>);

    return { totalCost, byModel };
  }
}