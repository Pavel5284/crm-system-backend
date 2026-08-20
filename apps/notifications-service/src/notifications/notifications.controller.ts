import { Controller } from "@nestjs/common";
import { EventPattern, MessagePattern, Payload } from "@nestjs/microservices";
import * as shared from "@app/shared";
import { NotificationsService } from "./notifications.service";

@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @EventPattern(shared.TASK_EVENTS.ASSIGNED)
  handleTaskAssigned(@Payload() payload: shared.TaskAssignedEventPayload) {
    return this.notificationsService.handleTaskAssigned(payload);
  }

  @EventPattern(shared.TASK_EVENTS.COMPLETED)
  handleTaskCompleted(@Payload() payload: shared.TaskCompletedEventPayload) {
    return this.notificationsService.handleTaskCompleted(payload);
  }
  @EventPattern(shared.TASK_EVENTS.DUE_SOON)
  handleTaskDueSoon(@Payload() payload: shared.TaskDueSoonEventPayload) {
    return this.notificationsService.handleTaskDueSoon(payload);
  }

  @MessagePattern(shared.NOTIFICATION_PATTERNS.FIND_MINE)
  findMine(@Payload() message: shared.FindMyNotificationsMessage) {
    return this.notificationsService.findMine(message.userId);
  }

  @MessagePattern(shared.NOTIFICATION_PATTERNS.MARK_READ)
  markRead(@Payload() message: shared.MarkNotificationReadMessage) {
    return this.notificationsService.markRead(message.id, message.userId);
  }
}
