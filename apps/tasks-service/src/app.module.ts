import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { DatabaseModule } from "@app/database";
import { QUEUES, HealthModule } from "@app/shared";
import { validateEnv } from "./config/env.validation";
import { TasksController } from "./tasks/tasks.controller";
import { TasksService } from "./tasks/tasks.service";
import { LoggerModule } from "nestjs-pino";
import { CacheModule } from "@nestjs/cache-manager";
import { redisStore } from "cache-manager-redis-yet";
import { BullModule } from "@nestjs/bullmq";
import { TaskRemindersProcessor } from "./tasks/task-reminders.processor";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    HealthModule,
    ClientsModule.registerAsync([
      {
        name: "NOTIFICATIONS_SERVICE",
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>("RABBITMQ_URL")],
            queue: QUEUES.NOTIFICATIONS,
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
    ]),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        transport:
          process.env.NODE_ENV === "production"
            ? undefined
            : { target: "pino-pretty" },
        redact: ["req.headers.authorization"], // не логируем сами токены
      },
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (config: ConfigService) => ({
        store: await redisStore({
          url: config.getOrThrow<string>("VALKEY_URL"),
        }),
        ttl: 30_000, // 30 секунд
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>("VALKEY_URL"),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: "task-reminders" }),
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskRemindersProcessor],
})
export class AppModule {}
