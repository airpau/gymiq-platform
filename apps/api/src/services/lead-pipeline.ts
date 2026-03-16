import { prisma } from '../lib/prisma';

export type LeadStage =
  | 'new'
  | 'contacted'
  | 'engaged'
  | 'booked'
  | 'visited'
  | 'converting'
  | 'converted'
  | 'lost'
  | 'nurturing';

export type ActionType =
  | 'outreach'
  | 'response'
  | 'booking'
  | 'visit'
  | 'follow_up'
  | 'stage_change'
  | 'manual_update';

export type Channel =
  | 'whatsapp'
  | 'email'
  | 'sms'
  | 'call'
  | 'manual'
  | 'system';

interface StageTransitionData {
  leadId: string;
  toStage: LeadStage;
  channel?: Channel;
  action: ActionType;
  message?: string;
  metadata?: Record<string, any>;
  userId?: string; // Staff member who triggered the action
}

export class LeadPipelineService {
  /**
   * Valid stage transitions to prevent invalid state changes
   */
  private static readonly VALID_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
    new: ['contacted', 'lost', 'nurturing'],
    contacted: ['engaged', 'lost', 'nurturing', 'booked'],
    engaged: ['booked', 'converting', 'lost', 'nurturing'],
    booked: ['visited', 'lost', 'nurturing'],
    visited: ['converting', 'converted', 'lost', 'nurturing'],
    converting: ['converted', 'lost', 'nurturing'],
    converted: [], // Terminal state
    lost: ['nurturing'], // Can re-engage lost leads
    nurturing: ['contacted', 'engaged', 'booked', 'lost'], // Re-engagement
  };

  /**
   * Stage descriptions for UI display
   */
  static readonly STAGE_DESCRIPTIONS: Record<LeadStage, { title: string; description: string; color: string }> = {
    new: {
      title: 'New',
      description: 'Fresh lead, not yet contacted',
      color: '#3B82F6'
    },
    contacted: {
      title: 'Contacted',
      description: 'Initial outreach sent, awaiting response',
      color: '#8B5CF6'
    },
    engaged: {
      title: 'Engaged',
      description: 'Lead has responded, active conversation',
      color: '#F59E0B'
    },
    booked: {
      title: 'Booked',
      description: 'Visit/trial scheduled',
      color: '#10B981'
    },
    visited: {
      title: 'Visited',
      description: 'Attended visit/trial',
      color: '#06B6D4'
    },
    converting: {
      title: 'Converting',
      description: 'Showing strong interest, ready to join',
      color: '#8B5CF6'
    },
    converted: {
      title: 'Converted',
      description: 'Signed up and became member',
      color: '#10B981'
    },
    lost: {
      title: 'Lost',
      description: 'Uninterested or unresponsive',
      color: '#EF4444'
    },
    nurturing: {
      title: 'Nurturing',
      description: 'Long-term follow-up sequence',
      color: '#6B7280'
    },
  };

  /**
   * Advance a lead to the next stage with full audit trail
   */
  async advanceStage(data: StageTransitionData): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current lead state
      const lead = await prisma.lead.findUnique({
        where: { id: data.leadId },
        select: { currentStage: true, gymId: true }
      });

      if (!lead) {
        return { success: false, error: 'Lead not found' };
      }

      const fromStage = lead.currentStage as LeadStage;
      const toStage = data.toStage;

      // Validate transition
      if (!this.isValidTransition(fromStage, toStage)) {
        return {
          success: false,
          error: `Invalid transition from ${fromStage} to ${toStage}`
        };
      }

      // Perform transaction to update lead and log journey
      await prisma.$transaction(async (tx) => {
        // Update lead stage and contact tracking
        await tx.lead.update({
          where: { id: data.leadId },
          data: {
            currentStage: toStage,
            lastContactAt: new Date(),
            lastContactChannel: data.channel || null,
            contactAttempts: fromStage === 'new' ? 1 : undefined, // Reset on first contact
            // Update converted/lost timestamps
            convertedAt: toStage === 'converted' ? new Date() : undefined,
            updatedAt: new Date(),
          },
        });

        // Log the journey step
        await tx.leadJourney.create({
          data: {
            leadId: data.leadId,
            stage: toStage,
            fromStage: fromStage,
            channel: data.channel || null,
            action: data.action,
            message: data.message || null,
            metadata: {
              userId: data.userId,
              timestamp: new Date().toISOString(),
              ...data.metadata,
            },
          },
        });
      });

      console.log(`[Lead Pipeline] ${data.leadId}: ${fromStage} → ${toStage} via ${data.channel || 'system'}`);

      return { success: true };
    } catch (error) {
      console.error(`[Lead Pipeline] Failed to advance ${data.leadId}:`, error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Get lead journey with all steps
   */
  async getLeadJourney(leadId: string) {
    try {
      const journey = await prisma.leadJourney.findMany({
        where: { leadId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          stage: true,
          fromStage: true,
          channel: true,
          action: true,
          message: true,
          metadata: true,
          createdAt: true,
        }
      });

      return journey.map(step => ({
        ...step,
        stageInfo: LeadPipelineService.STAGE_DESCRIPTIONS[step.stage as LeadStage],
        fromStageInfo: step.fromStage
          ? LeadPipelineService.STAGE_DESCRIPTIONS[step.fromStage as LeadStage]
          : null,
      }));
    } catch (error) {
      console.error(`[Lead Pipeline] Failed to get journey for ${leadId}:`, error);
      return [];
    }
  }

  /**
   * Get pipeline stats for a gym
   */
  async getPipelineStats(gymId: string) {
    try {
      const stats = await prisma.lead.groupBy({
        by: ['currentStage'],
        where: { gymId },
        _count: { currentStage: true },
      });

      const result: Record<string, number> = {};
      stats.forEach(stat => {
        result[stat.currentStage] = stat._count.currentStage;
      });

      // Ensure all stages are represented
      Object.keys(LeadPipelineService.STAGE_DESCRIPTIONS).forEach(stage => {
        if (!result[stage]) result[stage] = 0;
      });

      return result;
    } catch (error) {
      console.error(`[Lead Pipeline] Failed to get stats for gym ${gymId}:`, error);
      return {};
    }
  }

  /**
   * Get leads by stage for Kanban view
   */
  async getLeadsByStage(gymId: string, stage?: LeadStage) {
    try {
      const where: any = { gymId };
      if (stage) where.currentStage = stage;

      const leads = await prisma.lead.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          currentStage: true,
          score: true,
          source: true,
          lastContactAt: true,
          lastContactChannel: true,
          contactAttempts: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [
          { score: 'desc' },
          { lastContactAt: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return leads.map(lead => ({
        ...lead,
        stageInfo: LeadPipelineService.STAGE_DESCRIPTIONS[lead.currentStage as LeadStage],
      }));
    } catch (error) {
      console.error(`[Lead Pipeline] Failed to get leads for gym ${gymId}:`, error);
      return [];
    }
  }

  /**
   * Increment contact attempts for a lead
   */
  async incrementContactAttempts(leadId: string, channel: Channel) {
    try {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          contactAttempts: { increment: 1 },
          lastContactAt: new Date(),
          lastContactChannel: channel,
        },
      });
    } catch (error) {
      console.error(`[Lead Pipeline] Failed to increment contact attempts for ${leadId}:`, error);
    }
  }

  /**
   * Check if a stage transition is valid
   */
  private isValidTransition(from: LeadStage, to: LeadStage): boolean {
    if (from === to) return false; // No same-stage transitions
    return LeadPipelineService.VALID_TRANSITIONS[from]?.includes(to) || false;
  }

  /**
   * Get next possible stages for a lead
   */
  getNextStages(currentStage: LeadStage): LeadStage[] {
    return LeadPipelineService.VALID_TRANSITIONS[currentStage] || [];
  }

  /**
   * Quick stage advance helpers for common transitions
   */
  async markContacted(leadId: string, channel: Channel, message?: string, userId?: string) {
    return this.advanceStage({
      leadId,
      toStage: 'contacted',
      channel,
      action: 'outreach',
      message,
      userId,
    });
  }

  async markEngaged(leadId: string, channel: Channel, message?: string, userId?: string) {
    return this.advanceStage({
      leadId,
      toStage: 'engaged',
      channel,
      action: 'response',
      message,
      userId,
    });
  }

  async markBooked(leadId: string, channel: Channel = 'system', userId?: string) {
    return this.advanceStage({
      leadId,
      toStage: 'booked',
      channel,
      action: 'booking',
      message: 'Visit scheduled',
      userId,
    });
  }

  async markVisited(leadId: string, userId?: string) {
    return this.advanceStage({
      leadId,
      toStage: 'visited',
      channel: 'system',
      action: 'visit',
      message: 'Attended scheduled visit',
      userId,
    });
  }

  async markConverted(leadId: string, userId?: string) {
    return this.advanceStage({
      leadId,
      toStage: 'converted',
      channel: 'system',
      action: 'stage_change',
      message: 'Lead converted to member',
      userId,
    });
  }

  async markLost(leadId: string, reason: string, userId?: string) {
    return this.advanceStage({
      leadId,
      toStage: 'lost',
      channel: 'manual',
      action: 'stage_change',
      message: `Marked as lost: ${reason}`,
      metadata: { lostReason: reason },
      userId,
    });
  }
}

// Export singleton instance
export const leadPipeline = new LeadPipelineService();