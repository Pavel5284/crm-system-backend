import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PrismaService } from '@app/database';
import { Role, TaskStatus } from '@prisma/client';
import {
    AuthUser,
    CreateTaskMessage,
    FindAllTasksMessage,
    TASK_EVENTS,
    TaskAssignedEventPayload,
    TaskCompletedEventPayload,
} from '@app/shared';
import {CACHE_MANAGER} from "@nestjs/cache-manager";
import type {Cache} from "cache-manager";
import {InjectQueue} from "@nestjs/bullmq";
import {Queue} from "bullmq";

@Injectable()
export class TasksService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject('NOTIFICATIONS_SERVICE') private readonly notificationsClient: ClientProxy,
        @Inject(CACHE_MANAGER) private readonly cache: Cache,
        @InjectQueue('task-reminders') private readonly remindersQueue: Queue,
    ) {}

    private async scheduleDueDateReminder(task: { id: string; dueDate: Date | null }) {
        if (!task.dueDate) return;
        const delay = task.dueDate.getTime() - Date.now() - 24 * 60 * 60 * 1000;
        if (delay <= 0) return;
        await this.remindersQueue.add('due-soon', { taskId: task.id }, { delay, jobId: `due-soon:${task.id}` });
    }

    async create(message: CreateTaskMessage) {
        const task = await this.prisma.task.create({
            data: {
                title: message.title,
                description: message.description,
                priority: message.priority,
                dueDate: message.dueDate ? new Date(message.dueDate) : undefined,
                assigneeId: message.assigneeId,
                authorId: message.authorId,
            },
        });

        if (task.assigneeId) {
            const payload: TaskAssignedEventPayload = { task, actorId: message.authorId };
            this.notificationsClient.emit(TASK_EVENTS.ASSIGNED, payload);
        }

        return task;
    }

    async findAll(query: FindAllTasksMessage) {
        const cacheKey = `tasks:list:${JSON.stringify(query)}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) return cached;

        const { page, limit, ...filters } = query;
        const where = { ...filters };
        const [items, total] = await this.prisma.$transaction([
            this.prisma.task.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
            this.prisma.task.count({ where }),
        ]);

        const result = { items, total, page, limit, pageCount: Math.ceil(total / limit) };
        await this.cache.set(cacheKey, result, 30_000);
        return result;
    }

    async findOne(id: string) {
        const task = await this.prisma.task.findUnique({ where: { id } });
        if (!task) throw new RpcException({ statusCode: 404, message: `Задача ${id} не найдена` });
        return task;
    }

    async update(id: string, data: Record<string, any>, requester: AuthUser) {
        const previous = await this.findOne(id);
        this.assertCanModify(previous, requester);

        const updated = await this.prisma.task.update({
            where: { id },
            data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined },
        });

        if (data.assigneeId && data.assigneeId !== previous.assigneeId) {
            const payload: TaskAssignedEventPayload = { task: updated, actorId: requester.id };
            this.notificationsClient.emit(TASK_EVENTS.ASSIGNED, payload);
        }
        if (data.status === TaskStatus.DONE && previous.status !== TaskStatus.DONE) {
            const payload: TaskCompletedEventPayload = { task: updated, actorId: requester.id };
            this.notificationsClient.emit(TASK_EVENTS.COMPLETED, payload);
        }

        return updated;
    }

    async remove(id: string, requester: AuthUser) {
        const task = await this.findOne(id);
        this.assertCanModify(task, requester);
        await this.prisma.task.delete({ where: { id } });
    }

    private assertCanModify(task: { authorId: string; assigneeId: string | null }, user: AuthUser) {
        const isOwner = task.authorId === user.id || task.assigneeId === user.id;
        if (user.role !== Role.ADMIN && !isOwner) {
            throw new RpcException({ statusCode: 403, message: 'Недостаточно прав для изменения этой задачи' });
        }
    }
}