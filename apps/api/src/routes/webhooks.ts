import { Router, Request, Response } from 'express';
import { prisma, aiGateway, twilioService } from '../lib/services';

export const webhookRouter = Router();

/**
 * POST /webhooks/twilio/whatsapp
 * Receives inbound WhatsApp messages from Twilio.
 * Twilio sends form-encoded POST with From, To, Body fields.
 */
webhookRouter.post('/twilio/whatsapp', async (req: Request, res: Response) => {
  try {
    const { From, To, Body, MessageSid } = req.body;

    if (!From || !To || !Body) {
      return res.status(400).json({ error: 'Missing required Twilio fields' });
    }

    // Strip 'whatsapp:' prefix Twilio adds
    const fromPhone = From.replace('whatsapp:', '');
    const toNumber = To.replace('whatsapp:', '');

    // Find gym by their WhatsApp number
    const gym = await prisma.gym.findFirst({
      where: { whatsappNumber: toNumber },
    });

    if (!gym) {
      console.warn(`No gym found for WhatsApp number: ${toNumber}`);
      return res.status(200).send('<Response></Response>'); // ACK to Twilio
    }

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { gymId: gym.id, phone: fromPhone, status: { in: ['active', 'waiting_human'] } },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } },
    });

    if (!conversation) {
      // Try to match phone to a known member or lead
      const member = await prisma.member.findFirst({ where: { gymId: gym.id, phone: fromPhone } });
      const lead = await prisma.lead.findFirst({ where: { gymId: gym.id, phone: fromPhone } });

      conversation = await prisma.conversation.create({
        data: {
          gymId: gym.id,
          memberId: member?.id,
          leadId: lead?.id,
          phone: fromPhone,
          channel: 'whatsapp',
          status: 'active',
        },
        include: { messages: true },
      });
    }

    // Store inbound message
    const inboundMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        content: Body,
        metadata: { twilioSid: MessageSid },
        sentAt: new Date(),
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Don't auto-reply if conversation is waiting for a human
    if (conversation.status === 'waiting_human') {
      return res.status(200).send('<Response></Response>');
    }

    // Classify intent
    const { intent, confidence } = await aiGateway.classifyIntent(Body);

    // Update the inbound message with classified intent
    await prisma.message.update({
      where: { id: inboundMessage.id },
      data: { intent, intentConfidence: confidence },
    });

    // For cancel requests, use the specialised cancel-save handler
    let reply: string;
    let aiModel = 'gpt-4o-mini';
    let aiCost = 0;

    if (intent === 'cancel_membership') {
      const member = conversation.memberId
        ? await prisma.member.findUnique({ where: { id: conversation.memberId } })
        : null;

      const history = (conversation as any).messages ?? [];

      const result = await aiGateway.handleCancelRequest(Body, member, history);
      reply = result.response;
      aiCost = result.cost;
      aiModel = 'claude-3-5-sonnet';

      // If AI can't save, escalate to human
      if (result.action === 'escalate') {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'waiting_human' },
        });
      }
    } else {
      // Standard reply using GPT-4o-mini
      const result = await aiGateway.generateMemberReply(Body, conversation.context, gym.knowledgeBase);
      reply = result.reply;
      aiCost = result.cost;
    }

    // Send reply via Twilio
    if (gym.whatsappNumber) {
      await twilioService.sendWhatsApp(fromPhone, gym.whatsappNumber, reply);
    }

    // Store outbound message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content: reply,
        intent,
        intentConfidence: confidence,
        aiModel,
        aiCost,
        sentAt: new Date(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Twilio expects a TwiML response (even empty)
    res.status(200).send('<Response></Response>');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).send('<Response></Response>'); // Always ACK Twilio
  }
});

/**
 * POST /webhooks/twilio/sms
 * Inbound SMS — same flow as WhatsApp
 */
webhookRouter.post('/twilio/sms', async (req: Request, res: Response) => {
  try {
    const { From, To, Body, MessageSid } = req.body;

    const gym = await prisma.gym.findFirst({
      where: { whatsappNumber: To },
    });

    if (!gym) {
      return res.status(200).send('<Response></Response>');
    }

    let conversation = await prisma.conversation.findFirst({
      where: { gymId: gym.id, phone: From, channel: 'sms', status: 'active' },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          gymId: gym.id,
          phone: From,
          channel: 'sms',
          status: 'active',
        },
        include: { messages: true },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        content: Body,
        metadata: { twilioSid: MessageSid },
        sentAt: new Date(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    res.status(200).send('<Response></Response>');
  } catch (error) {
    console.error('SMS webhook error:', error);
    res.status(200).send('<Response></Response>');
  }
});

/**
 * POST /webhooks/glofox
 * Tier A CRM webhook — real-time events from GloFox
 */
webhookRouter.post('/glofox', async (req: Request, res: Response) => {
  try {
    const { event, gym_id, member, payment, lead } = req.body;

    const gym = await prisma.gym.findFirst({ where: { slug: gym_id } });
    if (!gym) return res.status(404).json({ error: 'Gym not found' });

    switch (event) {
      case 'payment.failed': {
        if (member?.id) {
          const dbMember = await prisma.member.findFirst({
            where: { gymId: gym.id, crmId: member.id },
          });
          if (dbMember) {
            // TODO: trigger payment recovery workflow
            console.log(`Payment failed for member ${dbMember.id}, gym ${gym.id}`);
          }
        }
        break;
      }

      case 'lead.created':
      case 'abandoned_cart': {
        const newLead = await prisma.lead.upsert({
          where: { id: lead?.id ?? 'new' },
          create: {
            gymId: gym.id,
            source: event === 'abandoned_cart' ? 'abandoned_cart' : 'web_form',
            name: lead?.name,
            email: lead?.email,
            phone: lead?.phone,
            enquiryDate: new Date(),
            currentStage: 'new',
          },
          update: {},
        });
        console.log(`Lead created: ${newLead.id}`);
        break;
      }

      case 'member.cancelled': {
        if (member?.id) {
          await prisma.member.updateMany({
            where: { gymId: gym.id, crmId: member.id },
            data: { status: 'cancelled' },
          });
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('GloFox webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});
