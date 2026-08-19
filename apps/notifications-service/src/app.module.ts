import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DatabaseModule } from '@app/database';
import { QUEUES } from '@app/shared';
import { validateEnv } from './config/env.validation';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        DatabaseModule,
        ClientsModule.registerAsync([
            {
                name: 'GATEWAY_EVENTS',
                useFactory: (config: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: [config.getOrThrow<string>('RABBITMQ_URL')],
                        queue: QUEUES.GATEWAY_EVENTS,
                        queueOptions: { durable: true },
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    controllers: [NotificationsController],
    providers: [NotificationsService],
})
export class AppModule {}