import {ClassSerializerInterceptor, INestApplication, ValidationPipe} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {execSync} from 'child_process';
import {PostgreSqlContainer, StartedPostgreSqlContainer} from '@testcontainers/postgresql';
import {AppModule} from '../src/app.module';
import {AllExceptionsFilter} from '../src/common/filters/all-exceptions.filter';
import {TransformInterceptor} from '../src/common/interceptors/transform.interceptor';

describe('Task Manager API (e2e)', () => {
    let app: INestApplication;
    let container: StartedPostgreSqlContainer;

    jest.setTimeout(60_000);

    beforeAll(async () => {
        container = await new PostgreSqlContainer('postgres:18-alpine')
            .withDatabase('taskmanager_test')
            .withUsername('taskmanager')
            .withPassword('taskmanager')
            .start();

        process.env.DATABASE_URL = container.getConnectionUri();
        process.env.JWT_ACCESS_SECRET = 'test-access-secret-32-characters-minimum';
        process.env.JWT_ACCESS_EXPIRES_IN = '15m';
        process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-characters-min';
        process.env.JWT_REFRESH_EXPIRES_IN = '7d';

        // Прогоняем миграции внутри контейнера теста
        execSync('pnpm prisma migrate deploy', {env: process.env, stdio: 'inherit'});

        const moduleRef = await Test.createTestingModule({imports: [AppModule]}).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true}),
        );
        app.useGlobalFilters(new AllExceptionsFilter());
        app.useGlobalInterceptors(
            new TransformInterceptor(),
            new ClassSerializerInterceptor(app.get(Reflector)),
        );
        app.setGlobalPrefix('api');
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await container.stop();
    });

    let accessToken: string;

    it('POST /api/auth/register — регистрирует нового пользователя', async () => {
        const res = await request(app.getHttpServer())
            .post('/api/auth/register')
            .send({email: 'e2e@example.com', password: 'password123', name: 'E2E User'})
            .expect(201);

        expect(res.body.data.accessToken).toBeDefined();
        accessToken = res.body.data.accessToken;
    });

    it('GET /api/tasks без токена — 401', async () => {
        await request(app.getHttpServer()).get('/api/tasks').expect(401);
    });

    it('POST /api/tasks с токеном — создаёт задачу', async () => {
        const res = await request(app.getHttpServer())
            .post('/api/tasks')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({title: 'E2E задача'})
            .expect(201);

        expect(res.body.data.title).toBe('E2E задача');
    });

    it('GET /api/tasks с токеном — видит созданную задачу', async () => {
        const res = await request(app.getHttpServer())
            .get('/api/tasks')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });
});