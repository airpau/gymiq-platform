import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../lib/prisma';
import { leadPipeline, LeadStage } from '../services/lead-pipeline';
import { messagingService } from '../services/messaging';
import { aiConversation } from '../services/ai-conversation';

// Job data interfaces
interface LeadFollowupJobData {
  leadId: string;
  gymId: string;
  followupType: 'initial' | 'sequence' | 'booking_reminder' | 'no_show_followup' | 'win_back';
  attemptNumber: number;
  delayMinutes?: number;
  customMessage?: string;
  metadata?: Record<string, any>;
}

interface ScheduleFollowupData {
  leadId: string;
  delayMinutes: number;
  followupType: LeadFollowupJobData['followupType'];
  customMessage?: string;
  metadata?: Record<string, any>;
}

// Follow-up sequences configuration
const FOLLOWUP_SEQUENCES = {
  abandoned_cart: [
    { delay: 5, message: 'initial_outreach' },      // 5 minutes
    { delay: 60, message: 'follow_up' },            // 1 hour
    { delay: 1440, message: 'follow_up' },          // 24 hours
    { delay: 4320, message: 'win_back' },           // 3 days
  ],
  web_form: [
    { delay: 2, message: 'initial_outreach' },      // 2 minutes
    { delay: 120, message: 'follow_up' },           // 2 hours
    { delay: 2880, message: 'follow_up' },          // 2 days
  ],
  general: [
    { delay: 30, message: 'initial_outreach' },     // 30 minutes
    { delay: 1440, message: 'follow_up' },          // 1 day
    { delay: 4320, message: 'follow_up' },          // 3 days
  ],
};

export class LeadNurtureWorker {
  private worker: Worker;
  private queue: Queue;
  private redis: Redis;

  constructor() {
    // Redis connection options
    const redisConnectionOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    };

    // Initialize Redis connection
    this.redis = new Redis(redisConnectionOptions);

