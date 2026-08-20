import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { DatabaseModule } from "@app/database";
import { QUEUES, HealthModule } from "@app/shared";
import { validateEnv } from "./config/env.validation";
import { NotificationsController } from "./notifications/notifications.controller";
import { NotificationsService } from "./notifications/notifications.service";
import { LoggerModule } from "nestjs-pino";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    HealthModule,
    ClientsModule.registerAsync([
      {
        name: "GATEWAY_EVENTS",
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>("RABBITMQ_URL")],
            queue: QUEUES.GATEWAY_EVENTS,
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
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class AppModule {}
