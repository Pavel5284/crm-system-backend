import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@app/shared';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DealRemindersProcessor } from './deal-reminders.processor';

// Без VALKEY_URL (и в тестах) BullMQ отключается, как в tasks-service:
// напоминания о дедлайнах работать не будут, остальное — без изменений.
const isBullEnabled =
  process.env.NODE_ENV !== 'test' && !!process.env.VALKEY_URL;

@Module({
  imports: [
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
    ...(isBullEnabled
      ? [BullModule.registerQueue({ name: 'deal-reminders' })]
      : []),
  ],
  controllers: [DealsController],
  providers: [DealsService, ...(isBullEnabled ? [DealRemindersProcessor] : [])],
})
export class DealsModule {}
