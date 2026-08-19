import { PrismaClient, Role, TaskPriority } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
    const passwordHash = await argon2.hash('password123');

    const alice = await prisma.user.upsert({
        where: { email: 'alice@example.com' },
        update: {},
        create: { email: 'alice@example.com', name: 'Alice', passwordHash, role: Role.ADMIN },
    });

    const bob = await prisma.user.upsert({
        where: { email: 'bob@example.com' },
        update: {},
        create: { email: 'bob@example.com', name: 'Bob', passwordHash, role: Role.USER },
    });

    await prisma.task.createMany({
        data: [
            { title: 'Настроить CI', authorId: alice.id, assigneeId: bob.id, priority: TaskPriority.HIGH },
            { title: 'Написать документацию', authorId: alice.id, priority: TaskPriority.LOW },
        ],
    });

    console.log('Seed завершён. Тестовый пароль для обоих пользователей: password123');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());