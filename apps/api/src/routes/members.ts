import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma, aiGateway } from '../lib/services';
import { scoreChurnRisk, runBatchChurnAnalysis } from '../services/churn-engine';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const memberRouter = Router();

// Apply authentication to all member routes
memberRouter.use(authenticate);
memberRouter.use(requireGymAccess);

const CreateMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  crmId: z.string().optional(),
  status: z.enum(['active', 'frozen', 'cancelled', 'sleeper']).default('active'),
  membershipTier: z.string().optional(),
  joinDate: z.string().datetime().optional(),
  nextPayment: z.string().datetime().optional(),
  lastVisit: z.string().datetime().optional(),
});

const UpdateMemberSchema = CreateMemberSchema.partial();

/**
 * GET /members?status=&riskMin=&page=&perPage=
 */
memberRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, riskMin, page = '1', perPage = '50' } = req.query;
    const gymId = req.user!.gymId; // Available from auth middleware

    const pageNum = parseInt(page as string, 10);
    const perPageNum = parseInt(perPage as string, 10);

    const where: Record<string, unknown> = { gymId: gymId as string };
    if (status) where.status = status;
    if (riskMin) where.riskScore = { gte: parseInt(riskMin as string, 10) };

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
        orderBy: { riskScore: 'desc' },
      }),
      prisma.member.count({ where }),
    ]);

    res.json({
      success: true,
      data: members,
      meta: { page: pageNum, perPage: perPageNum, total },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch members' });
  }
});

/**
 * GET /members/:id
 */
memberRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
      include: {
        conversations: {
          take: 5,
          orderBy: { lastMessageAt: 'desc' },
        },
      },
    });

    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    res.json({ success: true, data: member });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch member' });
  }
});

/**
 * GET /members/:id/full-profile
 * Returns EVERYTHING about a member for detailed view
 */
