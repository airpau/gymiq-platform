const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const gyms = await prisma.gym.findMany();
  console.log('Gyms:', gyms);
  const auditGym = await prisma.gym.findUnique({ where: { slug: 'audit-leads' } });
  console.log('Audit gym:', auditGym);
}

check().catch(console.error);
