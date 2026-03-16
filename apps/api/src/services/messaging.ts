import { prisma } from '../lib/prisma';
import { Channel } from './lead-pipeline';

export type MessageType = 'initial_outreach' | 'follow_up' | 'booking_confirmation' | 'reminder' | 'thank_you' | 'win_back';
export type MessagePriority = 'high' | 'normal' | 'low';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'dry_run';

interface MessageData {
  to: string;
  content: string;
  type: MessageType;
  priority?: MessagePriority;
  metadata?: Record<string, any>;
}

interface MessageResult {
  success: boolean;
  channel?: Channel;
  messageId?: string;
  cost?: number;
  error?: string;
  dryRun: boolean;
}

interface ChannelConfig {
  channel: Channel;
  enabled: boolean;
  priority: number; // Lower number = higher priority
  rateLimits: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  costPerMessage: number; // USD
}

interface ContactInfo {
  phone?: string;
  email?: string;
  preferredChannel?: Channel;
  unsubscribed?: Channel[]; // Channels they've opted out of
}

export class MessagingService {
  /**
   * Channel configuration - WhatsApp -> Email -> SMS priority
   */
  private static readonly CHANNEL_CONFIG: ChannelConfig[] = [
    {
      channel: 'whatsapp',
      enabled: true,
      priority: 1,
      rateLimits: { perMinute: 10, perHour: 100, perDay: 1000 },
      costPerMessage: 0.005, // $0.005 per WhatsApp message
    },
    {
      channel: 'email',
      enabled: true,
      priority: 2,
      rateLimits: { perMinute: 50, perHour: 1000, perDay: 10000 },
      costPerMessage: 0.0001, // $0.0001 per email
    },
    {
      channel: 'sms',
      enabled: true,
      priority: 3,
      rateLimits: { perMinute: 5, perHour: 50, perDay: 500 },
      costPerMessage: 0.02, // $0.02 per SMS
    },
  ];

  /**
   * Message templates for different types
   */
  private static readonly MESSAGE_TEMPLATES: Record<MessageType, { subject?: string; template: string }> = {
    initial_outreach: {
      subject: 'Welcome to {{gymName}}!',
      template: 'Hi {{name}}! Thanks for your interest in {{gymName}}. I\'d love to help answer any questions and show you around. When would be a good time for a quick tour? 💪'
    },
    follow_up: {
      subject: 'Still interested in {{gymName}}?',
      template: 'Hi {{name}}, just checking in! Are you still interested in visiting {{gymName}}? I have some time slots available this week if you\'d like to schedule a tour. Let me know what works for you!'
    },
    booking_confirmation: {
      subject: 'Your visit to {{gymName}} is confirmed!',
      template: 'Perfect! Your {{bookingType}} at {{gymName}} is confirmed for {{date}} at {{time}}. Address: {{address}}. Looking forward to meeting you! Any questions, just reply.'
    },
    reminder: {
      subject: 'Reminder: Your {{gymName}} visit tomorrow',
      template: 'Hi {{name}}! Just a friendly reminder that you have a {{bookingType}} scheduled tomorrow ({{date}}) at {{time}}. See you soon at {{gymName}}! 🎯'
    },
    thank_you: {
      subject: 'Thanks for visiting {{gymName}}!',
      template: 'Thanks for visiting {{gymName}} today! It was great meeting you. I\'d love to help you get started with a membership. When can we chat about next steps?'
    },
    win_back: {
      subject: 'We miss you at {{gymName}}',
      template: 'Hi {{name}}, we haven\'t heard from you in a while. Is there anything I can help with regarding your fitness goals? We have some new programs that might interest you!'
    },
  };

  /**
   * Send message with channel fallback priority
   * ALL MESSAGES ARE DRY-RUN - NO ACTUAL SENDING
   */
  async sendMessage(
    leadId: string,
    messageData: MessageData,
    contactInfo: ContactInfo
  ): Promise<MessageResult> {
    try {
      // Get lead and gym info for context
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { gym: { select: { name: true, settings: true } } }
      });

      if (!lead) {
        return { success: false, error: 'Lead not found', dryRun: true };
      }

      // Determine best channel
      const bestChannel = this.selectBestChannel(contactInfo);

      if (!bestChannel) {
        return {
          success: false,
          error: 'No available channels for contact',
          dryRun: true
        };
      }

      // Check rate limits
      const rateLimitOk = await this.checkRateLimits(lead.gymId, bestChannel);
      if (!rateLimitOk) {
        return {
          success: false,
          error: `Rate limit exceeded for ${bestChannel}`,
          dryRun: true
        };
      }

