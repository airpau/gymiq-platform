/**
 * Follow-up Worker
 *
 * Processes lead-followup queue jobs. Each job represents one step in the
 * 3-step abandoned-cart sequence:
 *
 *   Step 1 (immediate)  — Warm welcome, invite to visit
 *   Step 2 (+24 h)      — Follow-up with a special offer
 *   Step 3 (+72 h)      — Final attempt with urgency
 *
 * Jobs are enqueued by WorkflowEngine.triggerLeadFollowup().
 */

import { Worker, Job } from 'bullmq';
import { redisConnectionOptions, FollowupJobData } from '../lib/queue';
import { prisma } from '../lib/prisma';
import { AIGateway } from '@gymiq/ai-gateway';
import { TwilioService } from '../services/twilio';

// Local singletons — worker runs in the same process but manages its own
// AI + Twilio instances to avoid circular-import issues with lib/services.ts
const aiGateway = new AIGateway();
const twilioService = new TwilioService();

// ─── Step prompts ─────────────────────────────────────────────────────────────

const STEP_PROMPTS: Record<1 | 2 | 3, string> = {
  1: `You are reaching out to someone who started signing up at the gym but didn't complete their membership.
Send a warm, friendly welcome message. Introduce the gym, highlight the community and results members get,
and invite them to book a free trial or come in for a tour. Be personal and enthusiastic, not salesy.
Keep it under 80 words.`,

  2: `This person showed interest in joining the gym yesterday but still hasn't completed their sign-up.
Send a friendly follow-up. Acknowledge that life gets busy, and sweeten the offer — mention a first-month
discount, a free personal training session, or another relevant incentive from the gym's knowledge base.
Create mild excitement. Keep it under 80 words.`,

  3: `This is the final follow-up for someone who hasn't joined after 3 days of outreach.
Create gentle urgency — the offer or promotion expires soon, or spots are limited. Be warm but direct.
Make the call-to-action crystal clear: reply to this message, click the link, or call us.
End on a positive, supportive note. Keep it under 80 words.`,
};

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startFollowupWorker() {
  const worker = new Worker<FollowupJobData, void, string>(
    'lead-followup',
    async (job: Job<FollowupJobData, void, string>) => {
      const { leadId, step, phone } = job.data;

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { gym: true },
      });

      if (!lead?.gym) {
        console.log(`[FollowupWorker] Lead ${leadId} not found, skipping step ${step}`);
        return;
      }

      // Stop the sequence if the lead has already been resolved
      if (lead.currentStage === 'converted' || lead.currentStage === 'lost') {
        console.log(`[FollowupWorker] Lead ${leadId} is ${lead.currentStage} — skipping step ${step}`);
        return;
      }

      // Find or create the WhatsApp conversation for this lead
      let conversation = await prisma.conversation.findFirst({
        where: {
          gymId: lead.gymId,
          phone,
          status: { in: ['active', 'waiting_human'] },
        },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            gymId: lead.gymId,
            leadId: lead.id,
            phone,
            channel: 'whatsapp',
            status: 'active',
          },
        });
      }

      // Generate personalised message via GPT-4o-mini + gym knowledge base
      const context = {
        type: 'lead_followup',
        step,
        leadName: lead.name ?? 'there',
        source: lead.source,
        gymName: lead.gym.name,
      };

      const { reply, cost } = await aiGateway.generateMemberReply(
        STEP_PROMPTS[step as 1 | 2 | 3],
        context,
        lead.gym.knowledgeBase
      );

      // Send via WhatsApp
      if (lead.gym.whatsappNumber) {
        await twilioService.sendWhatsApp(phone, lead.gym.whatsappNumber, reply);
      } else {
        console.warn(`[FollowupWorker] Gym ${lead.gymId} has no whatsappNumber — message not sent`);
      }

      // Persist outbound message
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'outbound',
          content: reply,
          aiModel: 'gpt-4o-mini',
          aiCost: cost,
          sentAt: new Date(),
          metadata: { followupStep: step },
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      // Advance lead status
      const nextStage =
        step === 1 ? 'contacted' :
        lead.currentStage === 'contacted' ? 'nurturing' :
        lead.currentStage;

      if (nextStage !== lead.currentStage) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { currentStage: nextStage },
        });
      }

      console.log(
        `[FollowupWorker] Step ${step} sent for lead ${leadId} ` +
        `(cost: $${cost.toFixed(5)}, status → ${nextStage})`
      );
    },
    { connection: redisConnectionOptions }
  );

  worker.on('completed', (job) =>
    console.log(`[FollowupWorker] Job ${job.id} completed (step ${job.data.step})`)
  );

  worker.on('failed', (job, err) =>
    console.error(`[FollowupWorker] Job ${job?.id} failed:`, err.message)
  );

  worker.on('error', (err) =>
    console.error('[FollowupWorker] Worker error:', err)
  );

  console.log('[FollowupWorker] Started — listening on lead-followup queue');
  return worker;
}
