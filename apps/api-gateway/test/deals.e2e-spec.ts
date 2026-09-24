import request from 'supertest';
import { Server } from 'http';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { E2eInfra, startE2eInfra } from './helpers/e2e-infra';

describe('Deals API (e2e)', () => {
  let infra: E2eInfra;
  let httpServer: Server;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    infra = await startE2eInfra();
    httpServer = infra.httpServer;

    // e2e-инфра во внешнем режиме делает TRUNCATE всех таблиц, включая
    // stage_transition_rules, заселённую миграцией. Возвращаем минимум
    // правил, нужный этому спеку (идемпотентно).
    const p = prisma();
    try {
      await p.stageTransitionRule.upsert({
        where: {
          fromStage_toStage: { fromStage: 'todo', toStage: 'to-be-agreed' },
        },
        update: {
          allowedRoles: ['MANAGER', 'ADMIN', 'USER'],
          requiredFields: [],
        },
        create: {
          fromStage: 'todo',
          toStage: 'to-be-agreed',
          allowedRoles: ['MANAGER', 'ADMIN', 'USER'],
          requiredFields: [],
        },
      });
    } finally {
      await p.$disconnect();
    }
  });

  afterAll(async () => {
    if (infra) await infra.stop();
  });

  const base = {
    name: 'Сделка e2e',
    description: 'Достаточно длинное описание сделки',
    price: 1000,
  };

  let userToken: string;
  let adminToken: string;
  let userId: string;
  let customerId: string;

  function prisma() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    return new PrismaClient({ adapter });
  }

  async function login(email: string) {
    const res = await request(httpServer)
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  }

  it('регистрация USER и ADMIN', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({
        email: 'deals-user@example.com',
        password: 'password123',
        name: 'U',
      })
      .expect(201);
    await request(httpServer)
      .post('/api/auth/register')
      .send({
        email: 'deals-admin@example.com',
        password: 'password123',
        name: 'A',
      })
      .expect(201);

    const p = prisma();
    try {
      await p.user.update({
        where: { email: 'deals-admin@example.com' },
        data: { role: 'ADMIN' },
      });
      const user = await p.user.findUniqueOrThrow({
        where: { email: 'deals-user@example.com' },
        select: { id: true },
      });
      userId = user.id;
      const customer = await p.customer.create({
        data: { email: 'deals-e2e@example.com', name: 'Клиент' },
      });
      customerId = customer.id;
    } finally {
      await p.$disconnect();
    }

    userToken = await login('deals-user@example.com');
    adminToken = await login('deals-admin@example.com');
  });

  it('не-админ не может создать сделку сразу на «В производстве»', async () => {
    // Произвольный stage в обычном создании отвергается валидацией.
    await request(httpServer)
      .post('/api/deals')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        ...base,
        customerId,
        status: 'in-progress',
        responsibleUserId: userId,
      })
      .expect(400);

    // Отдельный эндпоинт импорта — только для admin.
    await request(httpServer)
      .post('/api/deals/import')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        ...base,
        customerId,
        status: 'in-progress',
        isImported: true,
        importedBy: userId,
        responsibleUserId: userId,
      })
      .expect(403);
  });

  it('admin вносит сделку сразу на произвольный этап', async () => {
    const res = await request(httpServer)
      .post('/api/deals/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...base,
        customerId,
        status: 'in-progress',
        isImported: true,
        importedBy: userId,
        responsibleUserId: userId,
      })
      .expect(201);
    const data = res.body as {
      data: { status: string; isImported: boolean };
    };
    expect(data.data.status).toBe('in-progress');
    expect(data.data.isImported).toBe(true);
  });

  it('legacy-строка (дефолты миграции) читается и обновляется', async () => {
    // Строка с минимумом полей: остальные —
    // дефолты схемы (description '', isImported false, ...).
    const p = prisma();
    let legacyId: string;
    try {
      const customer = await p.customer.create({
        data: { email: 'legacy@example.com', name: 'Legacy' },
      });
      const legacy = await p.deal.create({
        data: { name: 'Старая сделка', price: 500, customerId: customer.id },
      });
      legacyId = legacy.id;
    } finally {
      await p.$disconnect();
    }

    const list = await request(httpServer)
      .get('/api/deals')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(
      (list.body as { data: Array<{ id: string }> }).data.map((d) => d.id),
    ).toContain(legacyId);

    await request(httpServer)
      .get(`/api/deals/${legacyId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    // Обновление description доводит строку до новых требований.
    await request(httpServer)
      .patch(`/api/deals/${legacyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Доведено до требований' })
      .expect(200);

    // Переход без комментария разрешён: комментарий перехода необязателен
    // (главный комментарий сделки — отдельное поле mainComment).
    const moved = await request(httpServer)
      .patch(`/api/deals/${legacyId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ targetStage: 'to-be-agreed' })
      .expect(200);
    expect((moved.body as { data: { status: string } }).data.status).toBe(
      'to-be-agreed',
    );
  });
});
