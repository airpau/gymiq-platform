import { Worker, Job, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email';
import { emailTemplatesService, SequenceType, EmailNumber } from '../services/email-templates';
import { redisConnectionOptions } from '../lib/queue';

// Job data interface
interface EmailNurtureJobData {
  leadId: string;
  sequenceType: SequenceType; // 'waitlist' | 'audit'
  emailNumber: EmailNumber;   // 1 | 2 | 3
  metadata?: {
    gymName?: string;
    memberCount?: number;
    [key: string]: any;
  };
}

export class EmailNurtureWorker {
  private worker: Worker;
  private queue: Queue;
  private redis: Redis;

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis(redisConnectionOptions);

    // Initialize BullMQ queue for email nurture
    this.queue = new Queue('email-nurture', {
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
      'email-nurture',
      this.processJob.bind(this),
      {
        connection: redisConnectionOptions,
        concurrency: 3, // Process up to 3 email jobs concurrently
        limiter: {
          max: 10,     // Max 10 emails per minute (to avoid spam)
          duration: 60000, // Per minute
        },
      }
    );

    // Worker event handlers
    this.worker.on('ready', () => {
      console.log('[Email Nurture Worker] Ready to process jobs');
    });

    this.worker.on('completed', (job: Job) => {
      console.log(`[Email Nurture Worker] Job ${job.id} completed for lead ${job.data.leadId}`);
    });

    this.worker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Email Nurture Worker] Job ${job?.id} failed:`, err);
    });

    this.worker.on('error', (err: Error) => {
      console.error('[Email Nurture Worker] Worker error:', err);
    });
  }

  /**
   * Process email nurture job
   */
  private async processJob(job: Job<EmailNurtureJobData>): Promise<void> {
    const { leadId, sequenceType, emailNumber, metadata } = job.data;

    console.log(`[Email Nurture Worker] Processing ${sequenceType} email ${emailNumber} for lead ${leadId}`);

    try {
      // Check quiet hours (9am-8pm UK time only)
      if (this.isQuietHours()) {
        console.log(`[Email Nurture Worker] Quiet hours - rescheduling email for lead ${leadId}`);
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

      if (!lead.email) {
        console.warn(`[Email Nurture Worker] Lead ${leadId} has no email address - skipping`);
        return;
      }

      // Check if lead has unsubscribed
      if (await this.isUnsubscribed(lead.email)) {
        console.log(`[Email Nurture Worker] Lead ${leadId} has unsubscribed - skipping`);
        return;
      }

      // Prepare template variables
      const templateVariables = {
        name: lead.name || 'there',
        gymName: metadata?.gymName || lead.gym?.name || 'your gym',
        memberCount: metadata?.memberCount || 100,
        ...metadata,
      };

      // Get email template
      const template = emailTemplatesService.getTemplate(sequenceType, emailNumber, templateVariables);

      // Send email
      const result = await emailService.sendEmail({
        to: lead.email,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        leadId: lead.id,
      });

      if (result.success) {
        console.log(`[Email Nurture Worker] ${sequenceType} email ${emailNumber} sent to ${lead.email}`);

        // Schedule next email in sequence if not the last one
        await this.scheduleNextEmail(lead.id, sequenceType, emailNumber, metadata);

        // Update lead journey
        await this.updateLeadJourney(lead.id, sequenceType, emailNumber, result.messageId);

      } else {
        throw new Error(result.error || 'Failed to send email');
      }

      // Update job progress
      await job.updateProgress(100);

    } catch (error) {
      console.error(`[Email Nurture Worker] Error processing email job for lead ${leadId}:`, error);
      throw error; // This will trigger BullMQ retry logic
    }
  }

  /**
   * Schedule initial email sequence for a new lead
   */
  async scheduleSequence(leadId: string, sequenceType: SequenceType, metadata?: Record<string, any>): Promise<void> {
    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { email: true, name: true }
      });

      if (!lead || !lead.email) {
        console.warn(`[Email Nurture Worker] Cannot schedule sequence for lead ${leadId} - no email address`);
        return;
      }

      // Check if lead has unsubscribed
      if (await this.isUnsubscribed(lead.email)) {
        console.log(`[Email Nurture Worker] Lead ${leadId} has unsubscribed - not scheduling sequence`);
        return;
      }

      const timings = emailTemplatesService.getSequenceTimings(sequenceType);

      // Schedule each email in the sequence
      for (const timing of timings) {
        const jobId = `email-${leadId}-${sequenceType}-${timing.emailNumber}`;

        await this.queue.add(
          `${sequenceType}-email-${timing.emailNumber}`,
          {
            leadId,
            sequenceType,
            emailNumber: timing.emailNumber,
            metadata,
          },
          {
            delay: timing.delayMinutes * 60 * 1000, // Convert minutes to milliseconds
            jobId, // Unique job ID to prevent duplicates
          }
        );
      }

      console.log(`[Email Nurture Worker] Scheduled ${timings.length} ${sequenceType} emails for lead ${leadId}`);
    } catch (error) {
      console.error(`[Email Nurture Worker] Error scheduling sequence for lead ${leadId}:`, error);
    }
  }

  /**
   * Schedule next email in the sequence
   */
  private async scheduleNextEmail(
    leadId: string,
    sequenceType: SequenceType,
    currentEmailNumber: EmailNumber,
    metadata?: Record<string, any>
  ): Promise<void> {
    const nextEmailNumber = (currentEmailNumber + 1) as EmailNumber;

    // Check if there's a next email (sequences are 1, 2, 3)
    if (nextEmailNumber > 3) {
      console.log(`[Email Nurture Worker] Sequence completed for lead ${leadId}`);
      return;
    }

    const timings = emailTemplatesService.getSequenceTimings(sequenceType);
    const nextTiming = timings.find(t => t.emailNumber === nextEmailNumber);

    if (!nextTiming) {
      return;
    }

    const jobId = `email-${leadId}-${sequenceType}-${nextEmailNumber}`;

    // Calculate delay from now (not from sequence start)
    let delayMinutes: number;
    if (nextEmailNumber === 2) {
      delayMinutes = 24 * 60; // 24 hours from email 1
    } else if (nextEmailNumber === 3) {
      delayMinutes = 48 * 60; // 48 hours from email 2 (72 hours total from start)
    } else {
      delayMinutes = 0;
    }

    await this.queue.add(
      `${sequenceType}-email-${nextEmailNumber}`,
      {
        leadId,
        sequenceType,
        emailNumber: nextEmailNumber,
        metadata,
      },
      {
        delay: delayMinutes * 60 * 1000,
        jobId,
      }
    );

    console.log(`[Email Nurture Worker] Scheduled ${sequenceType} email ${nextEmailNumber} for lead ${leadId} in ${delayMinutes} minutes`);
  }

  /**
   * Check if it's quiet hours (outside 9am-8pm UK time)
   */
  private isQuietHours(): boolean {
    const now = new Date();

    // Convert to UK time
    const ukTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
    const hour = ukTime.getHours();

    return hour < 9 || hour >= 20;
  }

  /**
   * Reschedule job for next business hours (9am UK time)
   */
  private async rescheduleForBusinessHours(job: Job<EmailNurtureJobData>): Promise<void> {
    const now = new Date();
    const ukTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));

    let nextBusinessHour = new Date(ukTime);
    nextBusinessHour.setHours(9, 0, 0, 0);

    // If it's already past 9 AM today, schedule for 9 AM tomorrow
    if (ukTime.getHours() >= 9) {
      nextBusinessHour.setDate(nextBusinessHour.getDate() + 1);
    }

    // Convert back to local time for delay calculation
    const delay = nextBusinessHour.getTime() - now.getTime();

    await this.queue.add(
      `rescheduled-${job.data.sequenceType}-${job.data.emailNumber}`,
      job.data,
      { delay }
    );

    console.log(`[Email Nurture Worker] Rescheduled job for lead ${job.data.leadId} to ${nextBusinessHour.toISOString()}`);
  }

  /**
   * Check if email address has unsubscribed
   */
  private async isUnsubscribed(email: string): Promise<boolean> {
    try {
      // Check for unsubscribe record in database
      // This would typically be a separate unsubscribes table
      const unsubscribe = await prisma.lead.findFirst({
        where: {
          email,
          metadata: {
            path: ['unsubscribed'],
            equals: true,
          },
        },
      });

      return !!unsubscribe;
    } catch (error) {
      console.error('[Email Nurture Worker] Error checking unsubscribe status:', error);
      return false; // If we can't check, assume not unsubscribed
    }
  }

  /**
   * Update lead journey with email activity
   */
  private async updateLeadJourney(
    leadId: string,
    sequenceType: SequenceType,
    emailNumber: EmailNumber,
    messageId?: string
  ): Promise<void> {
    try {
      await prisma.leadJourney.create({
        data: {
          leadId,
          stage: 'nurturing',
          fromStage: null,
          channel: 'email',
          action: 'email_sent',
          message: `Sent ${sequenceType} email ${emailNumber}`,
          metadata: {
            sequenceType,
            emailNumber,
            messageId,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      console.error(`[Email Nurture Worker] Error updating lead journey for ${leadId}:`, error);
    }
  }

  /**
   * Cancel all scheduled emails for a lead (e.g., if they convert or unsubscribe)
   */
  async cancelSequence(leadId: string, sequenceType?: SequenceType): Promise<void> {
    try {
      const jobs = await this.queue.getJobs(['waiting', 'delayed']);

      for (const job of jobs) {
        if (job.data.leadId === leadId && (!sequenceType || job.data.sequenceType === sequenceType)) {
          await job.remove();
          console.log(`[Email Nurture Worker] Cancelled job ${job.id} for lead ${leadId}`);
        }
      }
    } catch (error) {
      console.error(`[Email Nurture Worker] Error cancelling sequence for lead ${leadId}:`, error);
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
      queueName: 'email-nurture',
    };
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    this.redis.disconnect();
    console.log('[Email Nurture Worker] Worker closed');
  }
}

// Export singleton instance
export const emailNurtureWorker = new EmailNurtureWorker();