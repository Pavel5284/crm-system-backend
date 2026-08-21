import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';
import { E2eInfra, startE2eInfra } from './helpers/e2e-infra';

describe('Task Manager API (e2e)', () => {
  let app: INestApplication;
  let infra: E2eInfra;
  let httpServer: Server;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    infra = await startE2eInfra();
    app = infra.app;
    httpServer = infra.httpServer;
  });

  afterAll(async () => {
    if (infra) await infra.stop();
  });

  let accessToken: string;

  it('POST /api/auth/register — регистрирует нового пользователя', async () => {
    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({
        email: 'e2e@example.com',
        password: 'password123',
        name: 'E2E User',
      })
      .expect(201);

    const body = res.body as { data: { accessToken: string } };
    expect(body.data.accessToken).toBeDefined();
    accessToken = body.data.accessToken;
  });

  it('GET /api/tasks без токена — 401', async () => {
    await request(httpServer).get('/api/tasks').expect(401);
  });

  it('POST /api/tasks с токеном — создаёт задачу', async () => {
    const res = await request(httpServer)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'E2E задача' })
      .expect(201);

    expect((res.body as { data: { title: string } }).data.title).toBe(
      'E2E задача',
    );
  });

  it('GET /api/tasks с токеном — видит созданную задачу', async () => {
    const res = await request(httpServer)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(
      (res.body as { data: { items: unknown[] } }).data.items.length,
    ).toBeGreaterThanOrEqual(1);
  });
});
