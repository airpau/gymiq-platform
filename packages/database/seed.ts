import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding GymIQ database...');

  // Create pilot gym — Energie Fitness Hoddesdon
  const gym = await prisma.gym.upsert({
    where: { slug: 'energie-hoddesdon' },
    create: {
      name: 'Energie Fitness Hoddesdon',
      slug: 'energie-hoddesdon',
      crmType: 'glofox',
      crmTier: 'C',
      knowledgeBase: {
        gym_name: 'Energie Fitness Hoddesdon',
        location: 'Hoddesdon, Hertfordshire',
        hours: {
          monday_friday: '6:00 AM - 10:00 PM',
          saturday: '8:00 AM - 8:00 PM',
          sunday: '8:00 AM - 6:00 PM',
        },
        pricing: {
          monthly: '£29.99',
          annual: '£299',
          day_pass: '£10',
          student_discount: '20% off',
        },
        amenities: ['24/7 access', 'Personal training', 'Group classes', 'Sauna', 'Free parking'],
        classes: [
          'Yoga - Mon/Wed/Fri 7am',
          'Spin - Tue/Thu 6pm',
          'HIIT - Mon/Wed 6pm',
        ],
        faq: [
          { question: 'Do you have parking?', answer: 'Yes, free parking for all members in the rear lot.' },
          { question: 'Can I freeze my membership?', answer: 'Yes, up to 3 months per year. Contact reception.' },
          { question: 'Do you have personal trainers?', answer: 'Yes! Book a free consultation at reception.' },
        ],
        booking_link: 'https://energie-hoddesdon.glofox.com/book',
      },
    },
    update: {},
  });

  console.log(`Gym: ${gym.name} (${gym.id})`);

  // Sample members
  const members = await Promise.all([
    prisma.member.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        gymId: gym.id,
        crmId: 'M001',
        name: 'John Smith',
        email: 'john@example.com',
        phone: '+447123456789',
        status: 'active',
        membershipTier: 'Premium',
        joinDate: new Date('2024-01-15'),
        lastVisit: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        visitCount30d: 8,
        lifetimeValue: 359.88,
      },
      update: {},
    }),
    prisma.member.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        gymId: gym.id,
        crmId: 'M002',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+447987654321',
        status: 'sleeper',
        membershipTier: 'Standard',
        joinDate: new Date('2024-03-20'),
        lastVisit: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // 21 days ago
        visitCount30d: 0,
        riskScore: 75,
        riskFactors: ['No visits in 21 days', 'Previously missed payments'],
      },
      update: {},
    }),
  ]);

  console.log(`Members seeded: ${members.length}`);

  // Sample lead
  const lead = await prisma.lead.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      gymId: gym.id,
      source: 'abandoned_cart',
      name: 'Alex Turner',
      email: 'alex@example.com',
      phone: '+447111222333',
      enquiryDate: new Date(),
      currentStage: 'new',
    },
    update: {},
  });

  console.log(`Lead seeded: ${lead.name}`);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
