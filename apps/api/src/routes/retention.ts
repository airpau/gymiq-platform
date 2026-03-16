/**
 * Retention Routes
 *
 * All analysis is read-only or dry-run.
 * No messages are sent — see SAFETY.md.
 *
 * GET  /retention/sleepers?gymId=   — sleeper list with categories
 * GET  /retention/overdue?gymId=    — overdue payment members
 * GET  /retention/dashboard?gymId=  — full retention metrics
 * GET  /retention/log?gymId=        — dry-run action log
 * POST /retention/run-analysis      — manually trigger batch churn analysis
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/services';
import { churnQueue } from '../lib/queue';
import { scoreChurnRisk, runBatchChurnAnalysis } from '../services/churn-engine';
import { getRetentionLog, logRetentionAction, DEFAULT_OFFERS, RetentionOffer } from '../services/retention-log';

export const retentionRouter = Router();

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * MS_PER_DAY);
}

// ─── GET /retention/sleepers ──────────────────────────────────────────────────

/**
 * Returns all members who haven't visited in 14+ days, grouped into INTERVENTION WINDOWS:
 *   light    — 14-20 days (friendly check-in)
 *   deep     — 21-45 days (PRIORITY with offer — sweet spot)
 *   critical — 46-60 days (manual staff call)
 *   lost     — 60+ days (DO NOT CONTACT — sleeping dogs)
 *
 * Query params:
 *   gymId (required) — filter by gym
 *   category (optional) — filter by 'light', 'deep', 'critical', 'lost'
 *   includeDoNotContact (optional) — include 60+ day sleepers (default: false)
 */