memberRouter.get('/:id/full-profile', async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
      include: {
        conversations: {
          orderBy: { lastMessageAt: 'desc' },
          include: {
            messages: {
              take: 3,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        calls: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        cancelSaveAttempts: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        staffTasks: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    // Calculate additional metrics
    const now = new Date();
    const daysSinceLastVisit = member.lastVisit
      ? Math.floor((now.getTime() - member.lastVisit.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Determine intervention category based on days since last visit
    let interventionCategory = 'active';
    if (daysSinceLastVisit !== null) {
      if (daysSinceLastVisit >= 60) {
        interventionCategory = 'doNotContact';
      } else if (daysSinceLastVisit >= 45) {
        interventionCategory = 'critical';
      } else if (daysSinceLastVisit >= 21) {
        interventionCategory = 'deep';
      } else if (daysSinceLastVisit >= 14) {
        interventionCategory = 'light';
      }
    }

    // Get visit history summary (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(now.getDate() - 90);

    // For now, we'll simulate visit data since we don't have a visits table
    // This should be replaced with actual visit data from the CRM
    const visitHistorySummary = {
      totalVisits: member.visitCount30d * 3, // Rough estimate
      last30Days: member.visitCount30d,
      last60Days: Math.floor(member.visitCount30d * 1.8),
      last90Days: Math.floor(member.visitCount30d * 2.5),
      trend: member.visitCount30d > 8 ? 'increasing' : member.visitCount30d > 4 ? 'stable' : 'decreasing',
    };

    // Determine risk band
    let riskBand = 'low';
    if (member.riskScore >= 61) {
      riskBand = 'high';
    } else if (member.riskScore >= 31) {
      riskBand = 'medium';
    }

    // Get payment status (simulate overdue amount)
    let paymentStatus = 'current';
    let overdueAmount = 0;

    if (member.nextPayment && member.nextPayment < now) {
      paymentStatus = 'overdue';
      const daysOverdue = Math.floor((now.getTime() - member.nextPayment.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 7) {
        overdueAmount = 49.99; // Example amounts
      } else if (daysOverdue <= 30) {
        overdueAmount = 99.98;
      } else {
        overdueAmount = 149.97;
      }
    }

    // Build communication history from conversations, calls, and messages
    const communicationHistory: Array<{
      date: Date;
      type: string;
      channel: string;
      direction: string;
      content: string;
      status: string;
    }> = [];

    // Add conversations
    member.conversations.forEach((conv) => {
      conv.messages.forEach((msg) => {
        communicationHistory.push({
          date: msg.createdAt,
          type: 'message',
          channel: conv.channel,
          direction: msg.direction,
          content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
          status: msg.readAt ? 'read' : msg.deliveredAt ? 'delivered' : 'sent',
        });
      });
    });

    // Add calls
    member.calls.forEach((call) => {
      communicationHistory.push({
        date: call.createdAt,
        type: 'call',
        channel: 'phone',
        direction: call.direction,
        content: call.aiSummary || `${call.status} call (${call.durationSeconds || 0}s)`,
        status: call.status,
      });
    });

    // Sort communication history by date (most recent first)
    communicationHistory.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Get retention actions from staff tasks
    const retentionActions = member.staffTasks
      .filter(task => task.category === 'retention' || task.category === 'manual_call')
      .map(task => ({
        date: task.createdAt,
        action: task.title,
        outcome: task.status === 'completed' ? task.resolution : task.status,
        notes: task.resolutionNotes,
      }));

    const fullProfile = {
      // Basic info
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      status: member.status,
      membershipTier: member.membershipTier,
      joinDate: member.joinDate,
      lastVisit: member.lastVisit,

      // Risk and engagement
      riskScore: member.riskScore,
      riskBand,
      riskFactors: member.riskFactors,
      daysSinceLastVisit,
      interventionCategory,

      // Visit metrics
      visitHistorySummary,

      // Financial
      lifetimeValue: member.lifetimeValue,
      nextPayment: member.nextPayment,
      paymentStatus,
      overdueAmount: paymentStatus === 'overdue' ? overdueAmount : 0,

      // Communication and actions
      communicationHistory: communicationHistory.slice(0, 20), // Last 20 interactions
      retentionActions,
      cancelSaveAttempts: member.cancelSaveAttempts,
      staffTasks: member.staffTasks,

      // Metadata
      preferences: member.preferences,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };

    res.json({ success: true, data: fullProfile });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch member full profile' });
  }
});

/**
 * POST /members
 */
memberRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const gymId = req.user!.gymId;

    const member = await prisma.member.create({
      data: {
        ...parsed.data,
        gymId,
        joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : undefined,
        nextPayment: parsed.data.nextPayment ? new Date(parsed.data.nextPayment) : undefined,
        lastVisit: parsed.data.lastVisit ? new Date(parsed.data.lastVisit) : undefined,
      },
    });

    res.status(201).json({ success: true, data: member });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create member' });
  }
});

/**
 * PUT /members/:id
 */
memberRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = UpdateMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const member = await prisma.member.update({
      where: { id: req.params.id },
      data: {
        ...parsed.data,
        joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : undefined,
        nextPayment: parsed.data.nextPayment ? new Date(parsed.data.nextPayment) : undefined,
        lastVisit: parsed.data.lastVisit ? new Date(parsed.data.lastVisit) : undefined,
      },
    });

    res.json({ success: true, data: member });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to update member' });
  }
});

/**
 * POST /members/analyze-churn
 * Batch heuristic churn analysis for all members in a gym.
 * Updates riskScore + riskFactors for every non-cancelled member.
 * No AI calls — uses the deterministic scoring engine (fast & cheap).
 *
 * Body: { gymId: string }
 */
