import { baseEnvSchema } from "@app/shared";

export type EnvConfig = ReturnType<typeof baseEnvSchema.parse>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = baseEnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `[notifications-service] плохая конфигурация окружения:\n${result.error.toString()}`,
    );
  }
  return result.data;
}
