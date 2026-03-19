let PrismaClient: any;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (error) {
  console.warn('⚠️ Prisma client not available:', error.message);
  // Mock Prisma client for fallback
  PrismaClient = class MockPrismaClient {
    constructor() {
      console.warn('🔄 Using mock Prisma client - database operations will fail gracefully');
    }
  };
}

const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
