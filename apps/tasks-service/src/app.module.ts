import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DatabaseModule } from '@app/database';
import { QUEUES } from '@app/shared';
import { validateEnv } from './config/env.validation';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
        DatabaseModule,
        ClientsModule.registerAsync([
            {
                name: 'NOTIFICATIONS_SERVICE',
                useFactory: (config: ConfigService) => ({
                    transport: Transport.RMQ,
                    options: {
                        urls: [config.getOrThrow<string>('RABBITMQ_URL')],
                        queue: QUEUES.NOTIFICATIONS,
                        queueOptions: { durable: true },
                    },
                }),
                inject: [ConfigService],
            },
        ]),
    ],
    controllers: [TasksController],
    providers: [TasksService],
})
export class AppModule {}