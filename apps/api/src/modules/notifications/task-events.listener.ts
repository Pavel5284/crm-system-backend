import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { TaskAssignedEvent, TaskCompletedEvent } from '../tasks/events/task-events';
import { NotificationsService } from './notifications.service';

@Injectable()
export class TaskEventsListener {
    constructor(private readonly notifications: NotificationsService) {}

    @OnEvent('task.assigned')
    async handleTaskAssigned(event: TaskAssignedEvent) {
        const { task, actorId } = event;
        if (!task.assigneeId || task.assigneeId === actorId) return; // не уведомляем сами себя

        await this.notifications.notifyUser(task.assigneeId, NotificationType.TASK_ASSIGNED, {
            taskId: task.id,
            title: task.title,
        });
    }

    @OnEvent('task.completed')
    async handleTaskCompleted(event: TaskCompletedEvent) {
        const { task, actorId } = event;
        if (task.authorId === actorId) return;

        await this.notifications.notifyUser(task.authorId, NotificationType.TASK_COMPLETED, {
            taskId: task.id,
            title: task.title,
        });
    }
}