    // Initialize BullMQ queue
    this.queue = new Queue('lead-nurture', {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
      },
    });

    // Initialize worker
    this.worker = new Worker(
      'lead-nurture',
      this.processJob.bind(this),
      {
        connection: redisConnectionOptions,
        concurrency: 5, // Process up to 5 jobs concurrently
        limiter: {
          max: 10,     // Max 10 jobs per duration
          duration: 60000, // Per minute
        },
      }
    );

    // Worker event handlers
    this.worker.on('ready', () => {
      console.log('[Lead Nurture Worker] Ready to process jobs');
    });

    this.worker.on('completed', (job: Job) => {
      console.log(`[Lead Nurture Worker] Job ${job.id} completed for lead ${job.data.leadId}`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Lead Nurture Worker] Job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (err: Error) => {
      console.error('[Lead Nurture Worker] Worker error:', err);
    });
  }

  /**
   * Process lead nurture job
   */
  private async processJob(job: Job<LeadFollowupJobData>): Promise<void> {
    const { leadId, gymId, followupType, attemptNumber, customMessage } = job.data;

    console.log(`[Lead Nurture Worker] Processing ${followupType} for lead ${leadId} (attempt ${attemptNumber})`);

    try {
      // Check quiet hours (9am-8pm only)
      if (this.isQuietHours()) {
        console.log(`[Lead Nurture Worker] Quiet hours - delaying job for lead ${leadId}`);
        await this.rescheduleForBusinessHours(job);
        return;
      }

      // Get lead info
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { gym: { select: { name: true, settings: true } } }
      });

      if (!lead) {
        throw new Error(`Lead ${leadId} not found`);
      }

      // Check if lead is still eligible for follow-up
      if (!this.isEligibleForFollowup(lead)) {
        console.log(`[Lead Nurture Worker] Lead ${leadId} no longer eligible for follow-up`);
        return;
      }

      // Execute follow-up based on type
      const result = await this.executeFollowup(lead, followupType, attemptNumber, customMessage);

      if (result.success) {
        // Update lead contact tracking
        await leadPipeline.incrementContactAttempts(leadId, 'whatsapp');

        // Schedule next follow-up if part of sequence
        await this.scheduleNextInSequence(lead, followupType, attemptNumber);
      } else {
        // Handle failed attempt
        await this.handleFailedAttempt(lead, attemptNumber, result.error);
      }

      // Update job progress
      await job.updateProgress(100);

    } catch (error) {
      console.error(`[Lead Nurture Worker] Error processing job for lead ${leadId}:`, error);
      throw error; // This will trigger BullMQ retry logic
    }
  }

  /**
   * Schedule initial follow-up sequence for a new lead
   */
  async scheduleInitialSequence(leadId: string): Promise<void> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { source: true, gymId: true }
      });

      if (!lead) {
        throw new Error(`Lead ${leadId} not found`);
      }

      // Determine sequence based on lead source
      let sequence = FOLLOWUP_SEQUENCES.general;
      if (lead.source === 'abandoned_cart') {
        sequence = FOLLOWUP_SEQUENCES.abandoned_cart;
      } else if (lead.source === 'web_form') {
        sequence = FOLLOWUP_SEQUENCES.web_form;
      }

      // Schedule each step in the sequence
      for (let i = 0; i < sequence.length; i++) {
        const step = sequence[i];
        await this.queue.add(
          `lead-followup-${leadId}-${i}`,
          {
            leadId,
            gymId: lead.gymId,
            followupType: i === 0 ? 'initial' : 'sequence',
            attemptNumber: i + 1,
            metadata: {
              sequenceStep: i,
              messageType: step.message,
            },
          },
          {
            delay: step.delay * 60 * 1000, // Convert minutes to milliseconds
            jobId: `followup-${leadId}-${i}`, // Unique job ID to prevent duplicates
          }
        );
      }

      console.log(`[Lead Nurture Worker] Scheduled ${sequence.length} follow-ups for lead ${leadId}`);
    } catch (error) {
      console.error(`[Lead Nurture Worker] Error scheduling sequence for lead ${leadId}:`, error);
    }
  }

  /**
   * Schedule a custom follow-up
   */
  async scheduleFollowup(data: ScheduleFollowupData): Promise<void> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: data.leadId },
        select: { gymId: true }
      });

      if (!lead) {
        throw new Error(`Lead ${data.leadId} not found`);
      }

      await this.queue.add(
        `custom-followup-${data.leadId}-${Date.now()}`,
        {
          leadId: data.leadId,
          gymId: lead.gymId,
          followupType: data.followupType,
          attemptNumber: 1,
          customMessage: data.customMessage,
          metadata: data.metadata,
        },
        {
          delay: data.delayMinutes * 60 * 1000,
        }
      );

      console.log(`[Lead Nurture Worker] Scheduled custom follow-up for lead ${data.leadId} in ${data.delayMinutes} minutes`);
    } catch (error) {
      console.error(`[Lead Nurture Worker] Error scheduling custom follow-up for lead ${data.leadId}:`, error);
    }
  }

  /**
   * Execute the actual follow-up
   */
  private async executeFollowup(
    lead: any,
    followupType: LeadFollowupJobData['followupType'],
    attemptNumber: number,
    customMessage?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let result;

      switch (followupType) {
        case 'initial':
          result = await aiConversation.generateInitialOutreach(lead.id);
          if ('error' in result) {
            return { success: false, error: result.error };
          }

          // Send the AI-generated message
          const messageResult = await messagingService.sendInitialOutreach(lead.id);
          return { success: messageResult.success, error: messageResult.error };

        case 'sequence':
          result = await messagingService.sendFollowUp(lead.id, customMessage);
          return { success: result.success, error: result.error };

        case 'booking_reminder':
          // Get upcoming bookings and send reminder
          const bookings = await prisma.booking.findMany({
            where: {
              leadId: lead.id,
              status: { in: ['scheduled', 'confirmed'] },
              date: { gte: new Date() },
            },
            take: 1,
            orderBy: { date: 'asc' },
          });

          if (bookings.length > 0) {
            const booking = bookings[0];
            result = await messagingService.sendBookingConfirmation(lead.id, {
              date: booking.date.toISOString().split('T')[0],
              time: booking.timeSlot,
              type: booking.type,
            });
            return { success: result.success, error: result.error };
          }
          return { success: false, error: 'No upcoming bookings found' };

        case 'no_show_followup':
          result = await messagingService.sendFollowUp(
            lead.id,
            customMessage || "Hi! I noticed you missed your scheduled visit. No worries - life happens! Would you like to reschedule for another time?"
          );
          return { success: result.success, error: result.error };

        case 'win_back':
          result = await messagingService.sendFollowUp(
            lead.id,
            customMessage || "Hi! We haven't heard from you in a while. Is there anything I can help with regarding your fitness goals? We'd love to help you get started!"
          );
          return { success: result.success, error: result.error };

        default:
          return { success: false, error: `Unknown follow-up type: ${followupType}` };
      }
    } catch (error) {
      console.error(`[Lead Nurture Worker] Error executing follow-up for lead ${lead.id}:`, error);
      return { success: false, error: 'Follow-up execution failed' };
    }
  }

  /**
   * Check if it's quiet hours (outside 9am-8pm)
   */
  private isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour < 9 || hour >= 20;
  }

  /**
   * Reschedule job for next business hours
   */
  private async rescheduleForBusinessHours(job: Job<LeadFollowupJobData>): Promise<void> {
    const now = new Date();
    let nextBusinessHour = new Date(now);

    // Set to 9 AM
    nextBusinessHour.setHours(9, 0, 0, 0);

    // If it's already past 9 AM today, schedule for 9 AM tomorrow
    if (now.getHours() >= 9) {
      nextBusinessHour.setDate(nextBusinessHour.getDate() + 1);
    }

    const delay = nextBusinessHour.getTime() - now.getTime();

    await this.queue.add(
      `rescheduled-${job.data.leadId}-${Date.now()}`,
      job.data,
      { delay }
    );

    console.log(`[Lead Nurture Worker] Rescheduled job for lead ${job.data.leadId} to ${nextBusinessHour.toISOString()}`);
  }

  /**
   * Check if lead is eligible for follow-up
   */
  private isEligibleForFollowup(lead: any): boolean {
    // Don't follow up converted or lost leads (unless win-back)
    const ineligibleStages = ['converted', 'lost'];
    if (ineligibleStages.includes(lead.currentStage)) {
      return false;
    }

    // Don't follow up if too many attempts (escalation threshold)
    if (lead.contactAttempts >= 3) {
      console.log(`[Lead Nurture Worker] Lead ${lead.id} has ${lead.contactAttempts} attempts - needs escalation`);
      return false;
    }

    return true;
  }

  /**
   * Schedule next follow-up in sequence
   */
  private async scheduleNextInSequence(
    lead: any,
    currentType: LeadFollowupJobData['followupType'],
    currentAttempt: number
  ): Promise<void> {
    // Only schedule next if this was part of an initial sequence
    if (currentType !== 'initial' && currentType !== 'sequence') {
      return;
    }

    // Determine sequence
    let sequence = FOLLOWUP_SEQUENCES.general;
    if (lead.source === 'abandoned_cart') {
      sequence = FOLLOWUP_SEQUENCES.abandoned_cart;
    } else if (lead.source === 'web_form') {
      sequence = FOLLOWUP_SEQUENCES.web_form;
    }

    // Check if there's a next step
    if (currentAttempt < sequence.length) {
      const nextStep = sequence[currentAttempt]; // currentAttempt is 0-indexed for next step

      await this.queue.add(
        `followup-${lead.id}-${currentAttempt}`,
        {
          leadId: lead.id,
          gymId: lead.gymId,
          followupType: 'sequence',
          attemptNumber: currentAttempt + 1,
          metadata: {
            sequenceStep: currentAttempt,
            messageType: nextStep.message,
          },
        },
        {
          delay: nextStep.delay * 60 * 1000,
          jobId: `followup-${lead.id}-${currentAttempt}`,
        }
      );
    }
  }

  /**
   * Handle failed follow-up attempt
   */
  private async handleFailedAttempt(
    lead: any,
    attemptNumber: number,
    error?: string
  ): Promise<void> {
    console.error(`[Lead Nurture Worker] Failed attempt ${attemptNumber} for lead ${lead.id}: ${error}`);

    // Escalate after 3 failed attempts
    if (attemptNumber >= 3) {
      await this.escalateToHuman(lead.id, `Failed ${attemptNumber} follow-up attempts. Last error: ${error}`);
    } else {
      // Schedule retry with exponential backoff
      const retryDelay = Math.pow(2, attemptNumber) * 30; // 30, 60, 120 minutes
      await this.scheduleFollowup({
        leadId: lead.id,
        delayMinutes: retryDelay,
        followupType: 'sequence',
        metadata: { retryAttempt: attemptNumber + 1, previousError: error },
      });
    }
  }

  /**
   * Escalate lead to human after multiple failed attempts
   */
  private async escalateToHuman(leadId: string, reason: string): Promise<void> {
    try {
      // Mark conversation as needing human intervention
      await prisma.conversation.updateMany({
        where: { leadId },
        data: { status: 'waiting_human' },
      });

      // Create journey entry
      await prisma.leadJourney.create({
        data: {
          leadId,
          stage: 'nurturing', // Move to nurturing stage
          fromStage: null,
          channel: 'system',
          action: 'stage_change',
          message: `Escalated to human: ${reason}`,
          metadata: {
            escalationReason: reason,
            escalatedAt: new Date().toISOString(),
          },
        },
      });

      console.log(`[Lead Nurture Worker] Escalated lead ${leadId} to human: ${reason}`);
    } catch (error) {
      console.error(`[Lead Nurture Worker] Error escalating lead ${leadId}:`, error);
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    };
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.redis.disconnect();
    console.log('[Lead Nurture Worker] Worker closed');
  }
}

// Export singleton instance
export const leadNurtureWorker = new LeadNurtureWorker();