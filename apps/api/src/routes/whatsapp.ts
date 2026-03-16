import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { aiConversation } from '../services/ai-conversation';
import { messagingService } from '../services/messaging';
import { leadPipeline } from '../services/lead-pipeline';
import crypto from 'crypto';

export const whatsappRouter = Router();

// Twilio webhook validation schema
const TwilioWebhookSchema = z.object({
  MessageSid: z.string(),
  AccountSid: z.string(),
  From: z.string(), // Phone number with country code
  To: z.string(),   // Gym's WhatsApp number
  Body: z.string(),
  NumMedia: z.string().optional(),
  MediaUrl0: z.string().optional(),
  ProfileName: z.string().optional(),
  WaId: z.string().optional(), // WhatsApp ID
});

// Twilio status callback schema
const TwilioStatusSchema = z.object({
  MessageSid: z.string(),
  MessageStatus: z.enum(['queued', 'sent', 'delivered', 'read', 'failed', 'undelivered']),
  To: z.string(),
  From: z.string(),
  AccountSid: z.string(),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
});

/**
 * POST /whatsapp/webhook
 * Receive incoming WhatsApp messages from Twilio
 */
whatsappRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('[WhatsApp Webhook] Received:', JSON.stringify(req.body, null, 2));

    // Validate Twilio signature for security
    if (!validateTwilioSignature(req)) {
      return res.status(403).json({ success: false, error: 'Invalid signature' });
    }

    const parsed = TwilioWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[WhatsApp Webhook] Invalid payload:', parsed.error);
      return res.status(400).json({ success: false, error: 'Invalid webhook data' });
    }

    const { From: fromNumber, To: toNumber, Body: messageBody, MessageSid, ProfileName } = parsed.data;

    // Find gym by WhatsApp number
    const gym = await prisma.gym.findFirst({
      where: { whatsappNumber: toNumber },
      select: { id: true, name: true }
    });

    if (!gym) {
      console.error(`[WhatsApp Webhook] No gym found for number ${toNumber}`);
      return res.status(404).json({ success: false, error: 'Gym not found for this number' });
    }

    // Clean phone number (remove whatsapp: prefix if present)
    const cleanPhoneNumber = fromNumber.replace('whatsapp:', '');

    // Process the incoming message with AI
    const aiResponse = await aiConversation.processInboundMessage(
      gym.id,
      cleanPhoneNumber,
      messageBody,
      'whatsapp'
    );

    if ('error' in aiResponse) {
      console.error(`[WhatsApp Webhook] AI processing error: ${aiResponse.error}`);

      // Send generic response if AI fails
      await sendWhatsAppMessage(
        toNumber,
        cleanPhoneNumber,
        "Thanks for your message! A team member will get back to you soon."
      );

      return res.status(200).json({ success: true, message: 'Fallback response sent' });
    }

    // Send AI response back to user (DRY RUN)
    const sendResult = await sendWhatsAppMessage(toNumber, cleanPhoneNumber, aiResponse.message);

    // Log the interaction
    console.log(`[WhatsApp Webhook] Processed message from ${cleanPhoneNumber} to gym ${gym.name}`);
    console.log(`[WhatsApp Webhook] AI Response: ${aiResponse.message.slice(0, 100)}...`);
    console.log(`[WhatsApp Webhook] AI Cost: $${aiResponse.cost.toFixed(6)}`);

    // Return 200 to acknowledge receipt to Twilio
    res.status(200).json({
      success: true,
      messageId: sendResult.messageId,
      aiCost: aiResponse.cost,
      action: aiResponse.action
    });

  } catch (error) {
    console.error('[WhatsApp Webhook] Processing error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

/**
 * POST /whatsapp/status
 * Receive message status updates from Twilio
 */
whatsappRouter.post('/status', async (req: Request, res: Response) => {
  try {
    console.log('[WhatsApp Status] Received:', JSON.stringify(req.body, null, 2));

    // Validate Twilio signature
    if (!validateTwilioSignature(req)) {
      return res.status(403).json({ success: false, error: 'Invalid signature' });
    }

    const parsed = TwilioStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[WhatsApp Status] Invalid payload:', parsed.error);
      return res.status(400).json({ success: false, error: 'Invalid status data' });
    }

    const { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage } = parsed.data;

    // Update message status in database
    await updateMessageStatus(MessageSid, MessageStatus, ErrorCode, ErrorMessage);

    // Handle failed messages
    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      await handleFailedMessage(MessageSid, From, To, ErrorCode, ErrorMessage);
    }

    console.log(`[WhatsApp Status] Updated message ${MessageSid} status to ${MessageStatus}`);

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('[WhatsApp Status] Processing error:', error);
    res.status(500).json({ success: false, error: 'Status processing failed' });
  }
});

/**
 * POST /whatsapp/send
 * Manual endpoint to send WhatsApp messages (for testing/admin)
 */
const SendMessageSchema = z.object({
  gymId: z.string().uuid(),
  to: z.string(),
  message: z.string(),
});

