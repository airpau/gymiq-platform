import { prisma } from '../lib/prisma';
import { AIGateway } from '@gymiq/ai-gateway';
import { leadPipeline, LeadStage } from './lead-pipeline';
import { Channel } from './lead-pipeline';

interface ConversationContext {
  leadId: string;
  gymId: string;
  currentStage: LeadStage;
  leadProfile: {
    name?: string;
    email?: string;
    phone?: string;
    source: string;
    lastContactAt?: Date;
    contactAttempts: number;
    score: number;
  };
  gymProfile: {
    name: string;
    settings: any;
    knowledgeBase: any;
  };
  conversationHistory: Array<{
    direction: 'inbound' | 'outbound';
    content: string;
    timestamp: Date;
  }>;
  quietHours: boolean;
}

interface AIResponse {
  message: string;
  action: 'send_message' | 'book_visit' | 'escalate_human' | 'advance_stage' | 'schedule_followup';
  nextStage?: LeadStage;
  bookingIntent?: {
    requestedDate?: string;
    requestedTime?: string;
    preferredType?: 'tour' | 'trial_class' | 'consultation';
  };
  followupDelay?: number; // minutes
  cost: number;
}

export class AIConversationEngine {
  private ai: AIGateway;

  constructor() {
    this.ai = new AIGateway();
  }

