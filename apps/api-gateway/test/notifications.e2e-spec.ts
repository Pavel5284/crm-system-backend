import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { execSync } from 'child_process';
import { Server } from 'http';
import { io, Socket } from 'socket.io-client';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Notifications Gateway (e2e)', () => {
  let app: INestApplication;
  let container: StartedPostgreSqlContainer;
  let httpServer: Server;
  let baseUrl: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-characters-minimum';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-min';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';

    execSync('pnpm prisma migrate deploy', {
      env: process.env,
      stdio: 'inherit',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(
      new TransformInterceptor(),
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);

    httpServer = app.getHttpServer() as Server;
    const address = httpServer.address();
    const port =
      typeof address === 'string' || address === null ? 0 : address.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
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
