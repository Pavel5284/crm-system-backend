# crm-system-backend

Небольшая CRM на NestJS: api-gateway + два микросервиса (tasks, notifications) через RabbitMQ.
БД — Postgres + Prisma, очереди/троттлинг — Valkey (Redis), доки — `/api/docs`.

## Запуск локально

1. Поднять инфру: `docker compose up -d --build`
2. Миграции: `pnpm prisma migrate dev`
3. Сид тестовых юзеров: `pnpm prisma db seed` (пароль обоих — `password123`)
4. Гейтвей: `pnpm start:gateway`, таски: `pnpm start:tasks`, уведомления: `pnpm start:notifications`

Без `VALKEY_URL` bull-очереди и redis-throttle молча отключаются — сервис всё равно стартует,
просто не будет напоминаний о дедлайнах. Это нормально для локалки.

## Тесты

Юнит: `pnpm test`, e2e гейтвея: `pnpm test:e2e`. Для e2e нужен поднятый Postgres,
таймауты там с запасом (free-план Render долго будит сервисы).
