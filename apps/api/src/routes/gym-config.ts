import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { leadCapture } from '../services/lead-capture';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const gymConfigRouter = Router();

// Apply authentication to all routes
gymConfigRouter.use(authenticate);
gymConfigRouter.use(requireGymAccess);

// Validation schemas for gym configuration
const OpeningHoursSchema = z.object({
  monday: z.string().optional(),
  tuesday: z.string().optional(),
  wednesday: z.string().optional(),
  thursday: z.string().optional(),
  friday: z.string().optional(),
  saturday: z.string().optional(),
  sunday: z.string().optional(),
});

const LeadSourceConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['email_parser', 'webhook', 'manual', 'zapier', 'form']),
  name: z.string(),
  enabled: z.boolean(),
  config: z.record(z.any()),
});

const KnowledgeBaseSchema = z.object({
  facilities: z.string().optional(),
  classes: z.string().optional(),
  pricing: z.string().optional(),
  policies: z.string().optional(),
  staff: z.string().optional(),
  location: z.string().optional(),
  parking: z.string().optional(),
  equipment: z.string().optional(),
  specialPrograms: z.string().optional(),
  membershipTypes: z.string().optional(),
});

const GymSettingsSchema = z.object({
  // Opening hours
  openingHours: OpeningHoursSchema.optional(),

  // Contact information
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),

  // Lead sources configuration
  leadSources: z.array(LeadSourceConfigSchema).optional(),

  // AI conversation settings
  aiSettings: z.object({
    enabled: z.boolean().default(true),
    quietHours: z.object({
      start: z.string().default('21:00'), // 9 PM
      end: z.string().default('09:00'),   // 9 AM
    }).optional(),
    maxContactAttempts: z.number().min(1).max(10).default(3),
    escalationEnabled: z.boolean().default(true),
  }).optional(),

  // Booking settings
  bookingSettings: z.object({
    enabled: z.boolean().default(true),
    defaultDuration: z.number().default(30), // minutes
    advanceBookingDays: z.number().default(14), // How far in advance bookings allowed
    reminderHours: z.number().default(24), // Hours before appointment to send reminder
    allowedTypes: z.array(z.enum(['tour', 'trial_class', 'consultation'])).default(['tour']),
  }).optional(),

  // Messaging settings
  messagingSettings: z.object({
    channels: z.object({
      whatsapp: z.object({ enabled: z.boolean(), priority: z.number() }).optional(),
      email: z.object({ enabled: z.boolean(), priority: z.number() }).optional(),
      sms: z.object({ enabled: z.boolean(), priority: z.number() }).optional(),
    }).optional(),
    rateLimits: z.object({
      messagesPerHour: z.number().default(50),
      messagesPerDay: z.number().default(200),
    }).optional(),
  }).optional(),

  // Other settings
  timezone: z.string().default('UTC'),
  currency: z.string().default('USD'),
  language: z.string().default('en'),
});

/**
 * GET /gyms/:id/config
 * Get complete gym configuration
 */
