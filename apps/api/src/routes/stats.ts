import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const statsRouter = Router();

// Apply authentication to all routes
statsRouter.use(authenticate);
statsRouter.use(requireGymAccess);

// GET /stats/overview - Unified dashboard stats
statsRouter.get('/overview', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    // Execute all queries in parallel for better performance
    const [
      membersStats,
      leadsStats,
      leadsByStage,
      atRiskMembers,
      cancelSaveStats,
      overduePayments,
      recentActivity
    ] = await Promise.all([
      // Member statistics
      prisma.member.groupBy({
        by: ['status'],
        where: { gymId },
        _count: true,
      }),

      // Lead statistics
      prisma.lead.aggregate({
        where: { gymId },
        _count: { id: true },
      }),

      // Leads by stage
      prisma.lead.groupBy({
        by: ['currentStage'],
        where: { gymId },
        _count: true,
      }),

      // At-risk members (risk score >= 61)
      prisma.member.aggregate({
        where: {
          gymId,
          riskScore: { gte: 61 }
        },
        _count: { id: true },
        _sum: { lifetimeValue: true }
      }),

      // Cancel-save statistics
      prisma.cancelSaveAttempt.groupBy({
        by: ['outcome'],
        where: {
          gymId,
          createdAt: {
            gte: new Date(new Date().getTime() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        _count: true,
      }),

      // Overdue payments (members with nextPayment in the past)
      prisma.member.aggregate({
        where: {
          gymId,
          status: 'active',
          nextPayment: {
            lt: new Date()
          }
        },
        _count: { id: true },
        _sum: { lifetimeValue: true }
      }),

      // Recent activity - combine lead journey and cancel save attempts
      Promise.all([
        prisma.leadJourney.findMany({
          where: {
            lead: { gymId },
            createdAt: {
              gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          },
          include: {
            lead: {
              select: { name: true, currentStage: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        prisma.cancelSaveAttempt.findMany({
          where: {
            gymId,
            createdAt: {
              gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          },
          include: {
            member: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        })
      ])
    ]);

    // Process member statistics
    const memberStatusCounts: Record<string, number> = {};
    for (const item of membersStats as any[]) {
      memberStatusCounts[item.status] = item._count;
    }

    const totalMembers = Object.values(memberStatusCounts).reduce((sum, count) => sum + count, 0);
    const activeMembers = memberStatusCounts.active || 0;
    const frozenMembers = memberStatusCounts.frozen || 0;
    const sleeperMembers = memberStatusCounts.sleeper || 0;

    // Process lead statistics
    const totalLeads = leadsStats._count.id;
    const leadsByStageMap: Record<string, number> = {};
    for (const item of leadsByStage as any[]) {
      leadsByStageMap[item.currentStage] = item._count;
    }

    const convertedLeads = leadsByStageMap.converted || 0;
    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    // Process at-risk data
    const atRiskMembersCount = atRiskMembers._count.id;
    const revenueAtRisk = Number(atRiskMembers._sum.lifetimeValue || 0);

    // Calculate sleeper breakdown based on risk score bands
    const sleeperBreakdown = await prisma.member.count({
      where: { gymId, status: 'sleeper' }
    });

    // Get more detailed sleeper categorization
    const sleeperCategorization = await Promise.all([
      prisma.member.count({
        where: {
          gymId,
          status: 'sleeper',
          riskScore: { gte: 1, lte: 30 }
        }
      }), // Light
      prisma.member.count({
        where: {
          gymId,
          status: 'sleeper',
          riskScore: { gte: 31, lte: 60 }
        }
      }), // Deep
      prisma.member.count({
        where: {
          gymId,
          status: 'sleeper',
          riskScore: { gte: 61, lte: 80 }
        }
      }), // Critical
      prisma.member.count({
        where: {
          gymId,
          status: 'sleeper',
          riskScore: { gte: 81, lte: 100 }
        }
      }) // Do Not Contact
    ]);

    // Process cancel-save statistics
    const cancelSaveByOutcome: Record<string, number> = {};
    for (const item of cancelSaveStats as any[]) {
      cancelSaveByOutcome[item.outcome] = item._count;
    }

    const totalCancelSaves = Object.values(cancelSaveByOutcome).reduce((sum, count) => sum + count, 0);
    const savedMembers = cancelSaveByOutcome.saved || 0;
    const saveRate = totalCancelSaves > 0 ? Math.round((savedMembers / totalCancelSaves) * 100) : 0;

    // Process recent activity
    const [leadActivities, cancelSaveActivities] = recentActivity;

    const combinedActivity = [
      ...leadActivities.map(activity => ({
        id: activity.id,
        type: 'lead_activity',
        title: `${activity.lead.name || 'Lead'} ${activity.action}`,
        description: `Moved to ${activity.stage} stage`,
        timestamp: activity.createdAt,
        metadata: {
          leadName: activity.lead.name,
          stage: activity.stage,
          action: activity.action
        }
      })),
      ...cancelSaveActivities.map(activity => ({
        id: activity.id,
        type: 'cancel_save',
        title: `Cancel-save attempt for ${activity.member.name}`,
        description: `Status: ${activity.outcome}`,
        timestamp: activity.createdAt,
        metadata: {
          memberName: activity.member.name,
          outcome: activity.outcome,
          reason: activity.reason
        }
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);

    // Calculate today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [newLeadsToday, messagesSentToday] = await Promise.all([
      prisma.lead.count({
        where: {
          gymId,
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        }
      }),
      prisma.message.count({
        where: {
          conversation: { gymId },
          direction: 'outbound',
          createdAt: {
            gte: today,
            lt: tomorrow
          }
        }
      })
    ]);

    // Calculate saves this week
    const weekAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
    const savesThisWeek = await prisma.cancelSaveAttempt.count({
      where: {
        gymId,
        outcome: 'saved',
        savedAt: {
          gte: weekAgo
        }
      }
    });

    const response = {
      // Overview cards data
      totalMembers,
      activeMembers,
      frozenMembers,
      totalLeads,
      atRiskMembers: atRiskMembersCount,
      monthlyConversionRate: conversionRate,
      revenueAtRisk,
      saveRate,

      // Quick stats
      quickStats: {
        newLeadsToday,
        messagesSentToday,
        savesThisWeek
      },

      // Detailed breakdowns
      memberBreakdown: memberStatusCounts,
      leadsByStage: leadsByStageMap,
      sleeperBreakdown: {
        light: sleeperCategorization[0],      // 1-30
        deep: sleeperCategorization[1],       // 31-60
        critical: sleeperCategorization[2],   // 61-80
        doNotContact: sleeperCategorization[3] // 81-100
      },
      cancelSaveBreakdown: cancelSaveByOutcome,

      // Overdue payments
      overduePayments: {
        count: overduePayments._count.id,
        revenue: Number(overduePayments._sum.lifetimeValue || 0)
      },

      // Recent activity feed
      recentActivity: combinedActivity,

      // Metadata
      lastUpdated: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Stats overview error:', error);
    res.status(500).json({
      error: 'Failed to fetch stats overview',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /stats/retention - Retention-specific stats
statsRouter.get('/retention', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    const [sleepersByCategory, riskDistribution] = await Promise.all([
      // Sleepers by intervention category
      Promise.all([
        prisma.member.findMany({
          where: {
            gymId,
            status: 'sleeper',
            riskScore: { gte: 1, lte: 30 }
          },
          select: {
            id: true,
            name: true,
            lastVisit: true,
            riskScore: true,
            membershipTier: true,
            lifetimeValue: true
          },
          take: 50
        }),
        prisma.member.findMany({
          where: {
            gymId,
            status: 'sleeper',
            riskScore: { gte: 31, lte: 60 }
          },
          select: {
            id: true,
            name: true,
            lastVisit: true,
            riskScore: true,
            membershipTier: true,
            lifetimeValue: true
          },
          take: 50
        }),
        prisma.member.findMany({
          where: {
            gymId,
            status: 'sleeper',
            riskScore: { gte: 61, lte: 80 }
          },
          select: {
            id: true,
            name: true,
            lastVisit: true,
            riskScore: true,
            membershipTier: true,
            lifetimeValue: true
          },
          take: 50
        }),
        prisma.member.findMany({
          where: {
            gymId,
            status: 'sleeper',
            riskScore: { gte: 81, lte: 100 }
          },
          select: {
            id: true,
            name: true,
            lastVisit: true,
            riskScore: true,
            membershipTier: true,
            lifetimeValue: true
          },
          take: 50
        })
      ]),

      // Get risk score distribution for charts
      Promise.all([
        prisma.member.count({
          where: { gymId, status: { in: ['active', 'sleeper'] }, riskScore: { lte: 30 } }
        }),
        prisma.member.count({
          where: { gymId, status: { in: ['active', 'sleeper'] }, riskScore: { gte: 31, lte: 60 } }
        }),
        prisma.member.count({
          where: { gymId, status: { in: ['active', 'sleeper'] }, riskScore: { gte: 61 } }
        })
      ])
    ]);

    const [lightMembers, deepMembers, criticalMembers, doNotContactMembers] = sleepersByCategory;
    const [lowRisk, mediumRisk, highRisk] = riskDistribution;

    const response = {
      interventionWindows: {
        light: {
          count: lightMembers.length,
          description: '14-20 days since last visit',
          priority: 'low',
          recommendedAction: 'Gentle check-in message',
          members: lightMembers
        },
        deep: {
          count: deepMembers.length,
          description: '21-45 days since last visit',
          priority: 'medium',
          recommendedAction: 'Personal outreach with offer',
          members: deepMembers
        },
        critical: {
          count: criticalMembers.length,
          description: '46-60 days since last visit',
          priority: 'high',
          recommendedAction: 'Urgent intervention required',
          members: criticalMembers
        },
        doNotContact: {
          count: doNotContactMembers.length,
          description: '60+ days, marked as do not contact',
          priority: 'none',
          recommendedAction: 'No action - respect preference',
          members: doNotContactMembers
        }
      },
      riskDistribution: {
        low: lowRisk,
        medium: mediumRisk,
        high: highRisk
      },
      lastUpdated: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Stats retention error:', error);
    res.status(500).json({
      error: 'Failed to fetch retention stats',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});