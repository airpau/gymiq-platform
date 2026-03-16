import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma, workflowEngine } from '../lib/services';
import { leadPipeline, LeadPipelineService, LeadStage } from '../services/lead-pipeline';
import { leadCapture } from '../services/lead-capture';
import { bookingService, BookingType } from '../services/booking';
import { messagingService } from '../services/messaging';
import { leadNurtureWorker } from '../workers/lead-nurture.worker';
import { emailNurtureWorker } from '../workers/email-nurture.worker';

export const leadRouter = Router();

// ─── AUDIT SIGNUP ENDPOINT ──────────────────────────────────────────────────

const AuditSignupSchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Valid email address is required'),
  phone: z.string().optional(),
  gymName: z.string().min(1, 'Gym name is required'),
  memberCount: z.number().positive('Number of members must be greater than 0'),
});

/**
 * POST /leads/audit-signup
 * Captures lead from audit page before file upload
 */
leadRouter.post('/audit-signup', async (req: Request, res: Response) => {
  try {
    const parsed = AuditSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.flatten()
      });
    }

    const { name, email, phone, gymName, memberCount } = parsed.data;

    // Create lead with audit-specific source and metadata
    // Use the default gym ID for now (in production, this could be a system gym)
    const defaultGymId = 'f4068507-4c6b-4fea-8ec4-4095a37827b0';

    const lead = await prisma.lead.create({
      data: {
        gymId: defaultGymId, // Using default gym for audit leads
        source: 'audit_page',
        sourceDetail: 'Pre-upload audit form',
        name,
        email,
        phone,
        currentStage: 'new',
        enquiryDate: new Date(),
        metadata: {
          gymName,
          memberCount,
          auditRequested: true,
          capturedAt: new Date().toISOString(),
        }
      }
    });

    // Trigger email nurture sequence for audit leads
    await emailNurtureWorker.scheduleSequence(lead.id, 'audit', {
      gymName,
      memberCount,
      auditRequested: true,
    });

    res.json({
      success: true,
      leadId: lead.id,
      message: 'Lead captured successfully'
    });

  } catch (error) {
    console.error('[Audit Signup] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to capture lead information'
    });
  }
});

const CreateLeadSchema = z.object({
  gymId: z.string().uuid(),
  source: z.enum(['abandoned_cart', 'web_form', 'walk_in', 'call', 'referral', 'waitlist', 'audit']),
  sourceDetail: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  enquiryDate: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
  triggerFollowup: z.boolean().default(true),
  triggerEmailNurture: z.boolean().default(true),
});

const UpdateLeadSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost', 'nurturing']).optional(),
  score: z.number().min(0).max(100).optional(),
  assignedTo: z.string().optional(),
  convertedAt: z.string().datetime().optional(),
  lostReason: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

/**
 * GET /leads?gymId=&status=&source=&page=&perPage=
 */
leadRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { gymId, status, source, page = '1', perPage = '50' } = req.query;

    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });

    const pageNum = parseInt(page as string, 10);
    const perPageNum = parseInt(perPage as string, 10);

    const where: Record<string, unknown> = { gymId: gymId as string };
    if (status) where.status = status;
    if (source) where.source = source;

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      meta: { page: pageNum, perPage: perPageNum, total },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

// ─── STATIC ROUTES (must come before /:id) ────────────────────────────────────

/**
 * GET /leads/pipeline?gymId=
 * Get lead pipeline with stats and leads by stage
 */
leadRouter.get('/pipeline', async (req: Request, res: Response) => {
  try {
    const { gymId, stage } = req.query;

    if (!gymId) {
      return res.status(400).json({ success: false, error: 'gymId is required' });
    }

    const [stats, leads] = await Promise.all([
      leadPipeline.getPipelineStats(gymId as string),
      leadPipeline.getLeadsByStage(gymId as string, stage as LeadStage | undefined),
    ]);

    res.json({
      success: true,
      data: {
        stats,
        leads,
        stageDescriptions: LeadPipelineService.STAGE_DESCRIPTIONS,
      },
    });
  } catch (error) {
    console.error('Pipeline fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pipeline' });
  }
});

/**
 * GET /leads/bookings?gymId=&date=
 */
