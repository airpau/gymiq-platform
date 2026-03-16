import { AIGateway } from '@gymiq/ai-gateway';

export interface IntentResult {
  intent:
    | 'booking_request'
    | 'pricing_question'
    | 'cancellation_intent'
    | 'freeze_request'
    | 'complaint'
    | 'facility_question'
    | 'general_question'
    | 'positive_feedback'
    | 'reschedule'
    | 'human_escalation'
    | 'greeting'
    | 'unknown';
  confidence: number; // 0-1
  subIntent?: string;
  entities: Array<{
    type: string;
    value: string;
    position?: number;
  }>;
}

export class IntentClassifier {
  private ai: AIGateway;

  constructor() {
    this.ai = new AIGateway();
  }

  /**
   * Classify incoming message intent using GPT-4o-mini
   */
  async classifyIntent(
    message: string,
    conversationHistory?: Array<{ direction: 'inbound' | 'outbound'; content: string }>,
    gymContext?: any
  ): Promise<IntentResult> {
    try {
      const systemPrompt = this.buildClassificationPrompt();
      const userPrompt = this.buildUserPrompt(message, conversationHistory, gymContext);

      const result = await this.ai.classifyIntent(userPrompt);

      // Map from AIGateway response format to our format
      const mappedIntent = this.mapIntent(result.intent);

      return {
        intent: mappedIntent,
        confidence: result.confidence,
        subIntent: undefined,
        entities: []
      };
    } catch (error) {
      console.error('[Intent Classifier] Classification error:', error);
      return {
        intent: 'unknown',
        confidence: 0,
        entities: []
      };
    }
  }

  /**
   * Check if intent classification confidence meets threshold
   */
  shouldActOnIntent(result: IntentResult): boolean {
    return result.confidence >= 0.7;
  }

  /**
   * Build system prompt for intent classification
   */
  private buildClassificationPrompt(): string {
    return `You are an expert intent classifier for gym/fitness center conversations.

Classify incoming messages into one of these intents:

BOOKING_REQUEST: Wants to book a visit, class, PT session, tour, trial
- Keywords: book, schedule, visit, appointment, tour, trial, class, personal trainer, PT
- Examples: "Can I book a tour?", "Schedule me for tomorrow", "What times are available?"

PRICING_QUESTION: Asking about membership costs, fees, pricing
- Keywords: cost, price, how much, membership, fee, payment, monthly
- Examples: "How much is a membership?", "What are your prices?", "Monthly cost?"

CANCELLATION_INTENT: Wants to cancel membership (HIGH PRIORITY - trigger save engine)
- Keywords: cancel, quit, stop, end membership, don't want, leave
- Examples: "I want to cancel", "How do I quit?", "Stop my membership"

FREEZE_REQUEST: Wants to pause/freeze membership temporarily
- Keywords: freeze, pause, hold, suspend, temporary stop
- Examples: "Can I freeze my membership?", "Pause for vacation"

COMPLAINT: Unhappy about something, problem, issue
- Keywords: problem, issue, complaint, unhappy, disappointed, terrible, awful
- Examples: "The gym is too crowded", "Equipment is broken", "Staff was rude"

FACILITY_QUESTION: Asking about equipment, classes, amenities, hours
- Keywords: equipment, classes, pool, sauna, hours, facilities, what's included
- Examples: "Do you have free weights?", "What classes do you offer?"

GENERAL_QUESTION: Other questions about the gym
- Examples: "Where do I park?", "Can I bring a guest?", "Age restrictions?"

POSITIVE_FEEDBACK: Happy member, compliments, praise
- Keywords: great, love, amazing, excellent, perfect, happy
- Examples: "Love this gym!", "Great service", "Amazing classes"

RESCHEDULE: Wants to change existing booking
- Keywords: reschedule, change, move, different time
- Examples: "Can I reschedule my PT session?", "Change my class booking"

HUMAN_ESCALATION: Explicitly asks for human help
- Keywords: speak to someone, human, person, manager, staff member
- Examples: "Can I speak to a person?", "Get me a manager"

GREETING: Hello, hi, general greeting
- Keywords: hi, hello, hey, good morning
- Examples: "Hi", "Hello there", "Good morning"

UNKNOWN: Cannot classify with confidence

RESPONSE FORMAT (JSON):
{
  "intent": "intent_name",
  "confidence": 0.85,
  "subIntent": "optional_sub_category",
  "entities": [
    {
      "type": "date|time|person|service|emotion",
      "value": "extracted_value"
    }
  ],
  "reasoning": "brief_explanation"
}

Be conservative with confidence scores. Only return high confidence (>0.8) when you're very sure.
Extract relevant entities like dates, times, names, services mentioned.`;
  }

  /**
   * Build user prompt with message and context
   */
  private buildUserPrompt(
    message: string,
    conversationHistory?: Array<{ direction: 'inbound' | 'outbound'; content: string }>,
    gymContext?: any
  ): string {
    let prompt = `MESSAGE TO CLASSIFY: "${message}"`;

    if (conversationHistory && conversationHistory.length > 0) {
      prompt += `\n\nCONVERSATION CONTEXT (last 3 messages):`;
      const recentHistory = conversationHistory.slice(-3);
      recentHistory.forEach((msg, i) => {
        prompt += `\n${msg.direction}: ${msg.content}`;
      });
    }

    if (gymContext?.name) {
      prompt += `\n\nGYM CONTEXT: ${gymContext.name}`;
    }

    prompt += `\n\nPlease classify this message. Return your response as valid JSON only.`;

    return prompt;
  }

  /**
   * Map AIGateway intent to our intent format
   */
  private mapIntent(gatewayIntent: string): IntentResult['intent'] {
    const intentMap: Record<string, IntentResult['intent']> = {
      'book_class': 'booking_request',
      'pricing_inquiry': 'pricing_question',
      'cancel_membership': 'cancellation_intent',
      'freeze_membership': 'freeze_request',
      'complaint': 'complaint',
      'check_hours': 'facility_question',
      'general_question': 'general_question',
      'greeting': 'greeting',
      'unknown': 'unknown'
    };

    return intentMap[gatewayIntent] || 'unknown';
  }
}

// Export singleton instance
export const intentClassifier = new IntentClassifier();