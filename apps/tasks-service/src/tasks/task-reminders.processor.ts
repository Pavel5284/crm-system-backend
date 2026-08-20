import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '@app/database';
import { TASK_EVENTS } from '@app/shared';

@Processor('task-reminders')
export class TaskRemindersProcessor extends WorkerHost {
    constructor(
        private readonly prisma: PrismaService,
        @Inject('NOTIFICATIONS_SERVICE') private readonly notificationsClient: ClientProxy,
    ) {
        super();
    }

    async process(job: Job<{ taskId: string }>) {
        const task = await this.prisma.task.findUnique({ where: { id: job.data.taskId } });
        if (!task || task.status === 'DONE' || !task.assigneeId) return;

        this.notificationsClient.emit(TASK_EVENTS.DUE_SOON, { task, actorId: 'system' });
    }
}