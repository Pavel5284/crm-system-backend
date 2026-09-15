import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { execSync } from 'child_process';
import { Server } from 'http';
import * as amqp from 'amqplib';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Локальные e2e-настройки (не коммитятся, см. .env.e2e.example).
// Уже выставленные переменные окружения — важнее.
dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e') });
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { QUEUES } from '@app/shared';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';

export interface E2eInfraOptions {
  notifications?: boolean;
}

export interface E2eInfra {
  app: INestApplication;
  httpServer: Server;
  stop: () => Promise<void>;
}

export async function startE2eInfra(
  options: E2eInfraOptions = {},
): Promise<E2eInfra> {
  // Внешний режим (без Docker): E2E_DATABASE_URL указывает на выделенную
  // тестовую БД (НЕ прод!), E2E_RABBITMQ_URL — на отдельный vhost.
  // Иначе поднимаем одноразовые контейнеры (CI-путь).
  const externalDb = process.env.E2E_DATABASE_URL;
  const externalMq = process.env.E2E_RABBITMQ_URL;

  let stopContainers: (() => Promise<void>) | null = null;
  if (externalDb && externalMq) {
    process.env.DATABASE_URL = externalDb;
    process.env.RABBITMQ_URL = externalMq;
    await wipeTestDatabase();
  } else {
    const postgres: StartedPostgreSqlContainer = await new PostgreSqlContainer(
      'postgres:18-alpine',
    )
      .withDatabase('taskmanager_test')
      .withUsername('taskmanager')
      .withPassword('taskmanager')
      .start();

    const rabbitmq: StartedTestContainer = await new GenericContainer(
      'rabbitmq:4-management',
    )
      .withEnvironment({
        RABBITMQ_DEFAULT_USER: 'taskmanager',
        RABBITMQ_DEFAULT_PASS: 'taskmanager',
      })
      .withExposedPorts(5672)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();

    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.RABBITMQ_URL = `amqp://taskmanager:taskmanager@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(5672)}`;
    stopContainers = async () => {
      await Promise.allSettled([rabbitmq.stop(), postgres.stop()]);
    };
  }
  delete process.env.VALKEY_URL;
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-characters-minimum';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-min';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';

  execSync('pnpm prisma migrate deploy', {
    env: process.env,
    stdio: 'inherit',
  });

  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  for (const queue of Object.values(QUEUES)) {
    await channel.assertQueue(queue, { durable: true });
  }
  await channel.close();
  await connection.close();

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { AppModule: GatewayAppModule } = require('../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [GatewayAppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
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
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL],
      queue: QUEUES.GATEWAY_EVENTS,
      queueOptions: { durable: true },
    },
  });
  await app.init();
  await app.startAllMicroservices();

  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, prettier/prettier
  const { AppModule: TasksServiceAppModule } = require('../../../tasks-service/src/app.module');
  const tasksApp = await NestFactory.create(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    TasksServiceAppModule,
    {
      logger: false,
      abortOnError: false,
    },
  );
  tasksApp.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL],
      queue: QUEUES.TASKS,
      queueOptions: { durable: true },
    },
  });
  await tasksApp.startAllMicroservices();

  let notificationsApp: INestApplication | null = null;
  if (options.notifications) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, prettier/prettier
    const { AppModule: NotificationsServiceAppModule } = require('../../../notifications-service/src/app.module');
    notificationsApp = await NestFactory.create(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      NotificationsServiceAppModule,
      {
        logger: false,
        abortOnError: false,
      },
    );
    notificationsApp.connectMicroservice<MicroserviceOptions>({
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL],
        queue: QUEUES.NOTIFICATIONS,
        queueOptions: { durable: true },
      },
    });
    await notificationsApp.startAllMicroservices();
  }

  return {
    app,
    httpServer: app.getHttpServer() as Server,
    stop: async () => {
      if (notificationsApp) await notificationsApp.close();
      await tasksApp.close();
      await app.close();
      if (stopContainers) await stopContainers();
    },
  };
}

/** Чистит внешнюю тестовую БД перед прогоном (фиксированные email в спеках). */
async function wipeTestDatabase(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg') as typeof import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows
        .map((r: { tablename: string }) => `"public"."${r.tablename}"`)
        .join(', ');
      await pool.query(`TRUNCATE ${tables} CASCADE`);
    }
  } finally {
    await pool.end();
  }
}
