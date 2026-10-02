import { z } from 'zod';
import { baseEnvSchema } from '@app/shared';

const envSchema = baseEnvSchema.extend({
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('*'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  VALKEY_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  SKIP_EMAIL_VERIFICATION: z.string().optional(),
  // Cloudflare Turnstile: без секрета проверка CAPTCHA пропускается (dev/test).
  TURNSTILE_SECRET_KEY: z.string().optional(),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Демо-стенд: demo1/demo2/demo3 + POST /demo/reset.
  // Демо-режим: DEMO_MODE=true закрывает регистрацию (POST /auth/register,
  // POST /auth/resend-verification -> 403) и разрешает вход/refresh только
  // demo1/demo2/demo3. Работают только демо-аккаунты с демо-данными.
  DEMO_MODE: z.string().optional(),
  // DEMO_ENABLED=false полностью блокирует сброс.
  DEMO_ENABLED: z.string().optional(),
  // Пароль демо-аккаунтов (дефолт Demo12345).
  DEMO_PASSWORD: z.string().optional(),
  // Ночной автосброс демо-данных (1/сутки в 00:00). DEMO_AUTO_RESET=false
  // отключает только расписание, ручной POST /demo/reset остаётся.
  DEMO_AUTO_RESET: z.string().optional(),
  // Часовой пояс автосброса (IANA). Дефолт — Москва.
  DEMO_RESET_TZ: z.string().optional(),
  // Публичный URL notifications-service для автопробуждения (free-план Render):
  // при таймауте RPC gateway пинает его /health, фронт повторяет запрос.
  // Необязательно: без него таймаут просто вернёт 504 без пинга.
  NOTIFICATIONS_SERVICE_HEALTH_URL: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `[api-gateway] плохая конфигурация окружения:\n${result.error.toString()}`,
    );
  }
  return result.data;
}
