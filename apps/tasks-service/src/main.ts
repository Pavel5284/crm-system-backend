import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { QUEUES } from '@app/shared';
import { AppModule } from './app.module';
import {Logger} from "nestjs-pino";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableShutdownHooks();
    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.RMQ,
        options: {
            urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
            queue: QUEUES.TASKS,
            queueOptions: { durable: true },
        },
    });
    app.useLogger(app.get(Logger));

    await app.startAllMicroservices();
    await app.listen(process.env.HEALTH_PORT ?? 3001);
    console.log(`📨 tasks-service: очередь "${QUEUES.TASKS}", health на :${process.env.HEALTH_PORT ?? 3001}`);
}

bootstrap();