leadRouter.get('/bookings', async (req: Request, res: Response) => {
  try {
    const { gymId, date } = req.query;
    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });

    const targetDate = date ? new Date(date as string) : new Date();
    const endDate = new Date(targetDate); endDate.setDate(endDate.getDate() + 1);
    const slots = await bookingService.getAvailableSlots(gymId as string, targetDate, endDate);

    const bookings = await prisma.booking.findMany({
      where: {
        gymId: gymId as string,
        date: {
          gte: new Date(targetDate.toISOString().split('T')[0]),
          lt: new Date(new Date(targetDate).setDate(targetDate.getDate() + 1)),
        },
      },
      include: { lead: { select: { name: true, email: true, phone: true } } },
      orderBy: { date: 'asc' },
    });

    res.json({ success: true, data: { date: targetDate.toISOString().split('T')[0], slots, bookings } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

// ─── PARAMETERISED ROUTES ──────────────────────────────────────────────────────

/**
 * GET /leads/:id
 */
leadRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        conversations: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
});

/**
 * POST /leads
 * Creates a lead. If source is 'abandoned_cart' and triggerFollowup=true,
 * immediately queues the AI follow-up sequence.
 */
leadRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const { triggerFollowup, triggerEmailNurture, ...leadData } = parsed.data;

    const gym = await prisma.gym.findUnique({ where: { id: leadData.gymId } });
    if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

    const lead = await prisma.lead.create({
      data: {
        ...leadData,
        enquiryDate: leadData.enquiryDate ? new Date(leadData.enquiryDate) : new Date(),
        metadata: leadData.metadata ?? {},
      },
    });

    // Trigger abandoned cart follow-up automatically
    if (triggerFollowup && lead.source === 'abandoned_cart' && lead.phone) {
      workflowEngine.triggerLeadFollowup(lead.id).catch((err) => {
        console.error(`Lead followup failed for ${lead.id}:`, err);
      });
    }

    // Trigger email nurture sequence for waitlist and audit sources
    if (triggerEmailNurture && lead.email) {
      if (lead.source === 'waitlist') {
        emailNurtureWorker.scheduleSequence(lead.id, 'waitlist', lead.metadata as Record<string, any>).catch((err) => {
          console.error(`Email nurture sequence failed for waitlist lead ${lead.id}:`, err);
        });
      } else if (lead.source === 'audit') {
        emailNurtureWorker.scheduleSequence(lead.id, 'audit', lead.metadata as Record<string, any>).catch((err) => {
          console.error(`Email nurture sequence failed for audit lead ${lead.id}:`, err);
        });
      }
    }

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
});

/**
 * PUT /leads/:id
 */
leadRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = UpdateLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        convertedAt: parsed.data.convertedAt ? new Date(parsed.data.convertedAt) : undefined,
      },
    });

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
});

/**
 * POST /leads/:id/followup
 * Manually trigger an AI follow-up for any lead.
 */
