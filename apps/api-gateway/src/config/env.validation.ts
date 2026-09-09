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
  SKIP_EMAIL_VERIFICATION: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `❌ Некорректная конфигурация окружения api-gateway:\n${result.error.toString()}`,
    );
  }
  return result.data;
}
