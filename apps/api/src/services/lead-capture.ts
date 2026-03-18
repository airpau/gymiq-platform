import { prisma } from '../lib/prisma';
import { leadPipeline, LeadStage } from './lead-pipeline';
import { z } from 'zod';

export type LeadSourceType = 'email_parser' | 'webhook' | 'manual' | 'zapier' | 'form';

interface LeadSourceConfig {
  id: string;
  type: LeadSourceType;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

interface CapturedLeadData {
  source: string;
  sourceDetail?: string;
  name?: string;
  email?: string;
  phone?: string;
  metadata?: Record<string, any>;
  stage?: LeadStage;
  triggerFollowup?: boolean;
}

// Validation schemas
const WebhookLeadSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  source: z.string().default('web_form'),
  sourceDetail: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const EmailParserConfig = z.object({
  host: z.string(),
  port: z.number().default(993),
  user: z.string(),
  password: z.string(),
  tls: z.boolean().default(true),
  folder: z.string().default('INBOX'),
  searchCriteria: z.array(z.string()).default(['UNSEEN']),
  subjectPatterns: z.array(z.string()), // Regex patterns to match
});

export class LeadCaptureService {
  /**
   * Capture a lead from any source and create in pipeline
   */
  async captureLead(gymId: string, leadData: CapturedLeadData): Promise<{ success: boolean; leadId?: string; error?: string }> {
    try {
      // Validate gym exists
      const gym = await prisma.gym.findUnique({
        where: { id: gymId },
        select: { id: true, settings: true }
      });

      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }

      // Check for duplicate leads (same email or phone)
      if (leadData.email || leadData.phone) {
        const orConditions: any[] = [];
        if (leadData.email) {
          orConditions.push({ email: leadData.email });
        }
        if (leadData.phone) {
          orConditions.push({ phone: leadData.phone });
        }

        const existingLead = await prisma.lead.findFirst({
          where: {
            gymId,
            OR: orConditions,
          },
          select: { id: true, currentStage: true },
        });

        if (existingLead) {
          // Re-engage existing lead if lost or nurturing
          if (existingLead.currentStage === 'lost' || existingLead.currentStage === 'nurturing') {
            const result = await leadPipeline.advanceStage({
              leadId: existingLead.id,
              toStage: 'new',
              channel: 'system',
              action: 'stage_change',
              message: `Re-engaged from ${leadData.source}`,
              metadata: leadData.metadata,
            });

            if (result.success) {
              console.log(`[Lead Capture] Re-engaged existing lead ${existingLead.id} from ${leadData.source}`);
              return { success: true, leadId: existingLead.id };
            }
          } else {
            // Update existing lead with new source information
            await prisma.leadJourney.create({
              data: {
                leadId: existingLead.id,
                stage: existingLead.currentStage,
                fromStage: existingLead.currentStage,
                channel: 'system',
                action: 'stage_change',
                message: `Additional contact from ${leadData.source}`,
                metadata: {
                  ...leadData.metadata,
                  duplicateSource: true,
                },
              },
            });

            return { success: true, leadId: existingLead.id };
          }
        }
      }

      // Create new lead
      const lead = await prisma.lead.create({
        data: {
          gymId,
          source: leadData.source,
          sourceDetail: leadData.sourceDetail,
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          currentStage: leadData.stage || 'new',
          enquiryDate: new Date(),
          metadata: leadData.metadata || {},
        },
      });

      // Create initial journey entry
      await prisma.leadJourney.create({
        data: {
          leadId: lead.id,
          stage: lead.currentStage,
          fromStage: null, // Initial entry
          channel: 'system',
          action: 'outreach',
          message: `Lead captured from ${leadData.source}`,
          metadata: {
            sourceDetail: leadData.sourceDetail,
            capturedAt: new Date().toISOString(),
            ...leadData.metadata,
          },
        },
      });

      console.log(`[Lead Capture] New lead ${lead.id} from ${leadData.source}: ${leadData.name || leadData.email || leadData.phone || 'Unknown'}`);

      // Trigger follow-up if configured
      if (leadData.triggerFollowup && (leadData.source === 'abandoned_cart' || leadData.source === 'web_form') && lead.phone) {
        // This will be handled by the workflow engine when it's available
        console.log(`[Lead Capture] Follow-up triggered for ${lead.id}`);
      }

      return { success: true, leadId: lead.id };
    } catch (error) {
      console.error(`[Lead Capture] Failed to capture lead for gym ${gymId}:`, error);
      return { success: false, error: 'Failed to create lead' };
    }
  }

