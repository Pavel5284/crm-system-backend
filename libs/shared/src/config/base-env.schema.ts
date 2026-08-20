import { z } from "zod";

export const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  RABBITMQ_URL: z.string().url(),
});
