import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding staff tasks...');

  const gymId = '6169f878-8493-4cd9-974f-a554863a6f7f'; // Energie Fitness Hoddesdon

  // Clear existing staff tasks for clean seed
  await prisma.staffTask.deleteMany({
    where: { gymId }
  });

  console.log('📝 Creating test staff tasks...');

  // Get some existing members for realistic data
  const members = await prisma.member.findMany({
    where: { gymId },
    take: 6,
  });

  const leads = await prisma.lead.findMany({
    where: { gymId },
    take: 2,
  });

  const seedTasks = [
    // URGENT TASKS (3)
    {
      gymId,
      title: 'URGENT: Process cancellation in GloFox - John Smith',
      description: 'Member requested cancellation. AI could not retain. Process cancellation in GloFox system and update member status.',
      category: 'cancellation',
      priority: 'urgent',
      status: 'pending',
      memberId: members[0]?.id,
      assignedTo: 'Sarah Thompson',
      createdBy: 'ai',
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), // Due in 2 hours
      metadata: {
        aiAttempted: true,
        reason: 'moving_away',
        cancelSaveResult: 'failed'
      }
    },
    {
      gymId,
      title: 'URGENT: Process cancellation in GloFox - Emma Wilson',
      description: 'Member unhappy with service. Escalated from AI. Process cancellation and document feedback for management review.',
      category: 'cancellation',
      priority: 'urgent',
      status: 'pending',
      memberId: members[1]?.id,
      assignedTo: 'Mike Johnson',
      createdBy: 'ai',
      dueDate: new Date(Date.now() + 1 * 60 * 60 * 1000), // Due in 1 hour
      metadata: {
        aiAttempted: true,
        reason: 'service_quality',
        escalationReason: 'customer_complaint'
      }
    },
    {
      gymId,
      title: 'URGENT: Critical member needs immediate phone call - David Brown',
      description: 'High-value member (£2,400 LTV) showing critical churn risk. 45+ days since last visit. Requires personal manager call.',
      category: 'manual_call',
      priority: 'urgent',
      status: 'pending',
      memberId: members[2]?.id,
      assignedTo: 'Sarah Thompson',
      createdBy: 'system',
      dueDate: new Date(Date.now() + 4 * 60 * 60 * 1000), // Due in 4 hours
      metadata: {
        riskScore: 89,
        daysSinceLastVisit: 47,
        lifetimeValue: 2400,
        interventionCategory: 'critical'
      }
    },

    // HIGH TASKS (2)
    {
      gymId,
      title: 'Deep sleeper outreach - Lisa Garcia',
      description: 'Member hasn\'t visited in 28 days. Send personalized reactivation message with special Recovery Zone offer.',
      category: 'retention',
      priority: 'high',
      status: 'pending',
      memberId: members[3]?.id,
      assignedTo: null,
      createdBy: 'system',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24 hours
      metadata: {
        daysSinceLastVisit: 28,
        interventionCategory: 'deep',
        suggestedOffer: 'recovery_zone_session'
      }
    },
    {
      gymId,
      title: 'Overdue payment follow-up - Alex Chen',
      description: 'Payment failed 5 days ago. Member hasn\'t responded to automated reminders. Personal follow-up required.',
      category: 'payment',
      priority: 'high',
      status: 'pending',
      memberId: members[4]?.id,
      assignedTo: 'Mike Johnson',
      createdBy: 'system',
      dueDate: new Date(Date.now() + 8 * 60 * 60 * 1000), // Due in 8 hours
      metadata: {
        daysOverdue: 5,
        overdueAmount: 49.99,
        paymentFailureReason: 'insufficient_funds'
      }
    },

    // MEDIUM TASKS (2)
    {
      gymId,
      title: 'Follow-up check-in - Sophie Williams',
      description: 'Light sleeper (18 days since visit). Send friendly check-in message to encourage return.',
      category: 'retention',
      priority: 'medium',
      status: 'pending',
      memberId: members[5]?.id,
      assignedTo: null,
      createdBy: 'system',
      dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // Due in 48 hours
      metadata: {
        daysSinceLastVisit: 18,
        interventionCategory: 'light',
        lastVisitActivity: 'cardio_class'
      }
    },
    {
      gymId,
      title: 'Booking reminder - Tour with James Parker',
      description: 'Lead has tour booked for tomorrow at 10am. Send reminder and preparation instructions.',
      category: 'lead_followup',
      priority: 'medium',
      status: 'pending',
      leadId: leads[0]?.id,
      assignedTo: 'Sarah Thompson',
      createdBy: 'system',
      dueDate: new Date(Date.now() + 12 * 60 * 60 * 1000), // Due in 12 hours
      metadata: {
        bookingDate: new Date(Date.now() + 36 * 60 * 60 * 1000), // Tour tomorrow
        leadStage: 'booked',
        tourType: 'full_facility'
      }
    },

    // LOW TASK (1)
    {
      gymId,
      title: 'Update member details - Contact info correction',
      description: 'Member reported phone number change via front desk. Update contact details in system.',
      category: 'general',
      priority: 'low',
      status: 'pending',
      memberId: members[0]?.id,
      assignedTo: null,
      createdBy: 'staff',
      dueDate: new Date(Date.now() + 72 * 60 * 60 * 1000), // Due in 72 hours
      metadata: {
        updateType: 'contact_info',
        oldPhone: '+44 7700 900123',
        newPhone: '+44 7700 900999',
        requestedBy: 'front_desk'
      }
    }
  ];

  // Create tasks
  for (const task of seedTasks) {
    await prisma.staffTask.create({
      data: task
    });
  }

  console.log(`✅ Created ${seedTasks.length} test staff tasks:`);
  console.log(`   • ${seedTasks.filter(t => t.priority === 'urgent').length} urgent tasks`);
  console.log(`   • ${seedTasks.filter(t => t.priority === 'high').length} high priority tasks`);
  console.log(`   • ${seedTasks.filter(t => t.priority === 'medium').length} medium priority tasks`);
  console.log(`   • ${seedTasks.filter(t => t.priority === 'low').length} low priority task`);

  // Create a few completed tasks for stats
  const completedTasks = [
    {
      gymId,
      title: 'Completed: Welcome call to new member',
      description: 'Introduction call completed successfully',
      category: 'general',
      priority: 'medium',
      status: 'completed',
      memberId: members[0]?.id,
      assignedTo: 'Sarah Thompson',
      createdBy: 'system',
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // Completed 2 hours ago
      completedBy: 'Sarah Thompson',
      resolution: 'Member welcomed, tour booked for next week',
      resolutionNotes: 'Very enthusiastic new member, interested in personal training',
      metadata: {
        callDuration: 15,
        nextAction: 'book_pt_session'
      }
    },
    {
      gymId,
      title: 'Completed: Payment issue resolved',
      description: 'Card details updated after failed payment',
      category: 'payment',
      priority: 'high',
      status: 'completed',
      memberId: members[1]?.id,
      assignedTo: 'Mike Johnson',
      createdBy: 'system',
      completedAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // Completed 4 hours ago
      completedBy: 'Mike Johnson',
      resolution: 'Member updated card details, payment processed successfully',
      resolutionNotes: 'Card was expired, member very cooperative',
      metadata: {
        paymentAmount: 49.99,
        newPaymentMethod: 'visa_ending_4567'
      }
    }
  ];

  for (const task of completedTasks) {
    await prisma.staffTask.create({
      data: task
    });
  }

  console.log(`✅ Also created ${completedTasks.length} completed tasks for testing stats`);
  console.log('🎉 Staff tasks seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding staff tasks:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });