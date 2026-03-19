import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma, aiGateway, twilioService } from '../lib/services';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const conversationRouter = Router();

// Apply authentication to all routes
conversationRouter.use(authenticate);
conversationRouter.use(requireGymAccess);

/**
 * GET /conversations?status=&phone=&page=&perPage=
 */
conversationRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, phone, page = '1', perPage = '50' } = req.query;
    const gymId = req.user!.gymId;

    const pageNum = parseInt(page as string, 10);
    const perPageNum = parseInt(perPage as string, 10);

    const where: Record<string, unknown> = { gymId };
    if (status) where.status = status;
    if (phone) where.phone = phone;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          member: { select: { id: true, name: true, phone: true } },
          lead: { select: { id: true, name: true, phone: true } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({
      success: true,
      data: conversations,
      meta: { page: pageNum, perPage: perPageNum, total },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /conversations/:id — full conversation with all messages
 */
conversationRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        member: true,
        lead: true,
        messages: { orderBy: { createdAt: 'asc' } },
        gym: { select: { id: true, name: true, whatsappNumber: true } },
      },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversation' });
  }
});

const SendMessageSchema = z.object({
  content: z.string().min(1),
  useAI: z.boolean().default(false),
});

/**
 * POST /conversations/:id/messages
 * Send a message in a conversation — either manual (dashboard) or AI-generated.
 */
conversationRouter.post('/:id/messages', async (req: Request, res: Response) => {
  try {
    const parsed = SendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { gym: true },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    let content = parsed.data.content;
    let aiModel: string | undefined;
    let aiCost: number | undefined;

    if (parsed.data.useAI) {
      const result = await aiGateway.generateMemberReply(
        content,
        conversation.context,
        conversation.gym.knowledgeBase
      );
      content = result.reply;
      aiModel = 'gpt-4o-mini';
      aiCost = result.cost;
    }

    // Send via Twilio
    if (conversation.gym.whatsappNumber) {
      await twilioService.sendWhatsApp(
        conversation.phone,
        conversation.gym.whatsappNumber,
        content
      );
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        content,
        aiModel,
        aiCost,
        sentAt: new Date(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

/**
 * PUT /conversations/:id/status
 * Update conversation status (e.g., close, assign to human).
 */
conversationRouter.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;

    if (!['active', 'closed', 'waiting_human'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({ success: true, data: conversation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
});