  /**
   * Process webhook lead capture
   */
  async processWebhookLead(gymId: string, webhookId: string, rawData: any) {
    try {
      // Validate webhook data
      const parsed = WebhookLeadSchema.safeParse(rawData);
      if (!parsed.success) {
        return {
          success: false,
          error: 'Invalid webhook data',
          details: parsed.error.flatten()
        };
      }

      const leadData: CapturedLeadData = {
        ...parsed.data,
        sourceDetail: webhookId,
        triggerFollowup: true,
        metadata: {
          ...parsed.data.metadata,
          webhookId,
          receivedAt: new Date().toISOString(),
          rawData: rawData,
        },
      };

      return await this.captureLead(gymId, leadData);
    } catch (error) {
      console.error(`[Lead Capture] Webhook processing failed:`, error);
      return { success: false, error: 'Webhook processing error' };
    }
  }

  /**
   * Email parser for abandoned carts and similar automated emails
   * TODO: Implement with imap and mailparser dependencies when ready for production
   */
  async processEmailLeads(gymId: string): Promise<{ processed: number; errors: number }> {
    console.log(`[Email Parser] Email parsing not yet implemented for gym ${gymId}`);
    console.log(`[Email Parser] To implement: install 'imap' and 'mailparser' dependencies`);

    // Return placeholder response
    return { processed: 0, errors: 0 };
  }

  /**
   * Placeholder for email parsing functionality
   * TODO: Implement when email parsing dependencies are added
   */
  private parseEmailForLead(email: any, sourceName: string): CapturedLeadData | null {
    console.log('[Email Parser] Email parsing functionality requires imap and mailparser packages');
    return null;
  }

  /**
   * Get lead sources configuration for a gym
   */
  async getLeadSources(gymId: string): Promise<LeadSourceConfig[]> {
    try {
      const gym = await prisma.gym.findUnique({
        where: { id: gymId },
        select: { settings: true }
      });

      if (!gym?.settings) {
        return [];
      }

      const settings = gym.settings as any;
      return settings.leadSources || [];
    } catch (error) {
      console.error(`[Lead Capture] Failed to get lead sources for gym ${gymId}:`, error);
      return [];
    }
  }

  /**
   * Update lead sources configuration for a gym
   */
  async updateLeadSources(gymId: string, leadSources: LeadSourceConfig[]): Promise<{ success: boolean; error?: string }> {
    try {
      const gym = await prisma.gym.findUnique({
        where: { id: gymId },
        select: { settings: true }
      });

      if (!gym) {
        return { success: false, error: 'Gym not found' };
      }

      const currentSettings = (gym.settings as any) || {};
      const newSettings = {
        ...currentSettings,
        leadSources,
        updatedAt: new Date().toISOString(),
      };

      await prisma.gym.update({
        where: { id: gymId },
        data: { settings: newSettings },
      });

      console.log(`[Lead Capture] Updated lead sources for gym ${gymId}`);
      return { success: true };
    } catch (error) {
      console.error(`[Lead Capture] Failed to update lead sources for gym ${gymId}:`, error);
      return { success: false, error: 'Failed to update configuration' };
    }
  }

  /**
   * Generate webhook URL for a gym
   */
  getWebhookUrl(gymId: string, webhookId: string): string {
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
    return `${baseUrl}/api/leads/capture/webhook/${gymId}/${webhookId}`;
  }

  /**
   * Validate webhook signature (implement based on your security requirements)
   */
  validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // Implement signature validation based on your webhook provider
    // This is a placeholder implementation
    return true;
  }
}

// Export singleton instance
export const leadCapture = new LeadCaptureService();