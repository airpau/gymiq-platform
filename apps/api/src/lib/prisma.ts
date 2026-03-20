import path from 'path';

// Candidate paths for @prisma/client - try multiple locations to handle different working directories
const candidates = [
  path.join(process.cwd(), 'node_modules', '@prisma', 'client'),
  path.join(process.cwd(), '..', 'node_modules', '@prisma', 'client'),
  path.join(process.cwd(), '../..', 'node_modules', '@prisma', 'client'),
  '@prisma/client',
];

let PrismaClient: any = null;

for (const candidate of candidates) {
  try {
    const mod = require(candidate);
    if (mod && mod.PrismaClient) {
      // Test that the constructor works before committing
      try {
        const testClient = new mod.PrismaClient({ log: [] });
        // If we get here, it works
        PrismaClient = mod.PrismaClient;
        console.log(`✅ Prisma client loaded from: ${candidate}`);
        break;
      } catch (constructorError: any) {
        console.warn(`⚠️  Prisma client at ${candidate} failed to construct: ${constructorError.message}`);
        // Try next candidate
      }
    }
  } catch {
    // module not found, try next
  }
}

if (!PrismaClient) {
  console.error('❌ FATAL: Could not initialise Prisma client from any location.');
  console.error('   Run prisma generate before starting the server.');
  // Provide a mock so imports don't crash — DB calls will fail gracefully
  PrismaClient = class MockPrismaClient {
    constructor() {
      console.warn('🔄 Using mock Prisma client — all DB operations will fail');
    }
    async $connect() {}
    async $disconnect() {}
  };
}

const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
