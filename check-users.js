const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const users = await p.user.findMany({ where: { email: { contains: 'pavel', mode: 'insensitive' } }, select: { id: true, name: true, email: true } });
  console.log('users', JSON.stringify(users, null, 2));
  const msgs = await p.directMessage.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { sender: { select: { id: true, name: true, email: true } }, receiver: { select: { id: true, name: true, email: true } } } });
  console.log('messages', JSON.stringify(msgs, null, 2));
  const convs = await p.directMessage.findMany({ where: { OR: [{ sender: { email: 'pavel5284@mail.ru' } }, { receiver: { email: 'pavel5284@mail.ru' } }] }, take: 5 });
  console.log('pavel msgs', JSON.stringify(convs, null, 2));
  await p.$disconnect();
}
main().catch(e => { console.error(e); });
