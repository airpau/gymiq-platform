import { PrismaClient } from '@prisma/client';
import { AIGateway } from '@gymiq/ai-gateway';
import { TwilioService } from './twilio';
import { followupQueue } from '../lib/queue';

const MS_24H = 24 * 60 * 60 * 1_000;
const MS_72H = 72 * 60 * 60 * 1_000;

export class WorkflowEngine {
  constructor(
    private prisma: PrismaClient,
    private ai: AIGateway,
    private twilio: TwilioService
  ) {}

  /**
   * Trigger the abandoned-cart lead follow-up sequence.
   *
   * Enqueues 3 BullMQ jobs:
   *   Step 1 — immediate (warm welcome)
   *   Step 2 — +24 h    (follow-up with offer)
   *   Step 3 — +72 h    (final attempt with urgency)
   *
   * Each step is processed by the FollowupWorker, which generates a
   * personalised GPT-4o-mini message and sends it via Twilio WhatsApp.
   */
  async triggerLeadFollowup(leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });

    if (!lead?.phone) {
      console.log(`[WorkflowEngine] Lead ${leadId} has no phone — skipping follow-up`);
      return;
    }

    const base = { leadId, gymId: lead.gymId, phone: lead.phone };

    await followupQueue.add(`followup-${leadId}-s1`, { ...base, step: 1 as const });
    await followupQueue.add(`followup-${leadId}-s2`, { ...base, step: 2 as const }, { delay: MS_24H });
    await followupQueue.add(`followup-${leadId}-s3`, { ...base, step: 3 as const }, { delay: MS_72H });

    console.log(`[WorkflowEngine] Queued 3-step follow-up for lead ${leadId} (phone: ${lead.phone})`);
  }

  /**
   * Run churn risk analysis on a member, update their risk score,
   * and trigger a retention WhatsApp if they're high risk (60+).
   */
  async processRetention(memberId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      include: { gym: true },
    });

    if (!member?.gym) return;

    const { riskScore, factors, cost: _cost } = await this.ai.analyzeChurnRisk({
      name: member.name,
      status: member.status,
      lastVisit: member.lastVisit,
      visitCount30d: member.visitCount30d,
      nextPayment: member.nextPayment,
      membershipTier: member.membershipTier,
      joinDate: member.joinDate,
    });

    await this.prisma.member.update({
      where: { id: memberId },
      data: { riskScore, riskFactors: factors },
    });

    // High risk (60+) → proactive retention message
    if (riskScore >= 60 && member.phone && member.gym.whatsappNumber) {
      let conversation = await this.prisma.conversation.findFirst({
        where: { gymId: member.gymId, phone: member.phone, status: 'active' },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            gymId: member.gymId,
            memberId: member.id,
            phone: member.phone,
            channel: 'whatsapp',
            status: 'active',
          },
        });
      }

      const { reply, cost } = await this.ai.generateMemberReply(
        `Member at ${riskScore}% churn risk. Reasons: ${factors.join(', ')}. Send a warm retention message.`,
        { type: 'retention', riskScore, factors },
        member.gym.knowledgeBase
      );

      await this.twilio.sendWhatsApp(member.phone, member.gym.whatsappNumber, reply);

      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'outbound',
          content: reply,
          aiModel: 'gpt-4o-mini',
          aiCost: cost,
          sentAt: new Date(),
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
    }
  }
}
