import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { QUEUES } from '@app/shared';
import { TasksController } from './tasks.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'TASKS_SERVICE',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: QUEUES.TASKS,
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [TasksController],
})
export class TasksModule {}
