import { prisma } from '../lib/prisma';

export interface MessageTemplate {
  id: string;
  gymId?: string;
  name: string;
  category: 'welcome' | 'booking' | 'retention' | 'payment' | 'cancel_save' | 'nurture' | 'recovery';
  channel: 'whatsapp' | 'email' | 'sms';
  variants: Array<{
    id: string;
    content: string;
    variables: string[];
    active: boolean;
    performance?: {
      sent: number;
      opened?: number;
      replied: number;
      converted: number;
      conversionRate: number;
    };
  }>;
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalConverted: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface TemplateVariable {
  name: string;
  description: string;
  example: string;
  required: boolean;
}

export interface ABTestResult {
  templateId: string;
  bestVariantId: string;
  confidenceLevel: number;
  recommendedAction: 'keep_testing' | 'promote_winner' | 'create_new_variant';
  stats: {
    [variantId: string]: {
      sent: number;
      replied: number;
      converted: number;
      replyRate: number;
      conversionRate: number;
    };
  };
}

export class MessageTemplatesService {
  /**
   * Parse variants from Prisma JSON field
   */
  private parseVariants(variants: any): MessageTemplate['variants'] {
    if (Array.isArray(variants)) {
      return variants as MessageTemplate['variants'];
    }
    return [];
  }
  /**
   * Get all templates for a gym
   */
  async getTemplates(gymId: string, category?: string, channel?: string) {
    try {
      const where: any = {
        OR: [
          { gymId: gymId },
          { gymId: null, isDefault: true } // Include default templates
        ],
        isActive: true
      };

      if (category) where.category = category;
      if (channel) where.channel = channel;

      const templates = await prisma.messageTemplate.findMany({
        where,
        orderBy: [
          { isDefault: 'asc' }, // Gym-specific first
          { name: 'asc' }
        ]
      });

      return templates.map(template => ({
        id: template.id,
        gymId: template.gymId || undefined,
        name: template.name,
        category: template.category as MessageTemplate['category'],
        channel: template.channel as MessageTemplate['channel'],
        variants: this.parseVariants(template.variants),
        totalSent: template.totalSent,
        totalOpened: template.totalOpened,
        totalReplied: template.totalReplied,
        totalConverted: template.totalConverted,
        isDefault: template.isDefault,
        isActive: template.isActive
      }));
    } catch (error) {
      console.error('[Message Templates] Get templates error:', error);
      return [];
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string): Promise<MessageTemplate | null> {
    try {
      const template = await prisma.messageTemplate.findUnique({
        where: { id: templateId }
      });

      if (!template) return null;

      return {
        id: template.id,
        gymId: template.gymId || undefined,
        name: template.name,
        category: template.category as MessageTemplate['category'],
        channel: template.channel as MessageTemplate['channel'],
        variants: this.parseVariants(template.variants),
        totalSent: template.totalSent,
        totalOpened: template.totalOpened,
        totalReplied: template.totalReplied,
        totalConverted: template.totalConverted,
        isDefault: template.isDefault,
        isActive: template.isActive
      };
    } catch (error) {
      console.error('[Message Templates] Get template error:', error);
      return null;
    }
  }

  /**
   * Create new template
   */
  async createTemplate(
    gymId: string | null,
    templateData: {
      name: string;
      category: MessageTemplate['category'];
      channel: MessageTemplate['channel'];
      variants: Array<{
        content: string;
        variables: string[];
        active?: boolean;
      }>;
      isDefault?: boolean;
    }
  ): Promise<string | null> {
    try {
      const variants = templateData.variants.map((variant, index) => ({
        id: `variant_${index + 1}`,
        ...variant,
        active: variant.active ?? true,
        performance: {
          sent: 0,
          opened: 0,
          replied: 0,
          converted: 0,
          conversionRate: 0
        }
      }));

      const template = await prisma.messageTemplate.create({
        data: {
          gymId,
          name: templateData.name,
          category: templateData.category,
          channel: templateData.channel,
          variants,
          isDefault: templateData.isDefault || false,
          isActive: true,
          totalSent: 0,
          totalOpened: 0,
          totalReplied: 0,
          totalConverted: 0
        }
      });

      return template.id;
    } catch (error) {
      console.error('[Message Templates] Create template error:', error);
      return null;
    }
  }

  /**
   * Update template
   */
  async updateTemplate(
    templateId: string,
    updates: Partial<{
      name: string;
      variants: MessageTemplate['variants'];
      isActive: boolean;
    }>
  ): Promise<boolean> {
    try {
      await prisma.messageTemplate.update({
        where: { id: templateId },
        data: updates
      });

      return true;
    } catch (error) {
      console.error('[Message Templates] Update template error:', error);
      return false;
    }
  }

  /**
   * Get template for A/B testing - randomly selects variant
   */
  async getTemplateVariantForABTest(
    gymId: string,
    category: MessageTemplate['category'],
    channel: MessageTemplate['channel'],
    userId?: string
  ): Promise<{
    templateId: string;
    variantId: string;
    content: string;
    variables: string[];
  } | null> {
    try {
      const templates = await this.getTemplates(gymId, category, channel);

      if (templates.length === 0) {
        return null;
      }

      // Prefer gym-specific templates over defaults
      const template = templates.find(t => t.gymId === gymId) || templates[0];

      if (!template || template.variants.length === 0) {
        return null;
      }

      const variants = this.parseVariants(template.variants);

      // Get active variants
      const activeVariants = variants.filter(v => v.active);
      if (activeVariants.length === 0) {
        return null;
      }

      // Select variant using deterministic randomization (if userId provided) or pure random
      let selectedVariant;
      if (userId) {
        // Deterministic selection based on user ID for consistent experience
        const hash = this.simpleHash(userId + template.id);
        selectedVariant = activeVariants[hash % activeVariants.length];
      } else {
        // Random selection
        selectedVariant = activeVariants[Math.floor(Math.random() * activeVariants.length)];
      }

      return {
        templateId: template.id,
        variantId: selectedVariant.id,
        content: selectedVariant.content,
        variables: selectedVariant.variables
      };
    } catch (error) {
      console.error('[Message Templates] Get A/B test variant error:', error);
      return null;
    }
  }

  /**
   * Render template with variables
   */
  renderTemplate(
    content: string,
    variables: Record<string, string>
  ): string {
    let renderedContent = content;

    // Replace variables in format {variable_name}
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      renderedContent = renderedContent.replace(regex, value || '');
    });

