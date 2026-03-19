import path from 'path';

let PrismaClient: any;

// Try loading Prisma client — first from cwd (root node_modules in Railway/monorepo),
// then standard resolution. The local apps/api/node_modules/.prisma stub throws
// "did not initialize yet" which silently breaks all route registration.
const candidates = [
  path.join(process.cwd(), 'node_modules', '@prisma', 'client'),
  path.join(process.cwd(), '..', 'node_modules', '@prisma', 'client'),
  '@prisma/client',
];

for (const candidate of candidates) {
  try {
    const mod = require(candidate);
    if (mod && mod.PrismaClient) {
      PrismaClient = mod.PrismaClient;
      console.log(`✅ Prisma client loaded from: ${candidate}`);
      break;
    }
  } catch {
    // try next
  }
}

if (!PrismaClient) {
  console.warn('⚠️ Prisma client not available — using mock. DB operations will fail.');
  PrismaClient = class MockPrismaClient {
    constructor() {}
  };
}

const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
