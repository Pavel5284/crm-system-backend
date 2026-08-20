import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import * as shared from '@app/shared';
import { NotificationsGateway } from './notifications.gateway';

@Controller()
export class GatewayEventsController {
  constructor(private readonly notificationsGateway: NotificationsGateway) {}

  @EventPattern(shared.NOTIFICATION_EVENTS.CREATED)
  handleNotificationCreated(
    @Payload() payload: shared.NotificationCreatedEventPayload,
  ) {
    this.notificationsGateway.sendToUser(payload.userId, payload);
  }
}
