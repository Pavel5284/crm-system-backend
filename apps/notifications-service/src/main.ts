import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { QUEUES } from "@app/shared";
import { AppModule } from "./app.module";
import { Logger } from "nestjs-pino";

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL ?? "amqp://localhost:5672"],
        queue: QUEUES.NOTIFICATIONS,
        queueOptions: { durable: true },
      },
    },
  );
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));
  await app.listen();
  console.log(
    `📨 notifications-service слушает очередь "${QUEUES.NOTIFICATIONS}"`,
  );
}

void bootstrap();
