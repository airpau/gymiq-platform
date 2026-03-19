import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/services';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const taskRouter = Router();

// Apply authentication to all routes
taskRouter.use(authenticate);
taskRouter.use(requireGymAccess);

const CreateTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['cancellation', 'freeze', 'retention', 'lead_followup', 'payment', 'manual_call', 'general']),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).default('medium'),
  memberId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

const UpdateTaskSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'dismissed']).optional(),
  assignedTo: z.string().optional(),
  resolution: z.string().optional(),
  resolutionNotes: z.string().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  dueDate: z.string().datetime().optional(),
});

const CompleteTaskSchema = z.object({
  resolution: z.string().min(1),
  resolutionNotes: z.string().optional(),
});

/**
 * GET /tasks?status=&priority=&category=&assignedTo=&date=
 * Returns tasks filtered by params
 */
taskRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, priority, category, assignedTo, date } = req.query;
    const gymId = req.user!.gymId;

    const where: Record<string, unknown> = { gymId };

    // Default to pending + in_progress tasks if no status filter provided
    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['pending', 'in_progress'] };
    }

    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (assignedTo) where.assignedTo = assignedTo;
    if (date) {
      const targetDate = new Date(date as string);
      const nextDay = new Date(targetDate);
      nextDay.setDate(targetDate.getDate() + 1);
      where.createdAt = {
        gte: targetDate,
        lt: nextDay,
      };
    }

    const tasks = await prisma.staffTask.findMany({
      where,
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            riskScore: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            currentStage: true,
            source: true,
          },
        },
      },
      orderBy: [
        // Urgent tasks first
        {
          priority: 'desc', // This works because enum values are ordered: urgent > high > medium > low
        },
        // Then by due date (overdue first)
        {
          dueDate: 'asc',
        },
        // Then by creation date (oldest first)
        {
          createdAt: 'asc',
        },
      ],
    });

    // Custom priority sorting to ensure correct order
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
    tasks.sort((a, b) => {
      const priorityA = priorityOrder[a.priority as keyof typeof priorityOrder];
      const priorityB = priorityOrder[b.priority as keyof typeof priorityOrder];

      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }

      // If same priority, sort by due date
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      // Finally by creation date
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

/**
 * GET /tasks/today
 * Today's tasks: all pending/in_progress, grouped by priority
 */
taskRouter.get('/today', async (req: Request, res: Response) => {
  try {
    const gymId = req.user!.gymId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tasks = await prisma.staffTask.findMany({
      where: {
        gymId: gymId as string,
        status: { in: ['pending', 'in_progress'] },
      },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            riskScore: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            currentStage: true,
            source: true,
          },
        },
      },
      orderBy: [
        { createdAt: 'asc' },
      ],
    });

    // Group tasks by priority and identify overdue
    const grouped = {
      urgent: [] as typeof tasks,
      high: [] as typeof tasks,
      medium: [] as typeof tasks,
      low: [] as typeof tasks,
      overdue: [] as typeof tasks,
    };

    const now = new Date();

    tasks.forEach((task) => {
      // Check if task is overdue
      if (task.dueDate && task.dueDate < now) {
        grouped.overdue.push(task);
      } else {
        grouped[task.priority as keyof typeof grouped]?.push(task);
      }
    });

    // Summary counts
    const counts = {
      urgent: grouped.urgent.length,
      high: grouped.high.length,
      medium: grouped.medium.length,
      low: grouped.low.length,
      overdue: grouped.overdue.length,
      total: tasks.length,
    };

    res.json({
      success: true,
      data: {
        tasks: grouped,
        counts,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch today\'s tasks' });
  }
});

/**
 * POST /tasks
 * Create a task manually
 */
taskRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = CreateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const gymId = req.user!.gymId;

    // Validate member/lead if provided
    if (parsed.data.memberId) {
      const member = await prisma.member.findUnique({ where: { id: parsed.data.memberId } });
      if (!member) return res.status(404).json({ success: false, error: 'Member not found' });
    }

    if (parsed.data.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
      if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const task = await prisma.staffTask.create({
      data: {
        ...parsed.data,
        gymId,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        createdBy: 'staff', // Could be enhanced to track specific staff member
      },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            riskScore: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            currentStage: true,
            source: true,
          },
        },
      },
    });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

/**
 * PUT /tasks/:id
 * Update task
 */
taskRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = UpdateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const updateData: any = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    if (parsed.data.dueDate) {
      updateData.dueDate = new Date(parsed.data.dueDate);
    }

    // Set completedAt when status changes to completed
    if (parsed.data.status === 'completed') {
      updateData.completedAt = new Date();
      updateData.completedBy = 'staff'; // Could be enhanced to track specific staff member
    }

    const task = await prisma.staffTask.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            riskScore: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            currentStage: true,
            source: true,
          },
        },
      },
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

/**
 * PUT /tasks/:id/complete
 * Quick complete task
 */
taskRouter.put('/:id/complete', async (req: Request, res: Response) => {
  try {
    const parsed = CompleteTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const task = await prisma.staffTask.update({
      where: { id: req.params.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        completedBy: 'staff', // Could be enhanced to track specific staff member
        resolution: parsed.data.resolution,
        resolutionNotes: parsed.data.resolutionNotes,
        updatedAt: new Date(),
      },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            riskScore: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            currentStage: true,
            source: true,
          },
        },
      },
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to complete task' });
  }
});

/**
 * PUT /tasks/:id/dismiss
 * Dismiss task with reason
 */
taskRouter.put('/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;

    const task = await prisma.staffTask.update({
      where: { id: req.params.id },
      data: {
        status: 'dismissed',
        resolutionNotes: reason || 'Task dismissed',
        updatedAt: new Date(),
        completedAt: new Date(),
        completedBy: 'staff',
      },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            riskScore: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            currentStage: true,
            source: true,
          },
        },
      },
    });

    res.json({ success: true, data: task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to dismiss task' });
  }
});

/**
 * GET /tasks/stats?gymId=
 * Summary statistics
 */
taskRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const gymId = req.user!.gymId;

    // Get current date boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const [
      totalPending,
      completedToday,
      completedThisWeek,
      byCategory,
      byPriority,
    ] = await Promise.all([
      // Total pending tasks
      prisma.staffTask.count({
        where: {
          gymId: gymId as string,
          status: { in: ['pending', 'in_progress'] },
        },
      }),

      // Completed today
      prisma.staffTask.count({
        where: {
          gymId: gymId as string,
          status: 'completed',
          completedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),

      // Completed this week
      prisma.staffTask.count({
        where: {
          gymId: gymId as string,
          status: 'completed',
          completedAt: {
            gte: weekAgo,
            lt: tomorrow,
          },
        },
      }),

      // By category
      prisma.staffTask.groupBy({
        by: ['category', 'status'],
        where: {
          gymId: gymId as string,
        },
        _count: {
          id: true,
        },
      }),

      // By priority
      prisma.staffTask.groupBy({
        by: ['priority', 'status'],
        where: {
          gymId: gymId as string,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    // Calculate average resolution time for completed tasks
    const completedTasks = await prisma.staffTask.findMany({
      where: {
        gymId: gymId as string,
        status: 'completed',
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    let avgResolutionTime = 0;
    if (completedTasks.length > 0) {
      const totalResolutionTime = completedTasks.reduce((sum, task) => {
        const resolutionTime = task.completedAt!.getTime() - task.createdAt.getTime();
        return sum + resolutionTime;
      }, 0);
      avgResolutionTime = Math.round(totalResolutionTime / completedTasks.length / (1000 * 60 * 60)); // Convert to hours
    }

    // Format category and priority breakdowns
    const categoryBreakdown: Record<string, { pending: number; completed: number; total: number }> = {};
    const priorityBreakdown: Record<string, { pending: number; completed: number; total: number }> = {};

    byCategory.forEach((item) => {
      if (!categoryBreakdown[item.category]) {
        categoryBreakdown[item.category] = { pending: 0, completed: 0, total: 0 };
      }
      if (item.status === 'completed') {
        categoryBreakdown[item.category].completed += item._count.id;
      } else if (item.status === 'pending' || item.status === 'in_progress') {
        categoryBreakdown[item.category].pending += item._count.id;
      }
      categoryBreakdown[item.category].total += item._count.id;
    });

    byPriority.forEach((item) => {
      if (!priorityBreakdown[item.priority]) {
        priorityBreakdown[item.priority] = { pending: 0, completed: 0, total: 0 };
      }
      if (item.status === 'completed') {
        priorityBreakdown[item.priority].completed += item._count.id;
      } else if (item.status === 'pending' || item.status === 'in_progress') {
        priorityBreakdown[item.priority].pending += item._count.id;
      }
      priorityBreakdown[item.priority].total += item._count.id;
    });

    res.json({
      success: true,
      data: {
        totalPending,
        completedToday,
        completedThisWeek,
        avgResolutionTimeHours: avgResolutionTime,
        categoryBreakdown,
        priorityBreakdown,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Failed to fetch task stats' });
  }
});