      // Process message content
      const processedContent = this.processMessageTemplate(
        messageData.content,
        messageData.type,
        {
          name: lead.name || 'there',
          gymName: lead.gym.name,
          ...messageData.metadata
        }
      );

      // DRY RUN - Log what would be sent
      const result = await this.dryRunSendMessage(
        bestChannel,
        messageData.to,
        processedContent,
        messageData.type
      );

      // Store message record for tracking
      await this.logMessage(leadId, bestChannel, processedContent, messageData.type, result);

      // Update rate limit tracking
      await this.updateRateLimitTracking(lead.gymId, bestChannel);

      console.log(`[Messaging] DRY RUN - Would send ${messageData.type} via ${bestChannel} to ${messageData.to.slice(0, 4)}****`);

      return result;
    } catch (error) {
      console.error(`[Messaging] Error sending message to lead ${leadId}:`, error);
      return {
        success: false,
        error: 'Message sending failed',
        dryRun: true
      };
    }
  }

  /**
   * Send initial outreach message to a new lead
   */
  async sendInitialOutreach(leadId: string): Promise<MessageResult> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          name: true,
          email: true,
          phone: true,
          preferredChannel: true,
          gym: { select: { name: true } }
        }
      });

      if (!lead) {
        return { success: false, error: 'Lead not found', dryRun: true };
      }

      const contactInfo: ContactInfo = {
        phone: lead.phone || undefined,
        email: lead.email || undefined,
        preferredChannel: lead.preferredChannel as Channel || undefined,
      };

      const target = contactInfo.phone || contactInfo.email;
      if (!target) {
        return { success: false, error: 'No contact information available', dryRun: true };
      }

      return await this.sendMessage(leadId, {
        to: target,
        content: MessagingService.MESSAGE_TEMPLATES.initial_outreach.template,
        type: 'initial_outreach',
        priority: 'high',
        metadata: { gymName: lead.gym.name }
      }, contactInfo);
    } catch (error) {
      console.error(`[Messaging] Error sending initial outreach to lead ${leadId}:`, error);
      return { success: false, error: 'Failed to send initial outreach', dryRun: true };
    }
  }

  /**
   * Send booking confirmation
   */
  async sendBookingConfirmation(
    leadId: string,
    bookingDetails: {
      date: string;
      time: string;
      type: string;
      address?: string;
    }
  ): Promise<MessageResult> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          name: true,
          email: true,
          phone: true,
          preferredChannel: true,
          gym: { select: { name: true, settings: true } }
        }
      });

      if (!lead) {
        return { success: false, error: 'Lead not found', dryRun: true };
      }

      const contactInfo: ContactInfo = {
        phone: lead.phone || undefined,
        email: lead.email || undefined,
        preferredChannel: lead.preferredChannel as Channel || undefined,
      };

      const target = contactInfo.phone || contactInfo.email;
      if (!target) {
        return { success: false, error: 'No contact information available', dryRun: true };
      }

      const gymSettings = (lead.gym.settings as any) || {};
      const address = gymSettings.address || 'See gym details for address';

      return await this.sendMessage(leadId, {
        to: target,
        content: MessagingService.MESSAGE_TEMPLATES.booking_confirmation.template,
        type: 'booking_confirmation',
        priority: 'high',
        metadata: {
          gymName: lead.gym.name,
          bookingType: bookingDetails.type,
          date: bookingDetails.date,
          time: bookingDetails.time,
          address: address
        }
      }, contactInfo);
    } catch (error) {
      console.error(`[Messaging] Error sending booking confirmation to lead ${leadId}:`, error);
      return { success: false, error: 'Failed to send booking confirmation', dryRun: true };
    }
  }

  /**
   * Send follow-up message
   */
  async sendFollowUp(leadId: string, customMessage?: string): Promise<MessageResult> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: {
          name: true,
          email: true,
          phone: true,
          preferredChannel: true,
          gym: { select: { name: true } }
        }
      });

      if (!lead) {
        return { success: false, error: 'Lead not found', dryRun: true };
      }

      const contactInfo: ContactInfo = {
        phone: lead.phone || undefined,
        email: lead.email || undefined,
        preferredChannel: lead.preferredChannel as Channel || undefined,
      };

      const target = contactInfo.phone || contactInfo.email;
      if (!target) {
        return { success: false, error: 'No contact information available', dryRun: true };
      }

      const content = customMessage || MessagingService.MESSAGE_TEMPLATES.follow_up.template;

      return await this.sendMessage(leadId, {
        to: target,
        content,
        type: 'follow_up',
        priority: 'normal',
        metadata: { gymName: lead.gym.name }
      }, contactInfo);
    } catch (error) {
      console.error(`[Messaging] Error sending follow-up to lead ${leadId}:`, error);
      return { success: false, error: 'Failed to send follow-up', dryRun: true };
    }
  }

  /**
   * Select best channel based on availability and preference
   */
  private selectBestChannel(contactInfo: ContactInfo): Channel | null {
    // Start with preferred channel if available
    if (contactInfo.preferredChannel && this.isChannelAvailable(contactInfo, contactInfo.preferredChannel)) {
      return contactInfo.preferredChannel;
    }

    // Fall back to priority order
    const availableChannels = MessagingService.CHANNEL_CONFIG
      .filter(config => config.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const config of availableChannels) {
      if (this.isChannelAvailable(contactInfo, config.channel)) {
        return config.channel;
      }
    }

    return null;
  }

  /**
   * Check if a channel is available for contact
   */
  private isChannelAvailable(contactInfo: ContactInfo, channel: Channel): boolean {
    // Check if unsubscribed
    if (contactInfo.unsubscribed?.includes(channel)) {
      return false;
    }

    // Check if contact info is available
    switch (channel) {
      case 'whatsapp':
      case 'sms':
        return !!contactInfo.phone;
      case 'email':
        return !!contactInfo.email;
      case 'call':
        return !!contactInfo.phone;
      default:
        return false;
    }
  }

  /**
   * DRY RUN message sending - just logs what would be sent
   */
  private async dryRunSendMessage(
    channel: Channel,
    to: String,
    content: string,
    type: MessageType
  ): Promise<MessageResult> {
    const channelConfig = MessagingService.CHANNEL_CONFIG.find(c => c.channel === channel);
    const cost = channelConfig?.costPerMessage || 0;

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    // Log the dry run
    console.log(`[Messaging] DRY RUN ${channel.toUpperCase()}`);
    console.log(`  To: ${to.slice(0, 4)}****`);
    console.log(`  Type: ${type}`);
    console.log(`  Content: ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`);
    console.log(`  Estimated Cost: $${cost.toFixed(4)}`);

    return {
      success: true,
      channel,
      messageId: `dry_run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      cost,
      dryRun: true
    };
  }

  /**
   * Process message template with variables
   */
  private processMessageTemplate(
    content: string,
    type: MessageType,
    variables: Record<string, any>
  ): string {
    let processed = content;

    // Replace template variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, String(value || ''));
    });

    // Clean up any remaining unfilled templates
    processed = processed.replace(/\{\{[^}]+\}\}/g, '');

    return processed.trim();
  }

  /**
   * Check rate limits for a channel (mock implementation)
   */
  private async checkRateLimits(gymId: string, channel: Channel): Promise<boolean> {
    // In production, this would check Redis or database for rate limit tracking
    // For now, always return true in dry run mode
    return true;
  }

  /**
   * Update rate limit tracking (mock implementation)
   */
  private async updateRateLimitTracking(gymId: string, channel: Channel): Promise<void> {
    // In production, this would increment rate limit counters in Redis
    // For now, just log
    console.log(`[Messaging] Rate limit tracking updated for ${gymId}/${channel}`);
  }

  /**
   * Log message for audit trail
   */
  private async logMessage(
    leadId: string,
    channel: Channel,
    content: string,
    type: MessageType,
    result: MessageResult
  ): Promise<void> {
    try {
      // Store in conversation/message table
      const conversation = await prisma.conversation.findFirst({
        where: { leadId },
      });

      if (conversation) {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'outbound',
            content,
            contentType: 'text',
            metadata: {
              channel,
              messageType: type,
              messageId: result.messageId,
              cost: result.cost,
              dryRun: result.dryRun,
              status: result.success ? 'dry_run' : 'failed',
              error: result.error,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }
    } catch (error) {
      console.error(`[Messaging] Failed to log message for lead ${leadId}:`, error);
    }
  }

  /**
   * Get messaging stats for a gym
   */
  async getMessagingStats(gymId: string, dateRange?: { from: Date; to: Date }) {
    try {
      // This would be implemented to pull stats from the message logs
      // For now, return mock data
      return {
        totalMessages: 0,
        byChannel: {
          whatsapp: 0,
          email: 0,
          sms: 0,
        },
        totalCost: 0,
        successRate: 100, // 100% in dry run mode
        dryRun: true,
      };
    } catch (error) {
      console.error(`[Messaging] Error getting stats for gym ${gymId}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const messagingService = new MessagingService();