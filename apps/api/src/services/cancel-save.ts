import { prisma } from '../lib/prisma';
import { AIGateway } from '@gymiq/ai-gateway';

export interface CancelSaveResponse {
  message: string;
  action: 'continue_conversation' | 'offer_save' | 'escalate' | 'accept_cancellation' | 'success_saved';
  offerType?: string;
  offerDetails?: string;
  nextStep?: string;
  cost: number;
}

export interface CancelSaveAttemptData {
  gymId: string;
  memberId: string;
  reason?: string;
  reasonCategory?: string;
  conversationLog: Array<{
    direction: 'inbound' | 'outbound';
    content: string;
    timestamp: Date;
    metadata?: any;
  }>;
}

export class CancelSaveEngine {
  private ai: AIGateway;

  constructor() {
    this.ai = new AIGateway();
  }

  /**
   * Start cancel-save flow for a member
   */
  async initiateCancelSave(
    gymId: string,
    memberId: string,
    initialMessage: string
  ): Promise<{ attemptId: string; response: CancelSaveResponse } | { error: string }> {
    try {
      // Check if there's already an active cancel-save attempt
      const existingAttempt = await prisma.cancelSaveAttempt.findFirst({
        where: {
          gymId,
          memberId,
          outcome: 'in_progress'
        }
      });

      if (existingAttempt) {
        // Continue existing conversation
        return this.processCancelSaveMessage(existingAttempt.id, initialMessage);
      }

      // Create new cancel-save attempt
      const attempt = await prisma.cancelSaveAttempt.create({
        data: {
          gymId,
          memberId,
          conversationLog: [{
            direction: 'inbound',
            content: initialMessage,
            timestamp: new Date()
          }],
          metadata: {
            startedAt: new Date(),
            initialMessage
          }
        }
      });

      // Generate empathetic first response
      const response = await this.generateCancelSaveResponse(
        attempt.id,
        initialMessage,
        'initiate'
      );

      if ('error' in response) {
        return response;
      }

      // Log AI response
      await this.addToConversationLog(attempt.id, 'outbound', response.message, {
        action: response.action,
        offerType: response.offerType
      });

      return {
        attemptId: attempt.id,
        response
      };
    } catch (error) {
      console.error('[Cancel-Save] Initiate error:', error);
      return { error: 'Failed to initiate cancel-save flow' };
    }
  }

  /**
   * Process member response in ongoing cancel-save conversation
   */
  async processCancelSaveMessage(
    attemptId: string,
    message: string
  ): Promise<{ attemptId: string; response: CancelSaveResponse } | { error: string }> {
    try {
      const attempt = await prisma.cancelSaveAttempt.findUnique({
        where: { id: attemptId },
        include: { member: true, gym: true }
      });

      if (!attempt) {
        return { error: 'Cancel-save attempt not found' };
      }

      if (attempt.outcome !== 'in_progress') {
        return { error: 'Cancel-save attempt is no longer active' };
      }

      // Add member message to log
      await this.addToConversationLog(attemptId, 'inbound', message);

      // Determine conversation stage and generate response
      const response = await this.generateCancelSaveResponse(
        attemptId,
        message,
        this.determineConversationStage(attempt)
      );

      if ('error' in response) {
        return response;
      }

      // Handle different actions
      await this.handleCancelSaveAction(attemptId, response);

      // Log AI response
      await this.addToConversationLog(attemptId, 'outbound', response.message, {
        action: response.action,
        offerType: response.offerType,
        offerDetails: response.offerDetails
      });

      return {
        attemptId,
        response
      };
    } catch (error) {
      console.error('[Cancel-Save] Process message error:', error);
      return { error: 'Failed to process cancel-save message' };
    }
  }

  /**
   * Get cancel-save statistics for a gym
   */
  async getCancelSaveStats(gymId: string, days: number = 30) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const attempts = await prisma.cancelSaveAttempt.findMany({
        where: {
          gymId,
          createdAt: { gte: since }
        }
      });

      const totalAttempts = attempts.length;
      const saved = attempts.filter(a => a.outcome === 'saved').length;
      const lost = attempts.filter(a => a.outcome === 'lost').length;
      const inProgress = attempts.filter(a => a.outcome === 'in_progress').length;
      const escalated = attempts.filter(a => a.outcome === 'escalated').length;

