import { z } from 'zod';
import { baseEnvSchema } from '@app/shared';

const envSchema = baseEnvSchema.extend({
    PORT: z.coerce.number().default(3000),
    CORS_ORIGIN: z.string().default('*'),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
    const result = envSchema.safeParse(config);
    if (!result.success) {
        throw new Error(`❌ Некорректная конфигурация окружения api-gateway:\n${result.error.toString()}`);
    }
    return result.data;
}