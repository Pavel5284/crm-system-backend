import request from 'supertest';
import { Server } from 'http';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { E2eInfra, startE2eInfra } from './helpers/e2e-infra';

describe('Orders + Payments API (e2e)', () => {
  let infra: E2eInfra;
  let httpServer: Server;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    infra = await startE2eInfra();
    httpServer = infra.httpServer;
  });

  afterAll(async () => {
    if (infra) await infra.stop();
  });

  let userToken: string;
  let adminToken: string;
  let userId: string;
  let customerId: string;
  let dealId: string;

  let orderId: string;
  let paymentId: string;

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

  it('регистрация USER и ADMIN, клиент и сделка', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({
        email: 'billing-user@example.com',
        password: 'password123',
        name: 'U',
      })
      .expect(201);
    await request(httpServer)
      .post('/api/auth/register')
      .send({
        email: 'billing-admin@example.com',
        password: 'password123',
        name: 'A',
      })
      .expect(201);

    const p = prisma();
    try {
      await p.user.update({
        where: { email: 'billing-admin@example.com' },
        data: { role: 'ADMIN' },
      });
      const user = await p.user.findUniqueOrThrow({
        where: { email: 'billing-user@example.com' },
        select: { id: true },
      });
      userId = user.id;
      const customer = await p.customer.create({
        data: { email: 'billing-e2e@example.com', name: 'Клиент' },
      });
      customerId = customer.id;
      const deal = await p.deal.create({
        data: {
          name: 'Сделка под заказ',
          description: 'Достаточно длинное описание сделки',
          price: 100000,
          customerId,
          responsibleUserId: userId,
          responsibleUserIds: [userId],
        },
      });
      dealId = deal.id;
    } finally {
      await p.$disconnect();
    }

    userToken = await login('billing-user@example.com');
    adminToken = await login('billing-admin@example.com');
  });

  it('создание заказа без источника отклоняется', async () => {
    await request(httpServer)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ total: 1000 })
      .expect(400);
  });

  it('создание заказа из сделки подтягивает клиента и сумму', async () => {
    const res = await request(httpServer)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ dealId })
      .expect(201);
    const data = res.body as {
      data: {
        id: string;
        customerId: string;
        total: number;
        paid: number;
        status: string;
      };
    };
    expect(data.data.customerId).toBe(customerId);
    expect(data.data.total).toBe(100000);
    expect(data.data.paid).toBe(0);
    expect(data.data.status).toBe('DRAFT');
    orderId = data.data.id;
  });

  it('ручное создание требует total или items', async () => {
    await request(httpServer)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ customerId })
      .expect(400);

    const res = await request(httpServer)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        customerId,
        items: [{ name: 'Позиция', quantity: 2, price: 5000 }],
      })
      .expect(201);
    const data = res.body as { data: { id: string; total: number } };
    expect(data.data.total).toBe(10000);
    // Временный заказ — удаляем сразу (успешных платежей нет).
    await request(httpServer)
      .delete(`/api/orders/${data.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
  });

  it('переплата отклоняется', async () => {
    await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderId, amount: 200000, status: 'SUCCEEDED' })
      .expect(400);
  });

  it('частичная оплата переводит заказ в PARTIALLY_PAID', async () => {
    const created = await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderId, amount: 40000, status: 'SUCCEEDED' })
      .expect(201);
    paymentId = (created.body as { data: { id: string } }).data.id;

    const order = await request(httpServer)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    const data = order.body as {
      data: { paid: number; remaining: number; status: string };
    };
    expect(data.data.paid).toBe(40000);
    expect(data.data.remaining).toBe(60000);
    expect(data.data.status).toBe('PARTIALLY_PAID');
  });

  it('доплата до полной суммы переводит заказ в PAID', async () => {
    await request(httpServer)
      .post('/api/payments')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderId, amount: 60000, status: 'SUCCEEDED' })
      .expect(201);

    const order = await request(httpServer)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    expect((order.body as { data: { status: string } }).data.status).toBe(
      'PAID',
    );
  });

  it('заказ с движением денег нельзя удалить', async () => {
    await request(httpServer)
      .delete(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('возврат платежа доступен менеджеру, но не обычному юзеру', async () => {
    await request(httpServer)
      .post(`/api/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({})
      .expect(403);

    await request(httpServer)
      .post(`/api/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'Возврат по просьбе клиента' })
      .expect(201);

    const order = await request(httpServer)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    // Осталась вторая оплата 60000 из 100000 — снова частичная.
    const data = order.body as { data: { paid: number; status: string } };
    expect(data.data.paid).toBe(60000);
    expect(data.data.status).toBe('PARTIALLY_PAID');
  });

  it('отмена заказа доступна только админу', async () => {
    await request(httpServer)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'CANCELLED' })
      .expect(400);

    await request(httpServer)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED' })
      .expect(200);
  });
});