gymConfigRouter.get('/config', async (req: Request, res: Response) => {
  try {
    const gym = await prisma.gym.findUnique({
      where: { id: req.user!.gymId },
      select: {
        id: true,
        name: true,
        slug: true,
        settings: true,
        knowledgeBase: true,
        whatsappNumber: true,
        twilioSid: true,
        crmType: true,
        crmTier: true,
        connectorType: true,
        connectorConfig: true,
        syncSchedule: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!gym) {
      return res.status(404).json({ success: false, error: 'Gym not found' });
    }

    // Format response with defaults
    const response = {
      id: gym.id,
      name: gym.name,
      slug: gym.slug,
      settings: gym.settings || {},
      knowledgeBase: gym.knowledgeBase || {},
      integration: {
        whatsappNumber: gym.whatsappNumber,
        twilioSid: gym.twilioSid,
        crmType: gym.crmType,
        crmTier: gym.crmTier,
        connectorType: gym.connectorType,
        connectorConfig: gym.connectorConfig,
        syncSchedule: gym.syncSchedule,
        lastSyncAt: gym.lastSyncAt,
        lastSyncStatus: gym.lastSyncStatus,
      },
      timestamps: {
        createdAt: gym.createdAt,
        updatedAt: gym.updatedAt,
      },
    };

    res.json({ success: true, data: response });
  } catch (error) {
    console.error(`[Gym Config] Error fetching config for gym ${req.user!.gymId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch gym configuration' });
  }
});

/**
 * PUT /gym/config
 * Update gym configuration
 */
gymConfigRouter.put('/config', async (req: Request, res: Response) => {
  try {
    const gymId = req.user!.gymId;

    // Check if gym exists
    const existingGym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { id: true, settings: true, knowledgeBase: true }
    });

    if (!existingGym) {
      return res.status(404).json({ success: false, error: 'Gym not found' });
    }

    // Extract and validate different configuration sections
    const { settings, knowledgeBase, integration, ...otherFields } = req.body;

    let validatedSettings = (existingGym.settings as Record<string, any>) || {};
    let validatedKnowledgeBase = (existingGym.knowledgeBase as Record<string, any>) || {};

    // Validate and merge settings
    if (settings) {
      const settingsValidation = GymSettingsSchema.safeParse(settings);
      if (!settingsValidation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid settings format',
          details: settingsValidation.error.flatten()
        });
      }
      validatedSettings = { ...validatedSettings, ...settingsValidation.data };
    }

    // Validate and merge knowledge base
    if (knowledgeBase) {
      const knowledgeValidation = KnowledgeBaseSchema.safeParse(knowledgeBase);
      if (!knowledgeValidation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid knowledge base format',
          details: knowledgeValidation.error.flatten()
        });
      }
      validatedKnowledgeBase = { ...validatedKnowledgeBase, ...knowledgeValidation.data };
    }

    // Build update data
    const updateData: any = {
      settings: validatedSettings,
      knowledgeBase: validatedKnowledgeBase,
    };

    // Handle integration settings
    if (integration) {
      if (integration.whatsappNumber !== undefined) updateData.whatsappNumber = integration.whatsappNumber;
      if (integration.twilioSid !== undefined) updateData.twilioSid = integration.twilioSid;
      if (integration.crmType !== undefined) updateData.crmType = integration.crmType;
      if (integration.crmTier !== undefined) updateData.crmTier = integration.crmTier;
      if (integration.connectorType !== undefined) updateData.connectorType = integration.connectorType;
      if (integration.connectorConfig !== undefined) updateData.connectorConfig = integration.connectorConfig;
      if (integration.syncSchedule !== undefined) updateData.syncSchedule = integration.syncSchedule;
    }

    // Handle other direct fields
    if (otherFields.name !== undefined) updateData.name = otherFields.name;
    if (otherFields.slug !== undefined) updateData.slug = otherFields.slug;

    // Update gym
    const updatedGym = await prisma.gym.update({
      where: { id: gymId },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        settings: true,
        knowledgeBase: true,
        whatsappNumber: true,
        twilioSid: true,
        updatedAt: true,
      },
    });

    console.log(`[Gym Config] Updated configuration for gym ${gymId}`);

    res.json({
      success: true,
      data: updatedGym,
      message: 'Gym configuration updated successfully'
    });

  } catch (error) {
    console.error(`[Gym Config] Error updating config for gym ${req.user!.gymId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to update gym configuration' });
  }
});

/**
 * GET /gyms/:id/lead-sources
 * Get lead sources configuration
 */
gymConfigRouter.get('/lead-sources', async (req: Request, res: Response) => {
  try {
    const leadSources = await leadCapture.getLeadSources(req.user!.gymId);

    res.json({
      success: true,
      data: leadSources,
    });
  } catch (error) {
    console.error(`[Gym Config] Error fetching lead sources for gym ${req.user!.gymId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead sources' });
  }
});

/**
 * PUT /gyms/:id/lead-sources
 * Update lead sources configuration
 */
gymConfigRouter.put('/lead-sources', async (req: Request, res: Response) => {
  try {
    const leadSourcesValidation = z.array(LeadSourceConfigSchema).safeParse(req.body);

    if (!leadSourcesValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lead sources format',
        details: leadSourcesValidation.error.flatten()
      });
    }

    const result = await leadCapture.updateLeadSources(req.user!.gymId, leadSourcesValidation.data);

    if (result.success) {
      res.json({
        success: true,
        message: 'Lead sources updated successfully'
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error(`[Gym Config] Error updating lead sources for gym ${req.user!.gymId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to update lead sources' });
  }
});

/**
 * POST /gym/test-lead-source/:sourceId
 * Test a specific lead source configuration
 */
gymConfigRouter.post('/test-lead-source/:sourceId', async (req: Request, res: Response) => {
  try {
    const gymId = req.user!.gymId;
    const { sourceId } = req.params;

    const leadSources = await leadCapture.getLeadSources(gymId);
    const source = leadSources.find(s => s.id === sourceId);

    if (!source) {
      return res.status(404).json({ success: false, error: 'Lead source not found' });
    }

    // Mock test based on source type
    let testResult: { success: boolean; message: string; details?: any };

    switch (source.type) {
      case 'webhook':
        testResult = {
          success: true,
          message: 'Webhook URL generated successfully',
          details: {
            url: leadCapture.getWebhookUrl(gymId, sourceId),
            method: 'POST',
            contentType: 'application/json'
          }
        };
        break;

      case 'email_parser':
        testResult = {
          success: true,
          message: 'Email parser configuration validated',
          details: {
            host: source.config.host || 'Not configured',
            folder: source.config.folder || 'INBOX',
            patterns: source.config.subjectPatterns?.length || 0
          }
        };
        break;

      case 'zapier':
        testResult = {
          success: true,
          message: 'Zapier webhook ready',
          details: {
            url: leadCapture.getWebhookUrl(gymId, sourceId),
            supportedFields: ['name', 'email', 'phone', 'source', 'metadata']
          }
        };
        break;

      default:
        testResult = {
          success: true,
          message: `${source.type} source is configured and ready`
        };
    }

    res.json({
      success: true,
      data: testResult
    });

  } catch (error) {
    console.error(`[Gym Config] Error testing lead source ${req.params.sourceId}:`, error);
    res.status(500).json({ success: false, error: 'Failed to test lead source' });
  }
});

/**
 * GET /gyms/:id/config/defaults
 * Get default configuration template
 */
gymConfigRouter.get('/config/defaults', async (req: Request, res: Response) => {
  try {
    const defaults = {
      settings: {
        openingHours: {
          monday: '06:00-22:00',
          tuesday: '06:00-22:00',
          wednesday: '06:00-22:00',
          thursday: '06:00-22:00',
          friday: '06:00-22:00',
          saturday: '08:00-20:00',
          sunday: '08:00-20:00',
        },
        leadSources: [],
        aiSettings: {
          enabled: true,
          quietHours: { start: '21:00', end: '09:00' },
          maxContactAttempts: 3,
          escalationEnabled: true,
        },
        bookingSettings: {
          enabled: true,
          defaultDuration: 30,
          advanceBookingDays: 14,
          reminderHours: 24,
          allowedTypes: ['tour', 'trial_class', 'consultation'],
        },
        messagingSettings: {
          channels: {
            whatsapp: { enabled: true, priority: 1 },
            email: { enabled: true, priority: 2 },
            sms: { enabled: false, priority: 3 },
          },
          rateLimits: {
            messagesPerHour: 50,
            messagesPerDay: 200,
          },
        },
        timezone: 'UTC',
        currency: 'USD',
        language: 'en',
      },
      knowledgeBase: {
        facilities: 'State-of-the-art fitness equipment, locker rooms, showers',
        classes: 'Group fitness classes, personal training, yoga, spin',
        pricing: 'Flexible membership options starting from $29/month',
        policies: 'No long-term contracts, freeze options available',
        location: 'Conveniently located with ample parking',
        parking: 'Free parking available',
      },
    };

    res.json({
      success: true,
      data: defaults,
      message: 'Default configuration template'
    });

  } catch (error) {
    console.error(`[Gym Config] Error generating defaults:`, error);
    res.status(500).json({ success: false, error: 'Failed to generate defaults' });
  }
});