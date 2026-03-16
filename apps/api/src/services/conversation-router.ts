import { prisma } from '../lib/prisma';
import { intentClassifier, IntentResult } from './intent-classifier';
import { cancelSaveEngine } from './cancel-save';
import { knowledgeBaseService } from './knowledge-base';
import { bookingService } from './booking';
import { AIGateway } from '@gymiq/ai-gateway';

export interface ConversationState {
  conversationId: string;
  currentIntent?: IntentResult['intent'];
  activeHandler?: 'booking' | 'cancel_save' | 'knowledge_base' | 'human' | 'general_ai';
  conversationHistory: Array<{
    direction: 'inbound' | 'outbound';
    content: string;
    timestamp: Date;
    intent?: string;
    confidence?: number;
  }>;
  humanRequested: boolean;
  metadata: {
    lastIntentClassification?: IntentResult;
    cancelSaveAttemptId?: string;
    bookingFlowStage?: string;
    escalationReason?: string;
  };
}

export interface RouterResponse {
  message: string;
  action: 'send_message' | 'escalate_human' | 'book_visit' | 'update_member' | 'no_action';
  handler: 'intent_classifier' | 'booking' | 'cancel_save' | 'knowledge_base' | 'general_ai' | 'human';
  confidence: number;
  nextSteps?: string[];
  metadata?: any;
}

export class ConversationRouter {
  private ai: AIGateway;

  constructor() {
    this.ai = new AIGateway();
  }

  /**
   * Route incoming message to appropriate handler
   */
  async routeMessage(
    gymId: string,
    phone: string,
    message: string,
    channel: 'whatsapp' | 'sms' | 'voice' = 'whatsapp'
  ): Promise<RouterResponse> {
    try {
      // Get or create conversation
      const conversationState = await this.getConversationState(gymId, phone, channel);

      // If human has been requested, flag for human handling
      if (conversationState.humanRequested) {
        await this.addMessageToHistory(conversationState.conversationId, 'inbound', message);
        return {
          message: "I've flagged this for our team to help you personally. Someone will be in touch shortly!",
          action: 'escalate_human',
          handler: 'human',
          confidence: 1.0,
          metadata: { reason: 'previously_requested' }
        };
      }

      // Classify intent of incoming message
      const intentResult = await intentClassifier.classifyIntent(
        message,
        conversationState.conversationHistory.slice(-5), // Last 5 messages for context
        await this.getGymContext(gymId)
      );

      // Add message to conversation history
      await this.addMessageToHistory(
        conversationState.conversationId,
        'inbound',
        message,
        intentResult.intent,
        intentResult.confidence
      );

      // Update conversation state with latest classification
      await this.updateConversationMetadata(conversationState.conversationId, {
        lastIntentClassification: {
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          subIntent: intentResult.subIntent,
          entities: intentResult.entities
        }
      });

      // Route based on intent
      let response: RouterResponse;

      if (!intentClassifier.shouldActOnIntent(intentResult)) {
        // Low confidence - escalate or use general AI
        response = await this.handleLowConfidenceIntent(
          conversationState,
          message,
          intentResult
        );
      } else {
        response = await this.routeByIntent(
          conversationState,
          message,
          intentResult,
          gymId
        );
      }

      // Add response to conversation history
      await this.addMessageToHistory(
        conversationState.conversationId,
        'outbound',
        response.message
      );

      // Update conversation state if handler changed
      if (response.handler !== conversationState.activeHandler) {
        await this.updateActiveHandler(conversationState.conversationId, response.handler);
      }

      return response;
    } catch (error) {
      console.error('[Conversation Router] Route error:', error);
      return {
        message: "I'm having trouble understanding right now. Let me get someone from our team to help you!",
        action: 'escalate_human',
        handler: 'human',
        confidence: 0,
        metadata: { error: 'routing_failed' }
      };
    }
  }

