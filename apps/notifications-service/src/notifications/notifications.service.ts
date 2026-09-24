import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";
import { PrismaService } from "@app/database";
import { NotificationType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  NOTIFICATION_EVENTS,
  TaskAssignedEventPayload,
  TaskCompletedEventPayload,
  DealStageChangedEventPayload,
  DealDeadlineSoonEventPayload,
} from "@app/shared";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject("GATEWAY_EVENTS") private readonly gatewayClient: ClientProxy,
  ) {}

  async handleTaskAssigned({ task, actorId }: TaskAssignedEventPayload) {
    if (!task.assigneeId || task.assigneeId === actorId) return;
    await this.notify(task.assigneeId, NotificationType.TASK_ASSIGNED, {
      taskId: task.id,
      title: task.title,
    });
  }

  async handleTaskCompleted({ task, actorId }: TaskCompletedEventPayload) {
    if (task.authorId === actorId) return;
    await this.notify(task.authorId, NotificationType.TASK_COMPLETED, {
      taskId: task.id,
      title: task.title,
    });
  }

  findMine(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException("Уведомление не найдено");
    }
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }
  async handleTaskDueSoon({
    task,
  }: {
    task: { id: string; title: string; assigneeId: string | null };
  }) {
    if (!task.assigneeId) return;
    await this.notify(task.assigneeId, NotificationType.TASK_DUE_SOON, {
      taskId: task.id,
      title: task.title,
    });
  }

  async handleDealStageChanged({
    deal,
    fromStage,
    toStage,
    comment,
    actorId,
  }: DealStageChangedEventPayload) {
    if (!deal.responsibleUserId || deal.responsibleUserId === actorId) return;
    await this.notify(
      deal.responsibleUserId,
      NotificationType.DEAL_STAGE_CHANGED,
      {
        dealId: deal.id,
        name: deal.name,
        customerName: deal.customerName,
        fromStage,
        toStage,
        comment,
      },
    );
  }

  async handleDealDeadlineSoon({ deal }: DealDeadlineSoonEventPayload) {
    if (!deal.responsibleUserId) return;
    await this.notify(
      deal.responsibleUserId,
      NotificationType.DEAL_DEADLINE_SOON,
      {
        dealId: deal.id,
        name: deal.name,
        customerName: deal.customerName,
        status: deal.status,
        deadline: deal.deadline,
      },
    );
  }

  private async notify(
    userId: string,
    type: NotificationType,
    payload: Prisma.InputJsonValue,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, type, payload },
    });
    this.gatewayClient.emit(NOTIFICATION_EVENTS.CREATED, {
      id: notification.id,
      userId,
      type,
      payload,
      createdAt: notification.createdAt.toISOString(),
    });
  }
}