    // Clean up any remaining unreplaced variables
    renderedContent = renderedContent.replace(/\{[^}]+\}/g, '');

    return renderedContent.trim();
  }

  /**
   * Track template performance
   */
  async trackTemplatePerformance(
    templateId: string,
    variantId: string,
    action: 'sent' | 'opened' | 'replied' | 'converted',
    increment: number = 1
  ): Promise<boolean> {
    try {
      const template = await prisma.messageTemplate.findUnique({
        where: { id: templateId }
      });

      if (!template) return false;

      const variants = this.parseVariants(template.variants);
      const updatedVariants = variants.map(variant => {
        if (variant.id === variantId) {
          const performance = variant.performance || {
            sent: 0,
            opened: 0,
            replied: 0,
            converted: 0,
            conversionRate: 0
          };

          performance[action] = (performance[action] || 0) + increment;

          // Update conversion rate
          if (performance.sent > 0) {
            performance.conversionRate = (performance.converted / performance.sent) * 100;
          }

          return {
            ...variant,
            performance
          };
        }
        return variant;
      });

      // Update template totals
      const updateData: any = { variants: updatedVariants };

      switch (action) {
        case 'sent':
          updateData.totalSent = template.totalSent + increment;
          break;
        case 'opened':
          updateData.totalOpened = template.totalOpened + increment;
          break;
        case 'replied':
          updateData.totalReplied = template.totalReplied + increment;
          break;
        case 'converted':
          updateData.totalConverted = template.totalConverted + increment;
          break;
      }

      await prisma.messageTemplate.update({
        where: { id: templateId },
        data: updateData
      });

      return true;
    } catch (error) {
      console.error('[Message Templates] Track performance error:', error);
      return false;
    }
  }

  /**
   * Analyze A/B test results
   */
  async analyzeABTest(templateId: string): Promise<ABTestResult | null> {
    try {
      const template = await this.getTemplate(templateId);
      if (!template) return null;

      const variants = this.parseVariants(template.variants).filter(v => v.active && v.performance);
      if (variants.length < 2) return null;

      // Calculate stats for each variant
      const stats: ABTestResult['stats'] = {};
      let bestVariant: { id: string; conversionRate: number } | null = null;

      variants.forEach(variant => {
        const perf = variant.performance!;
        const replyRate = perf.sent > 0 ? (perf.replied / perf.sent) * 100 : 0;
        const conversionRate = perf.sent > 0 ? (perf.converted / perf.sent) * 100 : 0;

        stats[variant.id] = {
          sent: perf.sent,
          replied: perf.replied,
          converted: perf.converted,
          replyRate,
          conversionRate
        };

        if (!bestVariant || conversionRate > bestVariant.conversionRate) {
          bestVariant = { id: variant.id, conversionRate };
        }
      });

      // Simple statistical significance check
      const totalSent = Object.values(stats).reduce((sum, s) => sum + s.sent, 0);
      const confidenceLevel = this.calculateConfidenceLevel(stats);

      let recommendedAction: ABTestResult['recommendedAction'] = 'keep_testing';

      if (totalSent > 100 && confidenceLevel > 0.95) {
        recommendedAction = 'promote_winner';
      } else if (totalSent > 50 && confidenceLevel < 0.8) {
        recommendedAction = 'create_new_variant';
      }

      return {
        templateId,
        bestVariantId: bestVariant!.id,
        confidenceLevel,
        recommendedAction,
        stats
      };
    } catch (error) {
      console.error('[Message Templates] Analyze A/B test error:', error);
      return null;
    }
  }

  /**
   * Get template performance summary
   */
  async getTemplatePerformance(gymId: string, days: number = 30) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const templates = await this.getTemplates(gymId);

      return templates.map(template => {
        const totalSent = template.totalSent;
        const totalConverted = template.totalConverted;
        const conversionRate = totalSent > 0 ? (totalConverted / totalSent) * 100 : 0;

        const variants = this.parseVariants(template.variants);
        const bestVariant = variants
          .filter(v => v.performance && v.performance.sent > 0)
          .sort((a, b) => {
            const aRate = (a.performance!.converted / a.performance!.sent) * 100;
            const bRate = (b.performance!.converted / b.performance!.sent) * 100;
            return bRate - aRate;
          })[0];

        return {
          id: template.id,
          name: template.name,
          category: template.category,
          channel: template.channel,
          totalSent,
          totalConverted,
          conversionRate,
          variantCount: variants.length,
          bestVariant: bestVariant ? {
            id: bestVariant.id,
            conversionRate: (bestVariant.performance!.converted / bestVariant.performance!.sent) * 100
          } : null
        };
      });
    } catch (error) {
      console.error('[Message Templates] Get performance error:', error);
      return [];
    }
  }

  /**
   * Get available template variables for documentation
   */
  getAvailableVariables(): Record<MessageTemplate['category'], TemplateVariable[]> {
    return {
      welcome: [
        { name: 'name', description: 'Member/lead name', example: 'John', required: false },
        { name: 'gym_name', description: 'Gym name', example: 'Energie Fitness', required: true },
        { name: 'source', description: 'How they found us', example: 'website', required: false }
      ],
      booking: [
        { name: 'name', description: 'Member/lead name', example: 'Sarah', required: true },
        { name: 'gym_name', description: 'Gym name', example: 'Energie Fitness', required: true },
        { name: 'date', description: 'Booking date', example: '15th March', required: true },
        { name: 'time', description: 'Booking time', example: '10:00 AM', required: true },
        { name: 'type', description: 'Booking type', example: 'gym tour', required: true }
      ],
      retention: [
        { name: 'name', description: 'Member name', example: 'Mike', required: true },
        { name: 'gym_name', description: 'Gym name', example: 'Energie Fitness', required: true },
        { name: 'days_since_visit', description: 'Days since last visit', example: '14', required: false },
        { name: 'offer_name', description: 'Special offer', example: 'Recovery Zone Session', required: false }
      ],
      payment: [
        { name: 'name', description: 'Member name', example: 'Emma', required: true },
        { name: 'amount', description: 'Payment amount', example: '£39.99', required: true },
        { name: 'due_date', description: 'Payment due date', example: '20th March', required: true }
      ],
      cancel_save: [
        { name: 'name', description: 'Member name', example: 'Alex', required: true },
        { name: 'gym_name', description: 'Gym name', example: 'Energie Fitness', required: true },
        { name: 'offer_name', description: 'Retention offer', example: 'Classic Membership', required: false },
        { name: 'offer_price', description: 'Offer price', example: '£24.99', required: false }
      ],
      nurture: [
        { name: 'name', description: 'Lead name', example: 'Chris', required: true },
        { name: 'gym_name', description: 'Gym name', example: 'Energie Fitness', required: true },
        { name: 'days_since_inquiry', description: 'Days since inquiry', example: '7', required: false }
      ],
      recovery: [
        { name: 'name', description: 'Lead/member name', example: 'Sam', required: true },
        { name: 'gym_name', description: 'Gym name', example: 'Energie Fitness', required: true },
        { name: 'offer_name', description: 'Win-back offer', example: 'Free Trial Week', required: false }
      ]
    };
  }

  /**
   * Create default templates for a gym
   */
  async createDefaultTemplates(gymId: string) {
    try {
      const defaultTemplates = [
        {
          name: 'Welcome New Lead',
          category: 'welcome' as const,
          channel: 'whatsapp' as const,
          variants: [{
            content: 'Hi {name}! Welcome to {gym_name}! 👋 Thanks for your interest. I\'m here to answer any questions and help you get started. What would you like to know?',
            variables: ['name', 'gym_name']
          }]
        },
        {
          name: 'Booking Confirmation',
          category: 'booking' as const,
          channel: 'whatsapp' as const,
          variants: [{
            content: 'Perfect! Your {type} is confirmed for {date} at {time}. Looking forward to seeing you at {gym_name}! Any questions before then?',
            variables: ['name', 'type', 'date', 'time', 'gym_name']
          }]
        },
        {
          name: 'Light Check-in',
          category: 'retention' as const,
          channel: 'whatsapp' as const,
          variants: [{
            content: 'Hi {name}! Haven\'t seen you at {gym_name} in a while. Everything okay? Let me know if there\'s anything I can help with! 😊',
            variables: ['name', 'gym_name', 'days_since_visit']
          }]
        },
        {
          name: 'Cancel-Save Empathy',
          category: 'cancel_save' as const,
          channel: 'whatsapp' as const,
          variants: [{
            content: 'Hi {name}, I understand you\'re thinking about cancelling your membership. I\'d love to help you find a solution that works better for you. What\'s the main reason for wanting to cancel?',
            variables: ['name', 'gym_name']
          }]
        }
      ];

      for (const template of defaultTemplates) {
        await this.createTemplate(gymId, template);
      }

      return true;
    } catch (error) {
      console.error('[Message Templates] Create defaults error:', error);
      return false;
    }
  }

  /**
   * Simple hash function for deterministic A/B variant selection
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Simple confidence level calculation
   */
  private calculateConfidenceLevel(stats: ABTestResult['stats']): number {
    const variants = Object.values(stats);
    if (variants.length < 2) return 0;

    // Simple approach: higher sample sizes and bigger differences = higher confidence
    const totalSent = variants.reduce((sum, v) => sum + v.sent, 0);
    const conversionRates = variants.map(v => v.conversionRate);
    const maxRate = Math.max(...conversionRates);
    const minRate = Math.min(...conversionRates);
    const difference = maxRate - minRate;

    // Basic confidence score based on sample size and difference
    const sampleConfidence = Math.min(totalSent / 100, 1); // Max confidence at 100+ samples
    const differenceConfidence = Math.min(difference / 10, 1); // Max confidence at 10% difference

    return Math.min(sampleConfidence * differenceConfidence * 2, 1);
  }
}

// Export singleton instance
export const messageTemplatesService = new MessageTemplatesService();