leadRouter.post('/:id/followup', async (req: Request, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

    await workflowEngine.triggerLeadFollowup(lead.id);

    res.json({ success: true, message: 'Follow-up triggered' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to trigger follow-up' });
  }
});

// ─── WEEK 4: NEW LEAD PIPELINE & BOOKING ROUTES ─────────────────────────────

/**
 * POST /leads/capture
 * Capture a lead from various sources (webhook, manual, etc.)
 */
const CaptureLeadSchema = z.object({
  gymId: z.string().uuid(),
  source: z.string(),
  sourceDetail: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  stage: z.enum(['new', 'contacted', 'engaged', 'booked', 'visited', 'converting', 'converted', 'lost', 'nurturing']).optional(),
  triggerFollowup: z.boolean().default(true),
  triggerEmailNurture: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

leadRouter.post('/capture', async (req: Request, res: Response) => {
  try {
    const parsed = CaptureLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const result = await leadCapture.captureLead(parsed.data.gymId, {
      source: parsed.data.source,
      sourceDetail: parsed.data.sourceDetail,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      stage: parsed.data.stage,
      triggerFollowup: parsed.data.triggerFollowup,
      metadata: parsed.data.metadata,
    });

    if (result.success) {
      // Schedule initial follow-up sequence if requested
      if (parsed.data.triggerFollowup && result.leadId) {
        await leadNurtureWorker.scheduleInitialSequence(result.leadId);
      }

      // Schedule email nurture sequence for waitlist and audit sources
      if (parsed.data.triggerEmailNurture && result.leadId && parsed.data.email) {
        const source = parsed.data.source.toLowerCase();

        if (source === 'waitlist' || source.includes('waitlist')) {
          await emailNurtureWorker.scheduleSequence(result.leadId, 'waitlist', {
            ...parsed.data.metadata,
          });
        } else if (source === 'audit' || source.includes('audit') || source === 'audit_page') {
          await emailNurtureWorker.scheduleSequence(result.leadId, 'audit', {
            ...parsed.data.metadata,
          });
        }
      }

      res.status(201).json({ success: true, leadId: result.leadId });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({ success: false, error: 'Failed to capture lead' });
  }
});

/**
 * GET /leads/:id/journey
 * Get complete journey/audit trail for a lead
 */
leadRouter.get('/:id/journey', async (req: Request, res: Response) => {
  try {
    const journey = await leadPipeline.getLeadJourney(req.params.id);

    res.json({
      success: true,
      data: journey,
    });
  } catch (error) {
    console.error('Journey fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead journey' });
  }
});

/**
 * POST /leads/:id/advance
 * Advance lead to next stage with audit trail
 */
const AdvanceStageSchema = z.object({
  toStage: z.enum(['new', 'contacted', 'engaged', 'booked', 'visited', 'converting', 'converted', 'lost', 'nurturing']),
  channel: z.enum(['whatsapp', 'email', 'sms', 'call', 'manual', 'system']).optional(),
  message: z.string().optional(),
  userId: z.string().optional(),
});

leadRouter.post('/:id/advance', async (req: Request, res: Response) => {
  try {
    const parsed = AdvanceStageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const result = await leadPipeline.advanceStage({
      leadId: req.params.id,
      toStage: parsed.data.toStage,
      channel: parsed.data.channel || 'manual',
      action: 'manual_update',
      message: parsed.data.message,
      userId: parsed.data.userId,
    });

    if (result.success) {
      res.json({ success: true, message: `Lead advanced to ${parsed.data.toStage}` });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Stage advance error:', error);
    res.status(500).json({ success: false, error: 'Failed to advance lead stage' });
  }
});

/**
 * POST /leads/:id/book
 * Book a visit for the lead
 */
const BookVisitSchema = z.object({
  date: z.string().datetime(),
  timeSlot: z.string(), // "14:30"
  type: z.enum(['tour', 'trial_class', 'consultation']),
  notes: z.string().optional(),
});

leadRouter.post('/:id/book', async (req: Request, res: Response) => {
  try {
    const parsed = BookVisitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    // Get lead to find gymId
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      select: { gymId: true },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const result = await bookingService.bookVisit({
      leadId: req.params.id,
      gymId: lead.gymId,
      date: new Date(parsed.data.date),
      timeSlot: parsed.data.timeSlot,
      type: parsed.data.type,
      notes: parsed.data.notes,
    });

    if (result.success) {
      // Send booking confirmation
      const confirmationResult = await messagingService.sendBookingConfirmation(
        req.params.id,
        {
          date: parsed.data.date.split('T')[0],
          time: parsed.data.timeSlot,
          type: parsed.data.type,
        }
      );

      res.status(201).json({
        success: true,
        bookingId: result.bookingId,
        confirmationSent: confirmationResult.success,
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
});

/**
 * POST /leads/:id/message
 * Send a manual message to a lead
 */
const SendMessageSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['initial_outreach', 'follow_up', 'booking_confirmation', 'reminder', 'thank_you', 'win_back']).optional().default('follow_up'),
});

leadRouter.post('/:id/message', async (req: Request, res: Response) => {
  try {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const result = await messagingService.sendFollowUp(req.params.id, parsed.data.content);

    if (result.success) {
      res.json({
        success: true,
        messageId: result.messageId,
        channel: result.channel,
        cost: result.cost,
        dryRun: result.dryRun,
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Manual message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

/**
 * GET /leads/:id/available-slots?date=&type=
 * Get available booking slots for a lead
 */
leadRouter.get('/:id/available-slots', async (req: Request, res: Response) => {
  try {
    const { date, type = 'tour' } = req.query;

    // Get lead to find gymId
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      select: { gymId: true },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const targetDate = date ? new Date(date as string) : new Date();
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 7); // Next 7 days

    const slots = await bookingService.getAvailableSlots(
      lead.gymId,
      targetDate,
      endDate,
      type as BookingType
    );

    res.json({
      success: true,
      data: slots,
    });
  } catch (error) {
    console.error('Available slots error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch available slots' });
  }
});