whatsappRouter.post('/send', async (req: Request, res: Response) => {
  try {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const { gymId, to, message } = parsed.data;

    // Get gym WhatsApp number
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { whatsappNumber: true, name: true }
    });

    if (!gym?.whatsappNumber) {
      return res.status(400).json({ success: false, error: 'Gym WhatsApp number not configured' });
    }

    // Send message (DRY RUN)
    const result = await sendWhatsAppMessage(gym.whatsappNumber, to, message);

    if (result.success) {
      res.json({
        success: true,
        messageId: result.messageId,
        dryRun: true
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }

  } catch (error) {
    console.error('[WhatsApp Send] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

/**
 * GET /whatsapp/webhook
 * Webhook verification for Twilio (if required)
 */
whatsappRouter.get('/webhook', (req: Request, res: Response) => {
  const { 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = req.query;

  // Verify token if configured
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expectedToken && verifyToken !== expectedToken) {
    return res.status(403).json({ success: false, error: 'Invalid verify token' });
  }

  res.status(200).send(challenge);
});

// Helper Functions

/**
 * Validate Twilio webhook signature for security
 */
function validateTwilioSignature(req: Request): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn('[WhatsApp] TWILIO_AUTH_TOKEN not configured - skipping signature validation');
    return true; // Allow in development
  }

  const signature = req.headers['x-twilio-signature'] as string;
  if (!signature) {
    return false;
  }

  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const body = req.body;

  // Create expected signature
  const data = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + body[key], url);

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha1=${expectedSignature}`)
  );
}

/**
 * Send WhatsApp message via Twilio (DRY RUN)
 */
async function sendWhatsAppMessage(
  from: string,
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {

  // DRY RUN - Log what would be sent
  const messageId = `dry_run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log('[WhatsApp Send] DRY RUN');
  console.log(`  From: ${from}`);
  console.log(`  To: ${to.slice(0, 4)}****`);
  console.log(`  Message: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`);
  console.log(`  Message ID: ${messageId}`);

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));

  // In production, this would use Twilio SDK:
  /*
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const result = await client.messages.create({
      from: `whatsapp:${from}`,
      to: `whatsapp:${to}`,
      body: message,
    });
    return { success: true, messageId: result.sid };
  } catch (error) {
    console.error('[WhatsApp Send] Twilio error:', error);
    return { success: false, error: error.message };
  }
  */

  return { success: true, messageId };
}

/**
 * Update message status in database
 */
async function updateMessageStatus(
  messageSid: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    // Find message by Twilio SID and update status
    const message = await prisma.message.findFirst({
      where: {
        metadata: {
          path: ['messageId'],
          equals: messageSid
        }
      }
    });

    if (message) {
      const updatedMetadata = {
        ...(message.metadata as any),
        status,
        statusUpdatedAt: new Date().toISOString(),
        ...(errorCode && { errorCode }),
        ...(errorMessage && { errorMessage })
      };

      await prisma.message.update({
        where: { id: message.id },
        data: {
          metadata: updatedMetadata,
          ...(status === 'delivered' && { deliveredAt: new Date() }),
          ...(status === 'read' && { readAt: new Date() })
        }
      });

      console.log(`[WhatsApp Status] Updated message ${messageSid} to ${status}`);
    }
  } catch (error) {
    console.error(`[WhatsApp Status] Error updating message ${messageSid}:`, error);
  }
}

/**
 * Handle failed message delivery
 */
async function handleFailedMessage(
  messageSid: string,
  from: string,
  to: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    console.error(`[WhatsApp Failed] Message ${messageSid} failed: ${errorCode} - ${errorMessage}`);

    // Find the lead associated with this phone number
    const cleanPhoneNumber = to.replace('whatsapp:', '');
    const lead = await prisma.lead.findFirst({
      where: { phone: cleanPhoneNumber },
      select: { id: true, gymId: true }
    });

    if (lead) {
      // Create journey entry for failed message
      await prisma.leadJourney.create({
        data: {
          leadId: lead.id,
          stage: 'nurturing', // Keep current stage
          fromStage: 'nurturing',
          channel: 'whatsapp',
          action: 'follow_up',
          message: `WhatsApp message failed: ${errorMessage || 'Delivery failure'}`,
          metadata: {
            messageSid,
            errorCode,
            errorMessage,
            failedAt: new Date().toISOString(),
          }
        }
      });

      // TODO: Implement fallback to email or SMS
      console.log(`[WhatsApp Failed] Should implement fallback messaging for lead ${lead.id}`);
    }
  } catch (error) {
    console.error(`[WhatsApp Failed] Error handling failed message:`, error);
  }
}

/**
 * GET /whatsapp/stats?gymId=
 * Get WhatsApp messaging stats for a gym
 */
whatsappRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const { gymId } = req.query;

    if (!gymId) {
      return res.status(400).json({ success: false, error: 'gymId is required' });
    }

    // Get basic stats from conversations and messages
    const [conversationCount, messageCount] = await Promise.all([
      prisma.conversation.count({
        where: { gymId: gymId as string, channel: 'whatsapp' }
      }),
      prisma.message.count({
        where: {
          conversation: {
            gymId: gymId as string,
            channel: 'whatsapp'
          }
        }
      })
    ]);

    // Mock additional stats (in production, these would come from Twilio)
    const stats = {
      totalConversations: conversationCount,
      totalMessages: messageCount,
      messagesThisWeek: Math.floor(messageCount * 0.3), // Mock
      deliveryRate: 95.5, // Mock
      responseRate: 78.2, // Mock
      avgResponseTime: '2.3 hours', // Mock
      dryRunMode: true,
    };

    res.json({ success: true, data: stats });

  } catch (error) {
    console.error('[WhatsApp Stats] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch WhatsApp stats' });
  }
});