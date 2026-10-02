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

## Демо-стенд

Три демо-аккаунта с общей тестовой базой: `demo1@example.com` (ADMIN),
`demo2@example.com` (MANAGER), `demo3@example.com` (LOGIST). Пароль всех трёх —
`DEMO_PASSWORD` (дефолт `Demo12345`, см. `.env.example`).

- Сид/ресид демо-данных: `pnpm seed:demo` (идемпотентно: чистит только демо-скоуп —
  клиентов `@demo.local`/`fromSource='demo'` и контент демо-юзеров, боевые данные и
  самих демо-юзеров не трогает). Создаёт 6 клиентов, 8 сделок на всех стадиях,
  8 задач, 4 заказа, платежи, комментарии, историю стадий, переписку и уведомления.
- `GET /demo/status` — публичный статус стенда (включая `nextResetAt`),
  `POST /demo/reset` — ресид (только ADMIN, троттлинг 3/час,
  блокируется при `DEMO_ENABLED=false`).
- Ночной автосброс: раз в сутки в 00:00 по Москве (`DEMO_RESET_TZ`,
  дефолт `Europe/Moscow`). Отключается через `DEMO_AUTO_RESET=false`
  (ручной ресид при этом остаётся). Ошибка ночного сброса только логируется —
  процесс не падает, следующее срабатывание планируется заново.
- Демо-пользователей удалять нельзя: `assertCanDeleteUserByEmail` в `DemoService`
  (переиспользовать в любом будущем DELETE /users/:id).
- Вход — через обычную форму логина (`/login`): `demo1@example.com` / пароль из `DEMO_PASSWORD`.
- Демо-режим (`DEMO_MODE=true`): регистрация закрыта — `POST /auth/register`
  и `POST /auth/resend-verification` отвечают 403, вход и refresh токенов
  работают только для demo1/demo2/demo3. Страница `/register` на фронте
  редиректит на `/login` (флаг `NUXT_PUBLIC_DEMO_MODE=true`).

## Тесты

Юнит: `pnpm test`, e2e гейтвея: `pnpm test:e2e`. Для e2e нужен поднятый Postgres,
таймауты там с запасом (free-план Render долго будит сервисы).
