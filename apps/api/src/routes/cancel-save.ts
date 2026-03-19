import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cancelSaveEngine } from '../services/cancel-save';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const cancelSaveRouter = Router();

// Apply authentication to all routes
cancelSaveRouter.use(authenticate);
cancelSaveRouter.use(requireGymAccess);

/**
 * POST /cancel-save/initiate
 * Start cancel-save flow for a member
 */
cancelSaveRouter.post('/initiate', async (req, res) => {
  try {
    const { memberId, initialMessage } = req.body;
    const gymId = req.user!.gymId;

    if (!memberId || !initialMessage) {
      return res.status(400).json({
        error: 'Missing required fields: memberId, initialMessage'
      });
    }

    // Verify member exists
    const member = await prisma.member.findFirst({
      where: { id: memberId, gymId }
    });

    if (!member) {
      return res.status(404).json({
        error: 'Member not found'
      });
    }

    const result = await cancelSaveEngine.initiateCancelSave(
      gymId,
      memberId,
      initialMessage
    );

    if ('error' in result) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      attemptId: result.attemptId,
      response: result.response
    });
  } catch (error) {
    console.error('[Cancel-Save API] Initiate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /cancel-save/:id/respond
 * Process member response in save flow
 */
cancelSaveRouter.post('/:id/respond', async (req, res) => {
  try {
    const { id: attemptId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Missing required field: message'
      });
    }

    const result = await cancelSaveEngine.processCancelSaveMessage(
      attemptId,
      message
    );

    if ('error' in result) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      response: result.response
    });
  } catch (error) {
    console.error('[Cancel-Save API] Respond error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /cancel-save/active
 * Get active cancel-save conversations for a gym
 */
cancelSaveRouter.get('/active', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    const activeAttempts = await cancelSaveEngine.getActiveCancelSaveAttempts(gymId);

    res.json({
      success: true,
      data: activeAttempts
    });
  } catch (error) {
    console.error('[Cancel-Save API] Get active error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /cancel-save/stats
 * Get cancel-save statistics for a gym
 */
cancelSaveRouter.get('/stats', async (req, res) => {
  try {
    const { days } = req.query;
    const gymId = req.user!.gymId;

    const daysNum = days ? parseInt(days as string) : 30;
    const stats = await cancelSaveEngine.getCancelSaveStats(gymId, daysNum);

    if (!stats) {
      return res.status(500).json({
        error: 'Failed to retrieve statistics'
      });
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[Cancel-Save API] Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /cancel-save/history
 * Get historical save attempts with outcomes
 */
cancelSaveRouter.get('/history', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const gymId = req.user!.gymId;

    const limitNum = limit ? parseInt(limit as string) : 50;
    const offsetNum = offset ? parseInt(offset as string) : 0;

    const attempts = await prisma.cancelSaveAttempt.findMany({
      where: {
        gymId,
        outcome: { not: 'in_progress' }
      },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            membershipTier: true,
            lifetimeValue: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      skip: offsetNum
    });

    // Calculate summary stats
    const totalAttempts = await prisma.cancelSaveAttempt.count({
      where: {
        gymId,
        outcome: { not: 'in_progress' }
      }
    });

    const saved = attempts.filter(a => a.outcome === 'saved').length;
    const lost = attempts.filter(a => a.outcome === 'lost').length;
    const escalated = attempts.filter(a => a.outcome === 'escalated').length;

    res.json({
      success: true,
      data: {
        attempts: attempts.map(attempt => ({
          id: attempt.id,
          member: attempt.member,
          reason: attempt.reason,
          reasonCategory: attempt.reasonCategory,
          offerMade: attempt.offerMade,
          offerType: attempt.offerType,
          outcome: attempt.outcome,
          conversationLength: Array.isArray(attempt.conversationLog)
            ? attempt.conversationLog.length
            : 0,
          createdAt: attempt.createdAt,
          savedAt: attempt.savedAt,
          lostAt: attempt.lostAt
        })),
        pagination: {
          total: totalAttempts,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < totalAttempts
        },
        summary: {
          saved,
          lost,
          escalated,
          saveRate: totalAttempts > 0 ? Math.round((saved / totalAttempts) * 100) : 0
        }
      }
    });
  } catch (error) {
    console.error('[Cancel-Save API] Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /cancel-save/:id
 * Get specific cancel-save attempt details
 */
cancelSaveRouter.get('/:id', async (req, res) => {
  try {
    const { id: attemptId } = req.params;

    const attempt = await prisma.cancelSaveAttempt.findUnique({
      where: { id: attemptId },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            membershipTier: true,
            lifetimeValue: true,
            joinDate: true
          }
        },
        gym: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!attempt) {
      return res.status(404).json({
        error: 'Cancel-save attempt not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: attempt.id,
        member: attempt.member,
        gym: attempt.gym,
        reason: attempt.reason,
        reasonCategory: attempt.reasonCategory,
        offerMade: attempt.offerMade,
        offerType: attempt.offerType,
        outcome: attempt.outcome,
        conversationLog: Array.isArray(attempt.conversationLog)
          ? attempt.conversationLog
          : [],
        metadata: attempt.metadata,
        createdAt: attempt.createdAt,
        savedAt: attempt.savedAt,
        lostAt: attempt.lostAt
      }
    });
  } catch (error) {
    console.error('[Cancel-Save API] Get attempt error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /cancel-save/:id/escalate
 * Manually escalate a cancel-save attempt to human
 */
cancelSaveRouter.patch('/:id/escalate', async (req, res) => {
  try {
    const { id: attemptId } = req.params;
    const { reason } = req.body;

    const attempt = await prisma.cancelSaveAttempt.findUnique({
      where: { id: attemptId }
    });

    if (!attempt) {
      return res.status(404).json({
        error: 'Cancel-save attempt not found'
      });
    }

    if (attempt.outcome !== 'in_progress') {
      return res.status(400).json({
        error: 'Can only escalate active attempts'
      });
    }

    await prisma.cancelSaveAttempt.update({
      where: { id: attemptId },
      data: {
        outcome: 'escalated',
        metadata: {
          ...attempt.metadata as any,
          escalationReason: reason || 'Manually escalated',
          escalatedAt: new Date()
        }
      }
    });

    res.json({
      success: true,
      message: 'Cancel-save attempt escalated to human'
    });
  } catch (error) {
    console.error('[Cancel-Save API] Escalate error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});