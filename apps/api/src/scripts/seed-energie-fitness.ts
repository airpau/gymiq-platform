import 'dotenv/config';
import { prisma } from '../lib/prisma';

const ENERGIE_FITNESS_GYM_ID = '6169f878-8493-4cd9-974f-a554863a6f7f';

const energieFitnessData = {
  knowledgeBase: {
    gymName: 'Energie Fitness Hoddesdon',
    address: 'Hoddesdon, Hertfordshire',
    phone: '',
    facilities: [
      'Gym Floor',
      'Free Weights Area',
      'Cardio Zone',
      'Functional Training Area',
      'Recovery Zone (Infrared Sauna, Ice Bath, Massage Guns, Red Light Therapy Wall, Hyperice Compression Boots)',
      'Classes Studio',
      'Changing Rooms'
    ],
    pricing: {
      'Classic': '£31.99/month',
      'WOW': '£36.99/month',
      'Recovery Zone Session': '£10 per session',
      'Day Pass': '£8'
    },
    classes: [],
    faqs: [
      {
        q: 'What are your opening hours?',
        a: 'We are open 24/7 for members with key fob access. Staffed hours vary.'
      },
      {
        q: 'Do you have parking?',
        a: 'Yes, free parking available.'
      },
      {
        q: 'Can I bring a friend?',
        a: 'Yes! Guest passes are available.'
      },
      {
        q: 'What is the Recovery Zone?',
        a: 'Our premium recovery facility includes infrared sauna, ice bath, massage guns, red light therapy wall, and Hyperice compression therapy boots. Sessions are 45 minutes for £10.'
      },
      {
        q: 'How do I cancel?',
        a: '30 days notice required. Please speak to a member of staff or contact us.'
      },
      {
        q: 'Can I freeze my membership?',
        a: 'Yes, you can freeze for up to 3 months. Contact us to arrange.'
      }
    ],
    policies: {
      cancellation: '30 days written notice required',
      freeze: 'Up to 3 months, contact staff to arrange',
      guestPolicy: 'Guest passes available at reception',
      minAge: '16 years (14-15 with parent/guardian)'
    },
    tone: 'friendly, welcoming, professional, not pushy',
    usp: 'Premium Recovery Zone with infrared sauna, ice bath, and Hyperice compression therapy'
  },
  settings: {
    address: 'Hoddesdon, Hertfordshire',
    phone: '',
    email: '',
    website: '',
    openingHours: {
      monday: '24/7 (staffed hours vary)',
      tuesday: '24/7 (staffed hours vary)',
      wednesday: '24/7 (staffed hours vary)',
      thursday: '24/7 (staffed hours vary)',
      friday: '24/7 (staffed hours vary)',
      saturday: '24/7 (staffed hours vary)',
      sunday: '24/7 (staffed hours vary)'
    },
    aiSettings: {
      enabled: true,
      quietHours: {
        start: '21:00',
        end: '07:00'
      },
      maxContactAttempts: 3,
      escalationEnabled: true
    },
    bookingSettings: {
      enabled: true,
      defaultDuration: 45, // Recovery Zone sessions are 45 minutes
      advanceBookingDays: 14,
      reminderHours: 24,
      allowedTypes: ['tour', 'trial_class', 'consultation']
    },
    messagingSettings: {
      channels: {
        whatsapp: { enabled: true, priority: 1 },
        email: { enabled: true, priority: 2 },
        sms: { enabled: false, priority: 3 }
      },
      rateLimits: {
        messagesPerHour: 30,
        messagesPerDay: 150
      }
    },
    timezone: 'Europe/London',
    currency: 'GBP',
    language: 'en'
  }
};

async function seedEnergieFitness() {
  try {
    console.log('🌱 Seeding Energie Fitness Hoddesdon data...');

    // Check if the gym exists
    const existingGym = await prisma.gym.findUnique({
      where: { id: ENERGIE_FITNESS_GYM_ID },
      select: { id: true, name: true }
    });

    if (!existingGym) {
      console.log('⚠️  Gym not found, creating Energie Fitness Hoddesdon...');

      // Create the gym first
      await prisma.gym.create({
        data: {
          id: ENERGIE_FITNESS_GYM_ID,
          name: 'Energie Fitness Hoddesdon',
          slug: 'energie-fitness-hoddesdon',
          knowledgeBase: energieFitnessData.knowledgeBase,
          settings: energieFitnessData.settings
        }
      });

      console.log('✅ Created Energie Fitness Hoddesdon gym');
    } else {
      console.log(`📝 Updating existing gym: ${existingGym.name}`);

      // Update the existing gym
      await prisma.gym.update({
        where: { id: ENERGIE_FITNESS_GYM_ID },
        data: {
          knowledgeBase: energieFitnessData.knowledgeBase,
          settings: energieFitnessData.settings
        }
      });

      console.log('✅ Updated Energie Fitness Hoddesdon data');
    }

    // Verify the data was saved correctly
    const updatedGym = await prisma.gym.findUnique({
      where: { id: ENERGIE_FITNESS_GYM_ID },
      select: {
        id: true,
        name: true,
        knowledgeBase: true,
        settings: true
      }
    });

    console.log('\n📊 Seeded Data Summary:');
    console.log(`• Gym ID: ${updatedGym?.id}`);
    console.log(`• Gym Name: ${updatedGym?.name}`);
    console.log(`• Facilities: ${(updatedGym?.knowledgeBase as any)?.facilities?.length || 0} items`);
    console.log(`• Pricing Plans: ${Object.keys((updatedGym?.knowledgeBase as any)?.pricing || {}).length} plans`);
    console.log(`• FAQs: ${(updatedGym?.knowledgeBase as any)?.faqs?.length || 0} items`);
    console.log(`• Policies: ${Object.keys((updatedGym?.knowledgeBase as any)?.policies || {}).length} policies`);
    console.log(`• Opening Hours: ${Object.keys((updatedGym?.settings as any)?.openingHours || {}).length} days configured`);

    console.log('\n🎉 Energie Fitness Hoddesdon data seeded successfully!');

  } catch (error) {
    console.error('❌ Error seeding Energie Fitness data:', error);
    throw error;
  }
}

// Run the seed script
if (require.main === module) {
  seedEnergieFitness()
    .then(() => {
      console.log('✨ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seed failed:', error);
      process.exit(1);
    });
}

export { seedEnergieFitness, ENERGIE_FITNESS_GYM_ID };