  /**
   * Process incoming message from a lead and generate AI response
   */
  async processInboundMessage(
    gymId: string,
    phone: string,
    message: string,
    channel: Channel = 'whatsapp'
  ): Promise<AIResponse | { error: string }> {
    try {
      // Find or create conversation
      let conversation = await prisma.conversation.findFirst({
        where: { gymId, phone },
        include: {
          lead: true,
          messages: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!conversation) {
        // Try to find lead by phone
        const lead = await prisma.lead.findFirst({
          where: { gymId, phone }
        });

        if (!lead) {
          return { error: 'Lead not found for this phone number' };
        }

        // Create conversation
        conversation = await prisma.conversation.create({
          data: {
            gymId,
            leadId: lead.id,
            phone,
            channel,
            status: 'active'
          },
          include: {
            lead: true,
            messages: { take: 0 }
          }
        });
      }

      if (!conversation.lead) {
        return { error: 'Conversation has no associated lead' };
      }

      // Store incoming message
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'inbound',
          content: message,
          contentType: 'text',
          metadata: { channel, receivedAt: new Date() }
        }
      });

      // Build conversation context
      const context = await this.buildConversationContext(conversation.lead.id, conversation);

      // Generate AI response
      const response = await this.generateAIResponse(message, context);

      if ('error' in response) {
        return response;
      }

      // Store outbound message
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'outbound',
          content: response.message,
          contentType: 'text',
          aiModel: 'gpt-4o-mini',
          aiCost: response.cost,
          metadata: {
            action: response.action,
            nextStage: response.nextStage,
            bookingIntent: response.bookingIntent,
            generatedAt: new Date()
          }
        }
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() }
      });

      // Handle actions
      await this.executeAIAction(conversation.lead.id, response, channel);

      return response;
    } catch (error) {
      console.error('[AI Conversation] Processing error:', error);
      return { error: 'Failed to process message' };
    }
  }

  /**
   * Generate initial outreach message for a lead
   */
  async generateInitialOutreach(leadId: string): Promise<AIResponse | { error: string }> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { gym: true }
      });

      if (!lead) {
        return { error: 'Lead not found' };
      }

      // Build minimal context for initial outreach
      const context: ConversationContext = {
        leadId,
        gymId: lead.gymId,
        currentStage: lead.currentStage as LeadStage,
        leadProfile: {
          name: lead.name || undefined,
          email: lead.email || undefined,
          phone: lead.phone || undefined,
          source: lead.source,
          contactAttempts: lead.contactAttempts,
          score: lead.score
        },
        gymProfile: {
          name: lead.gym.name,
          settings: lead.gym.settings as any,
          knowledgeBase: lead.gym.knowledgeBase as any
        },
        conversationHistory: [],
        quietHours: this.isQuietHours()
      };

      const prompt = this.buildInitialOutreachPrompt(context);
      const result = await this.ai.generateMemberReply(prompt, context, context.gymProfile.knowledgeBase);

      return {
        message: result.reply,
        action: 'send_message',
        nextStage: 'contacted',
        cost: result.cost
      };
    } catch (error) {
      console.error('[AI Conversation] Initial outreach error:', error);
      return { error: 'Failed to generate initial outreach' };
    }
  }

  /**
   * Build conversation context from database
   */
  private async buildConversationContext(leadId: string, conversation: any): Promise<ConversationContext> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { gym: true }
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // Get recent messages for context
    const messages = conversation.messages || [];
    const conversationHistory = messages
      .reverse() // Chronological order
      .map((msg: any) => ({
        direction: msg.direction as 'inbound' | 'outbound',
        content: msg.content,
        timestamp: msg.createdAt
      }));

    return {
      leadId,
      gymId: lead.gymId,
      currentStage: lead.currentStage as LeadStage,
      leadProfile: {
        name: lead.name || undefined,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        source: lead.source,
        lastContactAt: lead.lastContactAt || undefined,
        contactAttempts: lead.contactAttempts,
        score: lead.score
      },
      gymProfile: {
        name: lead.gym.name,
        settings: lead.gym.settings as any,
        knowledgeBase: lead.gym.knowledgeBase as any
      },
      conversationHistory,
      quietHours: this.isQuietHours()
    };
  }

  /**
   * Generate AI response using GPT-4o-mini
   */
  private async generateAIResponse(message: string, context: ConversationContext): Promise<AIResponse | { error: string }> {
    try {
      const systemPrompt = this.buildConversationPrompt(context);

      const result = await this.ai.generateMemberReply(
        `User message: "${message}"\n\nPlease respond as the gym's AI assistant. Consider the lead's current stage (${context.currentStage}) and guide them towards booking a visit.`,
        context,
        context.gymProfile.knowledgeBase
      );

      // Parse response for action intent
      const responseText = result.reply;
      let action: AIResponse['action'] = 'send_message';
      let nextStage: LeadStage | undefined;
      let bookingIntent: AIResponse['bookingIntent'] | undefined;

      // Detect booking intent
      if (this.containsBookingIntent(responseText, message)) {
        action = 'book_visit';
        nextStage = 'booked';
        bookingIntent = this.extractBookingIntent(message);
      }
      // Detect stage advancement
      else if (this.shouldAdvanceStage(context, message)) {
        action = 'advance_stage';
        nextStage = this.determineNextStage(context.currentStage, message);
      }
      // Detect escalation needed
      else if (this.shouldEscalateToHuman(message, context)) {
        action = 'escalate_human';
      }

      return {
        message: responseText,
        action,
        nextStage,
        bookingIntent,
        cost: result.cost
      };
    } catch (error) {
      console.error('[AI Conversation] Generation error:', error);
      return { error: 'Failed to generate AI response' };
    }
  }

  /**
   * Execute actions based on AI response
   */
  private async executeAIAction(leadId: string, response: AIResponse, channel: Channel) {
    try {
      switch (response.action) {
        case 'advance_stage':
          if (response.nextStage) {
            await leadPipeline.advanceStage({
              leadId,
              toStage: response.nextStage,
              channel,
              action: 'response',
              message: `AI detected progression to ${response.nextStage}`
            });
          }
          break;

        case 'book_visit':
          if (response.nextStage === 'booked') {
            await leadPipeline.markBooked(leadId, channel);
          }
          break;

        case 'escalate_human':
          const conversation = await prisma.conversation.findFirst({
            where: { leadId: leadId }
          });
          if (conversation) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { status: 'waiting_human' }
            });
          }
          console.log(`[AI Conversation] Escalated lead ${leadId} to human`);
          break;

        case 'schedule_followup':
          // TODO: Integrate with BullMQ worker for follow-up scheduling
          console.log(`[AI Conversation] Follow-up scheduled for lead ${leadId}`);
          break;
      }
    } catch (error) {
      console.error(`[AI Conversation] Action execution error for lead ${leadId}:`, error);
    }
  }

  /**
   * Build system prompt for conversations
   */
  private buildConversationPrompt(context: ConversationContext): string {
    const gym = context.gymProfile;
    const lead = context.leadProfile;
    const stage = context.currentStage;

    const openingHours = gym.settings?.openingHours || {
      monday: '6:00-22:00',
      tuesday: '6:00-22:00',
      wednesday: '6:00-22:00',
      thursday: '6:00-22:00',
      friday: '6:00-22:00',
      saturday: '8:00-20:00',
      sunday: '8:00-20:00'
    };

    return `You are the AI assistant for ${gym.name}, a friendly gym helping people achieve their fitness goals.

LEAD CONTEXT:
- Name: ${lead.name || 'Potential member'}
- Current stage: ${stage}
- Lead source: ${lead.source}
- Contact attempts: ${lead.contactAttempts}
- Lead quality score: ${lead.score}/100

CONVERSATION GOAL:
Guide the lead toward booking a gym visit (tour, trial class, or consultation).

CURRENT STAGE: ${stage.toUpperCase()}
${this.getStageSpecificInstructions(stage)}

GYM INFORMATION:
- Opening Hours: ${JSON.stringify(openingHours, null, 2)}
${gym.knowledgeBase?.facilities ? `- Facilities: ${gym.knowledgeBase.facilities}` : ''}
${gym.knowledgeBase?.classes ? `- Classes: ${gym.knowledgeBase.classes}` : ''}
${gym.knowledgeBase?.pricing ? `- Pricing: ${gym.knowledgeBase.pricing}` : ''}

RESPONSE GUIDELINES:
- Be warm, professional, and helpful
- Keep responses under 100 words
- Ask one question at a time
- Guide toward booking a visit
- Use the lead's name when known
- If you don't know something, say you'll have a team member follow up
- ${context.quietHours ? 'It\'s outside business hours - be respectful of timing' : 'It\'s during business hours'}

CONVERSATION HISTORY:
${context.conversationHistory.map(msg => `${msg.direction}: ${msg.content}`).join('\n')}`;
  }

  /**
   * Build initial outreach prompt
   */
  private buildInitialOutreachPrompt(context: ConversationContext): string {
    const gym = context.gymProfile;
    const lead = context.leadProfile;

    let sourceContext = '';
    switch (lead.source) {
      case 'abandoned_cart':
        sourceContext = 'You were interested in joining but didn\'t complete the signup.';
        break;
      case 'web_form':
        sourceContext = 'You recently inquired about our gym.';
        break;
      case 'call':
        sourceContext = 'You called us recently.';
        break;
      default:
        sourceContext = 'You showed interest in our gym.';
    }

    return `Generate a warm initial outreach message for ${gym.name}.

Lead context: ${sourceContext}
Lead name: ${lead.name || 'there'}

Create a friendly first message that:
- Acknowledges their interest
- Offers to answer questions
- Suggests booking a visit
- Keep it under 80 words
- Don't be pushy

${context.quietHours ? 'Note: It\'s outside business hours, so acknowledge the timing.' : ''}`;
  }

  /**
   * Get stage-specific AI instructions
   */
  private getStageSpecificInstructions(stage: LeadStage): string {
    const instructions = {
      new: 'First contact - be welcoming and assess their interest level.',
      contacted: 'They\'ve been contacted - focus on engaging them and understanding their fitness goals.',
      engaged: 'They\'re engaged - work on qualifying them and moving toward a visit booking.',
      booked: 'Visit is scheduled - provide helpful prep info and maintain enthusiasm.',
      visited: 'They\'ve visited - follow up on their experience and guide toward membership.',
      converting: 'Strong interest shown - focus on overcoming objections and closing.',
      converted: 'Already a member - this shouldn\'t happen in lead conversations.',
      lost: 'Previously unresponsive - be extra warm and try to re-engage.',
      nurturing: 'Long-term follow-up - provide value and check in periodically.'
    };

    return instructions[stage] || 'Respond helpfully and guide toward booking a visit.';
  }

  /**
   * Check if current time is during quiet hours
   */
  private isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour < 9 || hour > 20; // Quiet hours: before 9am or after 8pm
  }

  /**
   * Detect booking intent in messages
   */
  private containsBookingIntent(aiResponse: string, userMessage: string): boolean {
    const bookingKeywords = [
      'book', 'schedule', 'visit', 'tour', 'trial', 'appointment',
      'come in', 'see the gym', 'check it out', 'consultation'
    ];

    const combined = (aiResponse + ' ' + userMessage).toLowerCase();
    return bookingKeywords.some(keyword => combined.includes(keyword));
  }

  /**
   * Extract booking intent details
   */
  private extractBookingIntent(message: string): AIResponse['bookingIntent'] {
    const timePatterns = [
      /\b(\d{1,2}):?(\d{2})?\s*(am|pm)\b/i,
      /\b(morning|afternoon|evening)\b/i
    ];

    const datePatterns = [
      /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b(\d{1,2}[\/\-]\d{1,2})\b/
    ];

    let requestedTime: string | undefined;
    let requestedDate: string | undefined;

    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match) {
        requestedTime = match[0];
        break;
      }
    }

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        requestedDate = match[0];
        break;
      }
    }

    return { requestedDate, requestedTime, preferredType: 'tour' };
  }

  /**
   * Determine if stage should be advanced
   */
  private shouldAdvanceStage(context: ConversationContext, message: string): boolean {
    const currentStage = context.currentStage;
    const messageLower = message.toLowerCase();

    // Stage advancement logic
    if (currentStage === 'new' || currentStage === 'contacted') {
      // Advance to engaged if they ask questions or show interest
      return messageLower.includes('?') ||
             ['yes', 'interested', 'tell me', 'more info'].some(phrase => messageLower.includes(phrase));
    }

    return false;
  }

  /**
   * Determine next stage based on current stage and context
   */
  private determineNextStage(currentStage: LeadStage, message: string): LeadStage {
    if (currentStage === 'new' || currentStage === 'contacted') {
      return 'engaged';
    }
    if (currentStage === 'engaged') {
      return 'converting';
    }
    return currentStage;
  }

  /**
   * Check if conversation should be escalated to human
   */
  private shouldEscalateToHuman(message: string, context: ConversationContext): boolean {
    const escalationTriggers = [
      'speak to a person', 'human', 'manager', 'complaint',
      'cancel', 'refund', 'billing', 'problem', 'issue',
      'angry', 'frustrated', 'unsubscribe'
    ];

    const messageLower = message.toLowerCase();
    return escalationTriggers.some(trigger => messageLower.includes(trigger)) ||
           context.leadProfile.contactAttempts > 5;
  }
}

// Export singleton instance
export const aiConversation = new AIConversationEngine();