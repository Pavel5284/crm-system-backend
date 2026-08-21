import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'http';
import { io, Socket } from 'socket.io-client';
import { E2eInfra, startE2eInfra } from './helpers/e2e-infra';

describe('Notifications Gateway (e2e)', () => {
  let app: INestApplication;
  let infra: E2eInfra;
  let httpServer: Server;
  let baseUrl: string;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    infra = await startE2eInfra({ notifications: true });
    app = infra.app;
    httpServer = infra.httpServer;
    await app.listen(0);

    const address = httpServer.address();
    const port =
      typeof address === 'string' || address === null ? 0 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (infra) await infra.stop();
  });

  async function registerAndLogin(email: string) {
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: email });
    const res = await request(httpServer)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    return (res.body as { data: { accessToken: string } }).data.accessToken;
  }

  it('доставляет notification исполнителю при назначении задачи', async () => {
    const authorToken = await registerAndLogin('author@example.com');
    const assigneeToken = await registerAndLogin('assignee@example.com');

    const profile = await request(httpServer)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${assigneeToken}`);
    const assigneeId = (profile.body as { data: { id: string } }).data.id;

    const socket: Socket = io(`${baseUrl}/notifications`, {
      auth: { token: assigneeToken },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const notificationPromise = new Promise((resolve) =>
      socket.on('notification', resolve),
    );

    await request(httpServer)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ title: 'Задача для WS-теста', assigneeId })
      .expect(201);

    const notification = await notificationPromise;
    expect(notification).toMatchObject({ type: 'TASK_ASSIGNED' });

    socket.close();
  });
});