  /**
   * Get active conversations for a gym
   */
  async getActiveConversations(gymId: string) {
    try {
      return await prisma.conversation.findMany({
        where: {
          gymId,
          status: { in: ['active', 'waiting_human'] }
        },
        include: {
          member: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          lead: {
            select: {
              id: true,
              name: true,
              currentStage: true
            }
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              content: true,
              direction: true,
              intent: true,
              createdAt: true
            }
          }
        },
        orderBy: { lastMessageAt: 'desc' }
      });
    } catch (error) {
      console.error('[Conversation Router] Get active conversations error:', error);
      return [];
    }
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId: string, limit: number = 20) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              direction: true,
              content: true,
              intent: true,
              intentConfidence: true,
              createdAt: true,
              metadata: true
            }
          },
          member: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          lead: {
            select: {
              id: true,
              name: true,
              currentStage: true
            }
          }
        }
      });

      if (!conversation) {
        return null;
      }

      return {
        ...conversation,
        messages: conversation.messages.reverse() // Chronological order
      };
    } catch (error) {
      console.error('[Conversation Router] Get history error:', error);
      return null;
    }
  }

  /**
   * Handle different intents by routing to appropriate service
   */
  private async routeByIntent(
    conversationState: ConversationState,
    message: string,
    intentResult: IntentResult,
    gymId: string
  ): Promise<RouterResponse> {
    switch (intentResult.intent) {
      case 'cancellation_intent':
        return this.handleCancellationIntent(conversationState, message, gymId);

      case 'booking_request':
        return this.handleBookingRequest(conversationState, message, gymId);

      case 'pricing_question':
      case 'facility_question':
        return this.handleKnowledgeBaseQuery(conversationState, message, gymId);

      case 'complaint':
      case 'human_escalation':
        return this.handleHumanEscalation(conversationState, message, intentResult.intent);

      case 'greeting':
        return this.handleGreeting(conversationState, message, gymId);

      case 'positive_feedback':
        return this.handlePositiveFeedback(conversationState, message, gymId);

      case 'general_question':
      default:
        return this.handleGeneralQuestion(conversationState, message, gymId);
    }
  }

  /**
   * Handle cancellation intent - route to cancel-save engine
   */
  private async handleCancellationIntent(
    conversationState: ConversationState,
    message: string,
    gymId: string
  ): Promise<RouterResponse> {
    try {
      // Find member for this conversation
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationState.conversationId },
        include: { member: true }
      });

      if (!conversation?.member) {
        return {
          message: "I'd be happy to help you with that. Can you please provide your member details so I can assist you properly?",
          action: 'send_message',
          handler: 'general_ai',
          confidence: 0.8,
          metadata: { reason: 'member_not_found' }
        };
      }

      // Check if there's an existing cancel-save attempt
      const existingAttemptId = conversationState.metadata.cancelSaveAttemptId;

      let result;
      if (existingAttemptId) {
        // Continue existing cancel-save conversation
        result = await cancelSaveEngine.processCancelSaveMessage(existingAttemptId, message);
      } else {
        // Start new cancel-save flow
        result = await cancelSaveEngine.initiateCancelSave(
          gymId,
          conversation.member.id,
          message
        );

        // Update conversation metadata with attempt ID
        if ('attemptId' in result) {
          await this.updateConversationMetadata(conversationState.conversationId, {
            cancelSaveAttemptId: result.attemptId
          });
        }
      }

      if ('error' in result) {
        return {
          message: "I'm having trouble with that request. Let me get someone from our team to help you directly.",
          action: 'escalate_human',
          handler: 'human',
          confidence: 0.5,
          metadata: { error: result.error }
        };
      }

      const routerAction = this.mapCancelSaveToRouterAction(result.response.action);

      return {
        message: result.response.message,
        action: routerAction,
        handler: 'cancel_save',
        confidence: 0.9,
        metadata: {
          cancelSaveAction: result.response.action,
          offerType: result.response.offerType
        }
      };
    } catch (error) {
      console.error('[Conversation Router] Cancellation intent error:', error);
      return {
        message: "Let me get someone from our team to help you with your membership concerns.",
        action: 'escalate_human',
        handler: 'human',
        confidence: 0.5
      };
    }
  }

  /**
   * Handle booking request
   */
  private async handleBookingRequest(
    conversationState: ConversationState,
    message: string,
    gymId: string
  ): Promise<RouterResponse> {
    try {
      // Use existing booking service or create simple booking response
      const kb = await knowledgeBaseService.getKnowledgeBase(gymId);
      const gymName = kb?.gymName || 'our gym';

      return {
        message: `Great! I'd love to help you book a visit to ${gymName}. What type of visit interests you - a gym tour, trial class, or consultation? And do you have a preferred day/time?`,
        action: 'send_message',
        handler: 'booking',
        confidence: 0.9,
        nextSteps: [
          'Collect preferred date/time',
          'Confirm booking type',
          'Schedule appointment'
        ]
      };
    } catch (error) {
      console.error('[Conversation Router] Booking request error:', error);
      return {
        message: "I'd love to help you book a visit! Let me get someone from our team to schedule that for you.",
        action: 'escalate_human',
        handler: 'human',
        confidence: 0.7
      };
    }
  }

  /**
   * Handle knowledge base queries (pricing, facilities)
   */
  private async handleKnowledgeBaseQuery(
    conversationState: ConversationState,
    message: string,
    gymId: string
  ): Promise<RouterResponse> {
    try {
      const answer = await knowledgeBaseService.findAnswer(gymId, message);

      if (answer && answer.confidence > 0.6) {
        return {
          message: answer.answer,
          action: 'send_message',
          handler: 'knowledge_base',
          confidence: answer.confidence,
          metadata: { sources: answer.sources }
        };
      }

      // Fallback to general AI if knowledge base doesn't have answer
      return this.handleGeneralQuestion(conversationState, message, gymId);
    } catch (error) {
      console.error('[Conversation Router] Knowledge base query error:', error);
      return this.handleGeneralQuestion(conversationState, message, gymId);
    }
  }

  /**
   * Handle human escalation requests
   */
  private async handleHumanEscalation(
    conversationState: ConversationState,
    message: string,
    intent: string
  ): Promise<RouterResponse> {
    // Mark conversation as needing human attention
    await prisma.conversation.update({
      where: { id: conversationState.conversationId },
      data: { status: 'waiting_human' }
    });

    const escalationMessage = intent === 'complaint'
      ? "I understand you have a concern and I want to make sure it's addressed properly. I'm connecting you with a team member who can help resolve this for you."
      : "Of course! I'm connecting you with one of our team members who will be able to help you personally.";

    return {
      message: escalationMessage,
      action: 'escalate_human',
      handler: 'human',
      confidence: 1.0,
      metadata: { escalationReason: intent }
    };
  }

  /**
   * Handle greeting messages
   */
  private async handleGreeting(
    conversationState: ConversationState,
    message: string,
    gymId: string
  ): Promise<RouterResponse> {
    try {
      const kb = await knowledgeBaseService.getKnowledgeBase(gymId);
      const gymName = kb?.gymName || 'our gym';

      return {
        message: `Hello! Welcome to ${gymName}! 👋 How can I help you today? I can answer questions about our facilities, pricing, classes, or help you book a visit.`,
        action: 'send_message',
        handler: 'general_ai',
        confidence: 0.9
      };
    } catch (error) {
      console.error('[Conversation Router] Greeting error:', error);
      return {
        message: "Hello! How can I help you today?",
        action: 'send_message',
        handler: 'general_ai',
        confidence: 0.8
      };
    }
  }

  /**
   * Handle positive feedback
   */
  private async handlePositiveFeedback(
    conversationState: ConversationState,
    message: string,
    gymId: string
  ): Promise<RouterResponse> {
    return {
      message: "Thank you so much for the kind words! 😊 We really appreciate your feedback. Is there anything else I can help you with today?",
      action: 'send_message',
      handler: 'general_ai',
      confidence: 0.9
    };
  }

  /**
   * Handle general questions with AI
   */
  private async handleGeneralQuestion(
    conversationState: ConversationState,
    message: string,
    gymId: string
  ): Promise<RouterResponse> {
    try {
      const context = await knowledgeBaseService.buildContext(gymId);
      const kb = await knowledgeBaseService.getKnowledgeBase(gymId);

      const systemPrompt = `You are a helpful AI assistant for ${kb?.gymName || 'the gym'}.
Be ${kb?.tone || 'friendly, professional, and helpful'}.

Use this gym information to answer questions:
${context}

If you don't know something specific, offer to have a team member help them.
Keep responses under 150 words and conversational.`;

      const result = await this.ai.generateMemberReply(
        `Member question: "${message}"`,
        { message },
        kb
      );

      return {
        message: result.reply,
        action: 'send_message',
        handler: 'general_ai',
        confidence: 0.7
      };
    } catch (error) {
      console.error('[Conversation Router] General question error:', error);
      return {
        message: "I'm having trouble with that question right now. Let me get someone from our team to help you!",
        action: 'escalate_human',
        handler: 'human',
        confidence: 0.5
      };
    }
  }

  /**
   * Handle low confidence intents
   */
  private async handleLowConfidenceIntent(
    conversationState: ConversationState,
    message: string,
    intentResult: IntentResult
  ): Promise<RouterResponse> {
    // If confidence is very low, escalate to human
    if (intentResult.confidence < 0.3) {
      return {
        message: "I want to make sure I understand you correctly. Let me connect you with one of our team members who can help you properly.",
        action: 'escalate_human',
        handler: 'human',
        confidence: 0.6,
        metadata: { reason: 'very_low_confidence', originalIntent: intentResult.intent }
      };
    }

    // Try general AI with the unclear message
    return this.handleGeneralQuestion(conversationState, message, conversationState.conversationId.split('-')[0]); // Assuming gymId is part of conversationId
  }

  /**
   * Get or create conversation state
   */
  private async getConversationState(
    gymId: string,
    phone: string,
    channel: string
  ): Promise<ConversationState> {
    try {
      let conversation = await prisma.conversation.findFirst({
        where: { gymId, phone },
        include: {
          messages: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!conversation) {
        // Create new conversation
        conversation = await prisma.conversation.create({
          data: {
            gymId,
            phone,
            channel,
            status: 'active'
          },
          include: {
            messages: { take: 0 }
          }
        });
      }

      const conversationHistory = (conversation.messages || [])
        .reverse()
        .map(msg => ({
          direction: msg.direction as 'inbound' | 'outbound',
          content: msg.content,
          timestamp: msg.createdAt,
          intent: msg.intent || undefined,
          confidence: msg.intentConfidence || undefined
        }));

      const context = conversation.context as any || {};

      return {
        conversationId: conversation.id,
        currentIntent: context.currentIntent,
        activeHandler: context.activeHandler,
        conversationHistory,
        humanRequested: conversation.status === 'waiting_human',
        metadata: context.metadata || {}
      };
    } catch (error) {
      console.error('[Conversation Router] Get conversation state error:', error);
      throw error;
    }
  }

  /**
   * Add message to conversation history
   */
  private async addMessageToHistory(
    conversationId: string,
    direction: 'inbound' | 'outbound',
    content: string,
    intent?: string,
    confidence?: number
  ) {
    try {
      await prisma.message.create({
        data: {
          conversationId,
          direction,
          content,
          contentType: 'text',
          intent,
          intentConfidence: confidence,
          createdAt: new Date()
        }
      });

      // Update conversation last message timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() }
      });
    } catch (error) {
      console.error('[Conversation Router] Add message error:', error);
    }
  }

  /**
   * Update conversation metadata
   */
  private async updateConversationMetadata(conversationId: string, metadata: any) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });

      if (!conversation) return;

      const currentContext = conversation.context as any || {};
      const currentMetadata = currentContext.metadata || {};
      const updatedContext = {
        ...currentContext,
        metadata: {
          ...currentMetadata,
          ...metadata
        }
      };

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: updatedContext }
      });
    } catch (error) {
      console.error('[Conversation Router] Update metadata error:', error);
    }
  }

  /**
   * Update active handler
   */
  private async updateActiveHandler(
    conversationId: string,
    handler: RouterResponse['handler']
  ) {
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
      });

      if (!conversation) return;

      const currentContext = conversation.context as any || {};
      const updatedContext = {
        ...currentContext,
        activeHandler: handler
      };

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { context: updatedContext }
      });
    } catch (error) {
      console.error('[Conversation Router] Update handler error:', error);
    }
  }

  /**
   * Get gym context for intent classification
   */
  private async getGymContext(gymId: string) {
    try {
      const gym = await prisma.gym.findUnique({
        where: { id: gymId },
        select: { name: true, knowledgeBase: true }
      });

      return gym ? {
        name: gym.name,
        ...(gym.knowledgeBase && typeof gym.knowledgeBase === 'object' ? gym.knowledgeBase : {})
      } : null;
    } catch (error) {
      console.error('[Conversation Router] Get gym context error:', error);
      return null;
    }
  }

  /**
   * Map cancel-save actions to router actions
   */
  private mapCancelSaveToRouterAction(cancelSaveAction: string): RouterResponse['action'] {
    switch (cancelSaveAction) {
      case 'escalate':
        return 'escalate_human';
      case 'success_saved':
        return 'update_member';
      case 'accept_cancellation':
        return 'update_member';
      default:
        return 'send_message';
    }
  }
}

// Export singleton instance
export const conversationRouter = new ConversationRouter();