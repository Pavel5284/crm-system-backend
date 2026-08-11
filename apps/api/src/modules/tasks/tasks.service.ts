import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { AuthUser } from '../auth/types/auth-user.interface';
import { TaskAssignedEvent, TaskCompletedEvent } from './events/task-events';

@Injectable()
export class TasksService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly eventEmitter: EventEmitter2,
    ) {}

    async create(dto: CreateTaskDto, authorId: string) {
        const task = await this.prisma.task.create({
            data: { ...dto, authorId, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
        });

        if (task.assigneeId) {
            this.eventEmitter.emit('task.assigned', new TaskAssignedEvent(task, authorId));
        }

        return task;
    }

    async findAll(query: QueryTaskDto) {
        const { page, limit, ...filters } = query;
        const where = { ...filters };

        const [items, total] = await this.prisma.$transaction([
            this.prisma.task.findMany({
                where,
                skip: (page - 1) * limit,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.task.count({ where }),
        ]);

        return { items, total, page, limit, pageCount: Math.ceil(total / limit) };
    }

    async findOne(id: string) {
        const task = await this.prisma.task.findUnique({ where: { id } });
        if (!task) throw new NotFoundException(`Задача ${id} не найдена`);
        return task;
    }

    async update(id: string, dto: UpdateTaskDto, user: AuthUser) {
        const previous = await this.findOne(id);
        this.assertCanModify(previous, user);

        const updated = await this.prisma.task.update({
            where: { id },
            data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
        });

        if (dto.assigneeId && dto.assigneeId !== previous.assigneeId) {
            this.eventEmitter.emit('task.assigned', new TaskAssignedEvent(updated, user.id));
        }
        if (dto.status === TaskStatus.DONE && previous.status !== TaskStatus.DONE) {
            this.eventEmitter.emit('task.completed', new TaskCompletedEvent(updated, user.id));
        }

        return updated;
    }

    async remove(id: string, user: AuthUser) {
        const task = await this.findOne(id);
        this.assertCanModify(task, user);
        await this.prisma.task.delete({ where: { id } });
    }

    private assertCanModify(task: { authorId: string; assigneeId: string | null }, user: AuthUser) {
        const isOwner = task.authorId === user.id || task.assigneeId === user.id;
        if (user.role !== Role.ADMIN && !isOwner) {
            throw new ForbiddenException('Недостаточно прав для изменения этой задачи');
        }
    }
}