      // Group by reason category
      const reasonBreakdown = attempts.reduce((acc, attempt) => {
        const category = attempt.reasonCategory || 'unknown';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Group by offer type effectiveness
      const offerEffectiveness = attempts
        .filter(a => a.offerType && a.outcome === 'saved')
        .reduce((acc, attempt) => {
          const offerType = attempt.offerType!;
          acc[offerType] = (acc[offerType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      return {
        totalAttempts,
        saveRate: totalAttempts > 0 ? Math.round((saved / totalAttempts) * 100) : 0,
        outcomes: {
          saved,
          lost,
          inProgress,
          escalated
        },
        reasonBreakdown,
        offerEffectiveness,
        avgConversationLength: attempts.reduce((sum, a) => {
          const log = Array.isArray(a.conversationLog) ? a.conversationLog : [];
          return sum + log.length;
        }, 0) / Math.max(1, totalAttempts)
      };
    } catch (error) {
      console.error('[Cancel-Save] Stats error:', error);
      return null;
    }
  }

  /**
   * Get active cancel-save conversations for a gym
   */
  async getActiveCancelSaveAttempts(gymId: string) {
    try {
      return await prisma.cancelSaveAttempt.findMany({
        where: {
          gymId,
          outcome: 'in_progress'
        },
        include: {
          member: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      console.error('[Cancel-Save] Get active attempts error:', error);
      return [];
    }
  }

  /**
   * Generate AI response for cancel-save conversation
   */
  private async generateCancelSaveResponse(
    attemptId: string,
    message: string,
    stage: 'initiate' | 'reason_inquiry' | 'offer_stage' | 'objection_handling' | 'closing'
  ): Promise<CancelSaveResponse | { error: string }> {
    try {
      const attempt = await prisma.cancelSaveAttempt.findUnique({
        where: { id: attemptId },
        include: { member: true, gym: true }
      });

      if (!attempt) {
        return { error: 'Attempt not found' };
      }

      const context = await this.buildCancelSaveContext(attempt, stage);
      const systemPrompt = this.buildCancelSavePrompt(context, stage);
      const userPrompt = `Member message: "${message}"\n\nPlease respond according to the cancel-save strategy for stage: ${stage}`;

      const result = await this.ai.handleCancelRequest(message, context.memberProfile, context.conversationLog);

      // Use AIGateway response directly
      return {
        message: result.response,
        action: this.mapAIGatewayAction(result.action),
        offerType: undefined, // Will be determined from message content
        offerDetails: undefined,
        nextStep: undefined,
        cost: result.cost
      };
    } catch (error) {
      console.error('[Cancel-Save] Generate response error:', error);
      return { error: 'Failed to generate response' };
    }
  }

  /**
   * Build context for cancel-save conversation
   */
  private async buildCancelSaveContext(attempt: any, stage: string) {
    const conversationLog = Array.isArray(attempt.conversationLog) ? attempt.conversationLog : [];

    // Get gym retention offers from knowledge base
    const retentionOffers = attempt.gym.knowledgeBase?.retentionOffers || {
      downgrade: { name: 'Classic Membership', price: '£24.99/month', description: 'Basic gym access' },
      freeze: { duration: '3 months', price: 'Free', description: 'Pause membership temporarily' },
      discount: { amount: '25%', duration: '3 months', description: '25% off for 3 months' },
      free_session: { name: 'Recovery Zone Session', price: 'Free', description: 'Complimentary recovery session' },
      pt_session: { name: 'Personal Training', price: 'Free', description: 'Free PT consultation' }
    };

    return {
      attemptId: attempt.id,
      stage,
      memberProfile: {
        name: attempt.member.name,
        membershipTier: attempt.member.membershipTier,
        lifetimeValue: attempt.member.lifetimeValue,
        joinDate: attempt.member.joinDate,
        status: attempt.member.status
      },
      gymProfile: {
        name: attempt.gym.name,
        settings: attempt.gym.settings,
        knowledgeBase: attempt.gym.knowledgeBase,
        retentionOffers
      },
      previousReason: attempt.reason,
      reasonCategory: attempt.reasonCategory,
      conversationLog,
      existingOffers: attempt.offerMade ? [attempt.offerMade] : []
    };
  }

  /**
   * Build system prompt for cancel-save AI
   */
  private buildCancelSavePrompt(context: any, stage: string): string {
    const member = context.memberProfile;
    const gym = context.gymProfile;
    const offers = context.gymProfile.retentionOffers;

    let stageInstructions = '';

    switch (stage) {
      case 'initiate':
        stageInstructions = `STAGE: Initial Response
- Acknowledge their cancellation request with empathy
- Express that you understand their situation
- Ask for their reason to help find the best solution
- Be warm but not pushy
- Keep response under 80 words`;
        break;

      case 'reason_inquiry':
        stageInstructions = `STAGE: Understanding Their Reason
- Listen to their reason and show empathy
- Probe gently for more details if needed
- Categorize reason internally (too_expensive, not_using, moving, injury, unhappy)
- Prepare to offer appropriate solution
- Keep response under 100 words`;
        break;

      case 'offer_stage':
        stageInstructions = `STAGE: Making Retention Offer
Based on their reason, offer appropriate solution:
- Too expensive → Downgrade or discount: ${JSON.stringify(offers.downgrade)} or ${JSON.stringify(offers.discount)}
- Not using → Free sessions to restart: ${JSON.stringify(offers.free_session)} or ${JSON.stringify(offers.pt_session)}
- Moving/Travel → Freeze option: ${JSON.stringify(offers.freeze)}
- Injury → Freeze + recovery support: ${JSON.stringify(offers.freeze)} + recovery guidance
- Unhappy → Escalate to manager for resolution

Present ONE clear offer. Explain benefits without being pushy.`;
        break;

      case 'objection_handling':
        stageInstructions = `STAGE: Handling Objections
- Address their concerns about the offer
- Show flexibility where possible
- If they decline, accept gracefully
- Offer to process their cancellation
- Leave door open for future return`;
        break;

      case 'closing':
        stageInstructions = `STAGE: Closing Conversation
- If they accepted: Confirm next steps, show enthusiasm
- If they declined: Accept gracefully, confirm cancellation process
- Ensure they feel heard and respected
- End on positive note`;
        break;
    }

    return `You are ${gym.name}'s Member Success AI, specializing in empathetic retention conversations.

MEMBER CONTEXT:
- Name: ${member.name}
- Membership: ${member.membershipTier || 'Standard'}
- Member since: ${member.joinDate ? new Date(member.joinDate).toLocaleDateString() : 'Unknown'}
- Lifetime value: £${member.lifetimeValue || 0}
${context.previousReason ? `- Previous reason given: ${context.previousReason}` : ''}

${stageInstructions}

CONVERSATION HISTORY:
${context.conversationLog.map((msg: any) => `${msg.direction}: ${msg.content}`).join('\n')}

RESPONSE GUIDELINES:
- Use empathetic, understanding tone
- Never sound desperate or pushy
- Acknowledge their feelings first
- Focus on helping them find the right solution
- If they want to cancel, respect their decision
- Keep responses conversational and human-like
- Use their name naturally
- THIS IS DRY-RUN: Log what you would do, don't actually cancel memberships

RESPONSE FORMAT:
Respond naturally, then on a new line add:
ACTION: [continue_conversation|offer_save|escalate|accept_cancellation|success_saved]
OFFER_TYPE: [downgrade|freeze|discount|free_session|pt_session] (if making offer)
OFFER_DETAILS: [specific offer details] (if making offer)
NEXT_STEP: [what happens next] (if applicable)`;
  }

  /**
   * Parse AI response for cancel-save action and offer
   */
  private parseCancelSaveResponse(response: string, stage: string): {
    message: string;
    action: CancelSaveResponse['action'];
    offerType?: string;
    offerDetails?: string;
    nextStep?: string;
  } {
    const lines = response.split('\n');
    const message = lines[0] || response;

    let action: CancelSaveResponse['action'] = 'continue_conversation';
    let offerType: string | undefined;
    let offerDetails: string | undefined;
    let nextStep: string | undefined;

    // Parse action indicators from response
    for (const line of lines) {
      if (line.startsWith('ACTION:')) {
        const actionMatch = line.match(/ACTION:\s*(\w+)/);
        if (actionMatch) {
          action = actionMatch[1] as CancelSaveResponse['action'];
        }
      }
      if (line.startsWith('OFFER_TYPE:')) {
        const offerMatch = line.match(/OFFER_TYPE:\s*(\w+)/);
        if (offerMatch) {
          offerType = offerMatch[1];
        }
      }
      if (line.startsWith('OFFER_DETAILS:')) {
        offerDetails = line.replace('OFFER_DETAILS:', '').trim();
      }
      if (line.startsWith('NEXT_STEP:')) {
        nextStep = line.replace('NEXT_STEP:', '').trim();
      }
    }

    // Clean message of action indicators
    const cleanMessage = message
      .replace(/ACTION:.*$/gm, '')
      .replace(/OFFER_TYPE:.*$/gm, '')
      .replace(/OFFER_DETAILS:.*$/gm, '')
      .replace(/NEXT_STEP:.*$/gm, '')
      .trim();

    return {
      message: cleanMessage,
      action,
      offerType,
      offerDetails,
      nextStep
    };
  }

  /**
   * Handle cancel-save actions (update database, trigger workflows)
   */
  private async handleCancelSaveAction(attemptId: string, response: CancelSaveResponse) {
    try {
      const updateData: any = {};

      switch (response.action) {
        case 'offer_save':
          updateData.offerMade = response.offerDetails;
          updateData.offerType = response.offerType;
          break;

        case 'success_saved':
          updateData.outcome = 'saved';
          updateData.savedAt = new Date();
          break;

        case 'accept_cancellation':
          updateData.outcome = 'lost';
          updateData.lostAt = new Date();
          console.log(`[Cancel-Save] DRY-RUN: Would process cancellation for attempt ${attemptId}`);
          break;

        case 'escalate':
          updateData.outcome = 'escalated';
          console.log(`[Cancel-Save] DRY-RUN: Would escalate to human for attempt ${attemptId}`);
          break;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.cancelSaveAttempt.update({
          where: { id: attemptId },
          data: updateData
        });
      }
    } catch (error) {
      console.error('[Cancel-Save] Handle action error:', error);
    }
  }

  /**
   * Add message to conversation log
   */
  private async addToConversationLog(
    attemptId: string,
    direction: 'inbound' | 'outbound',
    content: string,
    metadata?: any
  ) {
    try {
      const attempt = await prisma.cancelSaveAttempt.findUnique({
        where: { id: attemptId }
      });

      if (!attempt) return;

      const currentLog = Array.isArray(attempt.conversationLog) ? attempt.conversationLog : [];
      const newEntry = {
        direction,
        content,
        timestamp: new Date(),
        ...(metadata && { metadata })
      };

      await prisma.cancelSaveAttempt.update({
        where: { id: attemptId },
        data: {
          conversationLog: [...currentLog, newEntry]
        }
      });
    } catch (error) {
      console.error('[Cancel-Save] Add to log error:', error);
    }
  }

  /**
   * Map AIGateway action to our action format
   */
  private mapAIGatewayAction(gatewayAction: string): CancelSaveResponse['action'] {
    const actionMap: Record<string, CancelSaveResponse['action']> = {
      'saved': 'success_saved',
      'escalate': 'escalate',
      'pending': 'continue_conversation'
    };

    return actionMap[gatewayAction] || 'continue_conversation';
  }

  /**
   * Determine current conversation stage
   */
  private determineConversationStage(attempt: any): 'reason_inquiry' | 'offer_stage' | 'objection_handling' | 'closing' {
    const conversationLog = Array.isArray(attempt.conversationLog) ? attempt.conversationLog : [];

    if (!attempt.reason && conversationLog.length <= 2) {
      return 'reason_inquiry';
    }

    if (!attempt.offerMade) {
      return 'offer_stage';
    }

    if (attempt.offerMade && conversationLog.length < 8) {
      return 'objection_handling';
    }

    return 'closing';
  }
}

// Export singleton instance
export const cancelSaveEngine = new CancelSaveEngine();