memberRouter.post('/analyze-churn', async (req: Request, res: Response) => {
  try {
    const gymId = req.user!.gymId;

    const startedAt = Date.now();
    const summary = await runBatchChurnAnalysis(prisma, gymId);

    res.json({
      success: true,
      data: {
        ...summary,
        durationMs: Date.now() - startedAt,
        note: 'Scores updated via heuristic engine. Run GET /members/:id/risk-profile for AI-enhanced analysis.',
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Batch churn analysis failed' });
  }
});

/**
 * POST /members/:id/analyze-risk
 * Run Claude Sonnet churn analysis and update the member's risk score.
 */
memberRouter.post('/:id/analyze-risk', async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    const { riskScore, factors, cost } = await aiGateway.analyzeChurnRisk({
      name: member.name,
      status: member.status,
      lastVisit: member.lastVisit,
      visitCount30d: member.visitCount30d,
      nextPayment: member.nextPayment,
      membershipTier: member.membershipTier,
      joinDate: member.joinDate,
      lifetimeValue: member.lifetimeValue,
    });

    const updated = await prisma.member.update({
      where: { id: req.params.id },
      data: { riskScore, riskFactors: factors },
    });

    res.json({
      success: true,
      data: { riskScore, factors, member: updated, aiCost: cost },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Risk analysis failed' });
  }
});

/**
 * GET /members/:id/risk-profile
 * Detailed churn risk breakdown combining both heuristic scoring and
 * AI-enhanced analysis (Claude Sonnet).
 *
 * Returns:
 *   - heuristic score with factor weights
 *   - AI-generated factors + score
 *   - sleeper category & payment recovery stage
 *   - recommended retention actions
 */
memberRouter.get('/:id/risk-profile', async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) return res.status(404).json({ success: false, error: 'Member not found' });

    // ── Heuristic score (instant) ─────────────────────────────────────────
    const heuristic = scoreChurnRisk(member);

    // ── AI score (Claude Sonnet — richer context) ─────────────────────────
    let aiScore: { riskScore: number; factors: string[]; cost: number } | null = null;
    try {
      aiScore = await aiGateway.analyzeChurnRisk({
        name: member.name,
        status: member.status,
        lastVisit: member.lastVisit,
        visitCount30d: member.visitCount30d,
        nextPayment: member.nextPayment,
        membershipTier: member.membershipTier,
        joinDate: member.joinDate,
        lifetimeValue: member.lifetimeValue,
        currentHeuristicScore: heuristic.riskScore,
        heuristicFactors: heuristic.factors,
      });
    } catch (aiError) {
      console.warn('[risk-profile] AI analysis unavailable, falling back to heuristic only:', aiError);
    }

    // ── Persist the most recent score ─────────────────────────────────────
    const finalScore  = aiScore?.riskScore ?? heuristic.riskScore;
    const finalFactors = aiScore?.factors ?? heuristic.factors;

    const updated = await prisma.member.update({
      where: { id: req.params.id },
      data: { riskScore: finalScore, riskFactors: finalFactors },
    });

    // ── Recommended actions ────────────────────────────────────────────────
    const recommendedActions: string[] = [];
    if (heuristic.paymentRecoveryStage) {
      const stage = heuristic.paymentRecoveryStage;
      recommendedActions.push(
        stage === 1 ? 'Send payment reminder (1st notice)'
        : stage === 2 ? 'Send payment warning (2nd notice — access at risk)'
        : 'Send final payment notice — suspend access if unresolved'
      );
    }
    if (heuristic.sleeperCategory === 'lost') {
      recommendedActions.push('Trigger win-back campaign — high risk of permanent churn');
    } else if (heuristic.sleeperCategory === 'deep') {
      recommendedActions.push('Send personalised reactivation message with incentive');
    } else if (heuristic.sleeperCategory === 'light') {
      recommendedActions.push('Send friendly check-in message');
    }
    if (finalScore >= 61 && recommendedActions.length === 0) {
      recommendedActions.push('Schedule a manual check-in call from gym staff');
    }
    if (member.status === 'frozen') {
      recommendedActions.push('Confirm unpause date and send a welcome-back reminder');
    }

    res.json({
      success: true,
      data: {
        memberId: member.id,
        memberName: member.name,

        // Final combined score (AI when available, else heuristic)
        riskScore: finalScore,
        riskBand: finalScore >= 61 ? 'high' : finalScore >= 31 ? 'medium' : 'low',
        factors: finalFactors,

        heuristic: {
          riskScore: heuristic.riskScore,
          factors: heuristic.factors,
          sleeperCategory: heuristic.sleeperCategory,
          paymentRecoveryStage: heuristic.paymentRecoveryStage,
          daysSinceLastVisit: heuristic.daysSinceLastVisit,
          daysOverdue: heuristic.daysOverdue,
        },

        ai: aiScore
          ? { riskScore: aiScore.riskScore, factors: aiScore.factors, cost: aiScore.cost }
          : null,

        recommendedActions,
        member: updated,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Risk profile generation failed' });
  }
});

/**
 * DELETE /members/:id
 */
memberRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.member.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to delete member' });
  }
});
