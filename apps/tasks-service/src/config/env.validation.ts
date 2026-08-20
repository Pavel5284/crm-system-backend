import { z } from 'zod';
import { baseEnvSchema } from '@app/shared';

const envSchema = baseEnvSchema.extend({
    VALKEY_URL: z.string().url(),
    HEALTH_PORT: z.coerce.number().default(3001),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
    const result = envSchema.safeParse(config);
    if (!result.success) {
        throw new Error(`❌ Некорректная конфигурация окружения tasks-service:\n${result.error.toString()}`);
    }
    return result.data;
}