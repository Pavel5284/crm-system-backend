import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { QUEUES } from '@app/shared';
import { NotificationsController } from './notifications.controller';
import { GatewayEventsController } from './gateway-events.controller';
import { NotificationsGateway } from './notifications.gateway';

@Module({
  imports: [
    JwtModule.register({}),
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
  controllers: [NotificationsController, GatewayEventsController],
  providers: [NotificationsGateway],
})
export class NotificationsModule {}