retentionRouter.get('/sleepers', async (req: Request, res: Response) => {
  try {
    const { gymId, category, includeDoNotContact } = req.query;
    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });

    const cutoff = daysAgo(14);

    const members = await prisma.member.findMany({
      where: {
        gymId: gymId as string,
        status: { in: ['active', 'sleeper', 'frozen'] },
        OR: [
          { lastVisit: { lt: cutoff } },
          { lastVisit: null },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        lastVisit: true,
        visitCount30d: true,
        membershipTier: true,
        riskScore: true,
        joinDate: true,
      },
      orderBy: { lastVisit: 'asc' },
    });

    // Categorise each sleeper using INTERVENTION WINDOWS
    const categorised = members
      .map((m) => {
        const days = m.lastVisit
          ? Math.floor((Date.now() - m.lastVisit.getTime()) / MS_PER_DAY)
          : null;

        let cat: 'light' | 'deep' | 'critical' | 'lost';
        let action: string;
        let priority: 'low' | 'medium' | 'high' | 'none';

        if (!days || days >= 60) {
          cat = 'lost';
          action = 'DO NOT CONTACT — sleeping dogs (contact may trigger cancellation)';
          priority = 'none';
        } else if (days >= 46) {
          cat = 'critical';
          action = 'Manual staff phone call — last chance before lost';
          priority = 'high';
        } else if (days >= 21) {
          cat = 'deep';
          action = 'PRIORITY — send offer (Recovery Zone, PT session, etc.)';
          priority = 'high';
        } else {
          cat = 'light';
          action = 'Friendly check-in — habit at risk but salvageable';
          priority = 'medium';
        }

        return { ...m, daysSinceVisit: days, sleeperCategory: cat, recommendedAction: action, priority };
      })
      .filter((m) => {
        if (category && m.sleeperCategory !== category) return false;
        if (m.sleeperCategory === 'lost' && includeDoNotContact !== 'true') return false;
        return true;
      });

    const light = categorised.filter((m) => m.sleeperCategory === 'light');
    const deep = categorised.filter((m) => m.sleeperCategory === 'deep');
    const critical = categorised.filter((m) => m.sleeperCategory === 'critical');
    const lost = categorised.filter((m) => m.sleeperCategory === 'lost');

    res.json({
      success: true,
      data: {
        summary: {
          total: categorised.length,
          light: light.length,
          deep: deep.length,
          critical: critical.length,
          lost: lost.length,
        },
        interventionWindows: {
          light: '14-20 days — friendly check-in',
          deep: '21-45 days — PRIORITY with offer (sweet spot)',
          critical: '46-60 days — manual staff call',
          lost: '60+ days — DO NOT CONTACT (sleeping dogs)',
        },
        sleepers: categorised,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch sleepers' });
  }
});

// ─── GET /retention/overdue ───────────────────────────────────────────────────

/**
 * Members with an overdue payment (nextPayment < now).
 * Includes the payment recovery stage (1/2/3) and days overdue.
 */
retentionRouter.get('/overdue', async (req: Request, res: Response) => {
  try {
    const { gymId } = req.query;
    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });

    const now = new Date();

    const members = await prisma.member.findMany({
      where: {
        gymId: gymId as string,
        status: { not: 'cancelled' },
        nextPayment: { lt: now },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        nextPayment: true,
        membershipTier: true,
        lifetimeValue: true,
        riskScore: true,
      },
      orderBy: { nextPayment: 'asc' },
    });

    const enriched = members.map((m) => {
      const daysOverdue = m.nextPayment
        ? Math.floor((now.getTime() - m.nextPayment.getTime()) / MS_PER_DAY)
        : 0;
      const stage: 1 | 2 | 3 = daysOverdue >= 15 ? 3 : daysOverdue >= 8 ? 2 : 1;
      return { ...m, daysOverdue, paymentRecoveryStage: stage };
    });

    const totalAtRisk = enriched.reduce(
      (sum, m) => sum + Number(m.lifetimeValue || 0),
      0
    );

    res.json({
      success: true,
      data: {
        summary: {
          total: enriched.length,
          stage1: enriched.filter((m) => m.paymentRecoveryStage === 1).length,
          stage2: enriched.filter((m) => m.paymentRecoveryStage === 2).length,
          stage3: enriched.filter((m) => m.paymentRecoveryStage === 3).length,
          totalAtRiskRevenue: Number(totalAtRisk.toFixed(2)),
        },
        members: enriched,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch overdue members' });
  }
});

// ─── GET /retention/dashboard ─────────────────────────────────────────────────

/**
 * Full retention metrics overview for a gym:
 *   - Member counts by status
 *   - Risk score distribution (low/medium/high)
 *   - Sleeper breakdown
 *   - Overdue stats + at-risk revenue
 *   - Monthly retention rate (approximation)
 *   - High-risk revenue exposure
 */
retentionRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { gymId } = req.query;
    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });

    const gid = gymId as string;
    const now  = new Date();
    const thirtyDaysAgo = daysAgo(30);

    // ── Parallel DB queries ──────────────────────────────────────────────────
    const [
      allMembers,
      overdueMembers,
      cancelledThisMonth,
      reactivatedThisMonth,
    ] = await Promise.all([
      // All non-cancelled members with enough fields to compute metrics
      prisma.member.findMany({
        where: { gymId: gid, status: { not: 'cancelled' } },
        select: {
          id: true,
          status: true,
          lastVisit: true,
          riskScore: true,
          lifetimeValue: true,
          visitCount30d: true,
          nextPayment: true,
          joinDate: true,
        },
      }),

      // Overdue payments
      prisma.member.count({
        where: {
          gymId: gid,
          status: { not: 'cancelled' },
          nextPayment: { lt: now },
        },
      }),

      // Members who cancelled in the last 30 days (approximation via updatedAt + status)
      prisma.member.count({
        where: {
          gymId: gid,
          status: 'cancelled',
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),

      // Members who visited in last 7 days but were previously sleepers (came back)
      prisma.member.count({
        where: {
          gymId: gid,
          status: { in: ['active', 'sleeper'] },
          lastVisit: { gte: daysAgo(7) },
          riskScore: { gte: 50 }, // Was flagged as medium/high risk
        },
      }),
    ]);

    // ── Status breakdown ─────────────────────────────────────────────────────
    const byStatus = { active: 0, frozen: 0, sleeper: 0, cancelled: 0 };
    for (const m of allMembers) {
      const s = m.status as keyof typeof byStatus;
      if (s in byStatus) byStatus[s]++;
    }

    // ── Risk distribution (using stored riskScore) ───────────────────────────
    const riskDistribution = { low: 0, medium: 0, high: 0 };
    for (const m of allMembers) {
      if (m.riskScore >= 61) riskDistribution.high++;
      else if (m.riskScore >= 31) riskDistribution.medium++;
      else riskDistribution.low++;
    }

    // ── Sleeper breakdown (INTERVENTION WINDOWS) ─────────────────────────────
    const sleeperBreakdown = { light: 0, deep: 0, critical: 0, lost: 0 };
    for (const m of allMembers) {
      if (!m.lastVisit) { sleeperBreakdown.lost++; continue; }
      const days = Math.floor((now.getTime() - m.lastVisit.getTime()) / MS_PER_DAY);
      if (days >= 60) sleeperBreakdown.lost++;           // DO NOT CONTACT
      else if (days >= 46) sleeperBreakdown.critical++;  // Manual call
      else if (days >= 21) sleeperBreakdown.deep++;      // Priority with offer
      else if (days >= 14) sleeperBreakdown.light++;     // Friendly check-in
    }

    // ── Revenue at risk ──────────────────────────────────────────────────────
    const highRiskMembers = allMembers.filter((m) => m.riskScore >= 61);
    const atRiskRevenue = highRiskMembers.reduce(
      (sum, m) => sum + Number(m.lifetimeValue || 0),
      0
    );

    const overdueRevenue = allMembers
      .filter((m) => m.nextPayment && m.nextPayment < now)
      .reduce((sum, m) => sum + Number(m.lifetimeValue || 0), 0);

    // ── Monthly retention rate ───────────────────────────────────────────────
    // Formula: 1 - (cancellations_30d / active_members_start_of_month)
    // Approximated as: 1 - (cancelled_this_month / (active + cancelled_this_month))
    const activeCount = byStatus.active + byStatus.frozen + byStatus.sleeper;
    const retentionRate =
      activeCount + cancelledThisMonth > 0
        ? ((activeCount / (activeCount + cancelledThisMonth)) * 100).toFixed(1)
        : '100.0';

    // ── Intervention summary ─────────────────────────────────────────────────
    const interventionSummary = {
      light: {
        count: sleeperBreakdown.light,
        action: 'Friendly check-in (14-20 days)',
        channel: 'WhatsApp/SMS',
      },
      deep: {
        count: sleeperBreakdown.deep,
        action: 'PRIORITY — send offer (21-45 days)',
        channel: 'WhatsApp with offer',
        note: 'Sweet spot for re-engagement',
      },
      critical: {
        count: sleeperBreakdown.critical,
        action: 'Manual staff phone call (46-60 days)',
        channel: 'Phone call',
        note: 'Last chance before lost',
      },
      doNotContact: {
        count: sleeperBreakdown.lost,
        action: 'DO NOT CONTACT (60+ days)',
        note: 'Sleeping dogs — contact may trigger cancellation',
      },
    };

    res.json({
      success: true,
      data: {
        gym: gid,
        generatedAt: now.toISOString(),

        membersByStatus: {
          ...byStatus,
          total: activeCount,
        },

        riskDistribution: {
          ...riskDistribution,
          total: allMembers.length,
        },

        sleeperBreakdown: {
          ...sleeperBreakdown,
          total: sleeperBreakdown.light + sleeperBreakdown.deep + sleeperBreakdown.critical + sleeperBreakdown.lost,
        },

        interventionSummary,

        payments: {
          overdueCount: overdueMembers,
          overdueRevenue: Number(overdueRevenue.toFixed(2)),
          atRiskRevenue: Number(atRiskRevenue.toFixed(2)),
        },

        retention: {
          monthlyRetentionRate: `${retentionRate}%`,
          cancelledThisMonth,
          reactivatedThisMonth,
          highRiskMemberCount: highRiskMembers.length,
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to build retention dashboard' });
  }
});

// ─── GET /retention/log ───────────────────────────────────────────────────────

/**
 * Returns the in-memory dry-run retention action log.
 * Shows all messages that WOULD have been sent.
 */
retentionRouter.get('/log', async (req: Request, res: Response) => {
  try {
    const { gymId, limit = '100' } = req.query;
    const entries = getRetentionLog(gymId as string | undefined);
    const limitNum = parseInt(limit as string, 10);
    const page = entries.slice(0, limitNum);

    res.json({
      success: true,
      data: {
        total: entries.length,
        shown: page.length,
        entries: page,
        note: 'TEST MODE — no actual messages have been sent',
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to retrieve retention log' });
  }
});

// ─── POST /retention/run-analysis ────────────────────────────────────────────

/**
 * Manually trigger a full churn analysis for a gym (or all gyms).
 * Queues a BullMQ job that runs immediately.
 *
 * Body: { gymId?: string }
 */
retentionRouter.post('/run-analysis', async (req: Request, res: Response) => {
  try {
    const { gymId } = req.body as { gymId?: string };

    // Verify the gym exists if gymId is provided
    if (gymId) {
      const gym = await prisma.gym.findUnique({ where: { id: gymId } });
      if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });
    }

    const job = await churnQueue.add(
      'manual-churn-analysis',
      { gymId, triggeredBy: 'manual' },
      { priority: 1 }
    );

    res.json({
      success: true,
      data: {
        jobId: job.id,
        message: `Churn analysis queued${gymId ? ` for gym ${gymId}` : ' for all gyms'}`,
        note: 'Results will be reflected in member risk scores when the job completes',
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to queue churn analysis' });
  }
});

// ─── POST /retention/preview-actions ─────────────────────────────────────────

/**
 * Dry-run: compute what retention actions WOULD be triggered right now
 * for a gym, without persisting scores or sending anything.
 *
 * Uses INTERVENTION WINDOWS based on industry research:
 *  • 14-20 days:   Light sleeper — friendly check-in
 *  • 21-45 days:   Deep sleeper — PRIORITY CONTACT with gym-configured offer
 *  • 46-60 days:   Critical — manual staff call only
 *  • 60+ days:     Lost — DO NOT CONTACT (sleeping dogs)
 *
 * Body: { gymId: string, offerId?: string }
 */
retentionRouter.post('/preview-actions', async (req: Request, res: Response) => {
  try {
    const { gymId, offerId } = req.body as { gymId?: string; offerId?: string };
    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });

    const gym = await prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

    // Get gym-configured offers from settings, or use defaults
    const gymSettings = (gym.settings as Record<string, unknown>) || {};
    const gymOffers = (gymSettings.retentionOffers as RetentionOffer[]) || DEFAULT_OFFERS;
    const selectedOffer = offerId
      ? gymOffers.find((o) => o.id === offerId) || DEFAULT_OFFERS[0]
      : DEFAULT_OFFERS[0];

    const members = await prisma.member.findMany({
      where: { gymId, status: { not: 'cancelled' } },
      select: {
        id: true, name: true, phone: true, status: true,
        lastVisit: true, visitCount30d: true, nextPayment: true, joinDate: true,
      },
    });

    const actions: ReturnType<typeof logRetentionAction>[] = [];
    const summary = {
      newMemberNoVisit: 0,
      lightSleeper: 0,
      deepSleeper: 0,
      criticalManual: 0,
      doNotContact: 0,
      paymentStage1: 0,
      paymentStage2: 0,
      paymentStage3: 0,
      highRisk: 0,
    };

    for (const m of members) {
      const score = scoreChurnRisk(m);

      // Payment recovery takes priority
      if (score.paymentRecoveryStage === 3) {
        actions.push(logRetentionAction({
          gymId, memberId: m.id, memberName: m.name, phone: m.phone,
          actionType: 'payment_final_notice', riskScore: score.riskScore,
          daysOverdue: score.daysOverdue,
          paymentRecoveryStage: 3,
        }));
        summary.paymentStage3++;
      } else if (score.paymentRecoveryStage === 2) {
        actions.push(logRetentionAction({
          gymId, memberId: m.id, memberName: m.name, phone: m.phone,
          actionType: 'payment_warning', riskScore: score.riskScore,
          daysOverdue: score.daysOverdue,
          paymentRecoveryStage: 2,
        }));
        summary.paymentStage2++;
      } else if (score.paymentRecoveryStage === 1) {
        actions.push(logRetentionAction({
          gymId, memberId: m.id, memberName: m.name, phone: m.phone,
          actionType: 'payment_reminder', riskScore: score.riskScore,
          daysOverdue: score.daysOverdue,
          paymentRecoveryStage: 1,
        }));
        summary.paymentStage1++;
      }
      // New member dropout prevention (highest priority for non-payments)
      else if (score.interventionType === 'priority_offer' && m.joinDate) {
        const daysSinceJoin = Math.floor((Date.now() - m.joinDate.getTime()) / MS_PER_DAY);
        if (daysSinceJoin <= 30 && m.visitCount30d === 0) {
          actions.push(logRetentionAction({
            gymId, memberId: m.id, memberName: m.name, phone: m.phone,
            actionType: 'new_member_no_visit', riskScore: score.riskScore,
            daysSinceVisit: score.daysSinceLastVisit,
            offer: selectedOffer,
          }));
          summary.newMemberNoVisit++;
        }
      }
      // Sleeper intervention based on days since visit
      else if (score.daysSinceLastVisit) {
        const days = score.daysSinceLastVisit;

        if (days >= 60) {
          // DO NOT CONTACT — sleeping dogs
          summary.doNotContact++;
        } else if (days >= 46) {
          // Critical — manual staff call
          actions.push(logRetentionAction({
            gymId, memberId: m.id, memberName: m.name, phone: m.phone,
            actionType: 'critical_manual_call', riskScore: score.riskScore,
            daysSinceVisit: score.daysSinceLastVisit,
          }));
          summary.criticalManual++;
        } else if (days >= 21) {
          // Deep sleeper — priority offer
          actions.push(logRetentionAction({
            gymId, memberId: m.id, memberName: m.name, phone: m.phone,
            actionType: 'deep_sleeper_offer', riskScore: score.riskScore,
            daysSinceVisit: score.daysSinceLastVisit,
            offer: selectedOffer,
          }));
          summary.deepSleeper++;
        } else if (days >= 14) {
          // Light sleeper — friendly check-in
          actions.push(logRetentionAction({
            gymId, memberId: m.id, memberName: m.name, phone: m.phone,
            actionType: 'light_sleeper_checkin', riskScore: score.riskScore,
            daysSinceVisit: score.daysSinceLastVisit,
          }));
          summary.lightSleeper++;
        }
      }
      // High risk catch-all
      else if (score.riskBand === 'high') {
        actions.push(logRetentionAction({
          gymId, memberId: m.id, memberName: m.name, phone: m.phone,
          actionType: 'high_risk_retention', riskScore: score.riskScore,
        }));
        summary.highRisk++;
      }
    }

    res.json({
      success: true,
      data: {
        membersScanned: members.length,
        actionsWouldFire: actions.length,
        summary,
        selectedOffer,
        availableOffers: gymOffers,
        actions,
        note: 'DRY-RUN — no messages sent. See SAFETY.md',
        interventionWindows: {
          '14-20 days': 'Light sleeper — friendly check-in',
          '21-45 days': 'Deep sleeper — PRIORITY with offer (sweet spot)',
          '46-60 days': 'Critical — manual staff call only',
          '60+ days': 'DO NOT CONTACT (sleeping dogs)',
        },
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to preview retention actions' });
  }
});

// ─── GET /retention/offers ───────────────────────────────────────────────────

/**
 * Get available retention offers for a gym.
 * Returns gym-configured offers if set, otherwise default offers.
 *
 * Query: gymId (required)
 */
retentionRouter.get('/offers', async (req: Request, res: Response) => {
  try {
    const { gymId } = req.query;
    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });

    const gym = await prisma.gym.findUnique({ where: { id: gymId as string } });
    if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

    const gymSettings = (gym.settings as Record<string, unknown>) || {};
    const gymOffers = (gymSettings.retentionOffers as RetentionOffer[]) || null;

    res.json({
      success: true,
      data: {
        gymId,
        offers: gymOffers || DEFAULT_OFFERS,
        isCustom: !!gymOffers,
        defaultOffers: DEFAULT_OFFERS,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch retention offers' });
  }
});

// ─── POST /retention/offers ──────────────────────────────────────────────────

/**
 * Configure custom retention offers for a gym.
 * Replaces any existing custom offers.
 *
 * Body: { gymId: string, offers: RetentionOffer[] }
 */
retentionRouter.post('/offers', async (req: Request, res: Response) => {
  try {
    const { gymId, offers } = req.body as { gymId?: string; offers?: RetentionOffer[] };
    if (!gymId) return res.status(400).json({ success: false, error: 'gymId is required' });
    if (!offers || !Array.isArray(offers) || offers.length === 0) {
      return res.status(400).json({ success: false, error: 'offers array is required' });
    }

    // Validate offer structure
    for (const offer of offers) {
      if (!offer.id || !offer.name || !offer.description || !offer.normalValue || !offer.callToAction) {
        return res.status(400).json({
          success: false,
          error: 'Each offer must have: id, name, description, normalValue, callToAction',
        });
      }
    }

    const gym = await prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) return res.status(404).json({ success: false, error: 'Gym not found' });

    // Update gym settings with custom offers
    const currentSettings = (gym.settings as Record<string, unknown>) || {};
    const updatedSettings = { ...currentSettings, retentionOffers: offers };

    await prisma.gym.update({
      where: { id: gymId },
      data: { settings: updatedSettings as any },
    });

    res.json({
      success: true,
      data: {
        gymId,
        offers,
        message: 'Retention offers updated successfully',
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to update retention offers' });
  }
});
