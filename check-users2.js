require('dotenv').config();
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter });
async function main() {
  const users = await p.user.findMany({ where: { email: { contains: 'pavel', mode: 'insensitive' } }, select: { id: true, name: true, email: true } });
  console.log('users', JSON.stringify(users, null, 2));
  const msgs = await p.directMessage.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, name: true, email: true } }, receiver: { select: { id: true, name: true, email: true } } } });
  console.log('messages', JSON.stringify(msgs, null, 2));
  await p.$disconnect();
}
main().catch(e => { console.error(e); });
