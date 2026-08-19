import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, TaskPriority, TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TasksService', () => {
    let service: TasksService;
    let prisma: {
        task: Record<'create' | 'findUnique' | 'findMany' | 'count' | 'update' | 'delete', jest.Mock>;
        $transaction: jest.Mock;
    };
    let eventEmitter: { emit: jest.Mock };

    const baseTask = {
        id: 'task-1',
        title: 'Test',
        description: null,
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: null,
        authorId: 'user-author',
        assigneeId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        prisma = {
            task: {
                create: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
                count: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            $transaction: jest.fn(),
        };
        eventEmitter = { emit: jest.fn() };

        const module = await Test.createTestingModule({
            providers: [
                TasksService,
                { provide: PrismaService, useValue: prisma },
                { provide: EventEmitter2, useValue: eventEmitter },
            ],
        }).compile();

        service = module.get(TasksService);
    });

    describe('findOne', () => {
        it('бросает NotFoundException, если задача не найдена', async () => {
            prisma.task.findUnique.mockResolvedValue(null);
            await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
        });

        it('возвращает задачу, если найдена', async () => {
            prisma.task.findUnique.mockResolvedValue(baseTask);
            await expect(service.findOne('task-1')).resolves.toEqual(baseTask);
        });
    });

    describe('create', () => {
        it('эмитит task.assigned, если сразу указан assigneeId', async () => {
            prisma.task.create.mockResolvedValue({ ...baseTask, assigneeId: 'user-assignee' });

            await service.create({ title: 'Test', assigneeId: 'user-assignee' } as any, 'user-author');

            expect(eventEmitter.emit).toHaveBeenCalledWith('task.assigned', expect.anything());
        });

        it('не эмитит событий, если исполнитель не назначен', async () => {
            prisma.task.create.mockResolvedValue(baseTask);
            await service.create({ title: 'Test' } as any, 'user-author');
            expect(eventEmitter.emit).not.toHaveBeenCalled();
        });
    });

    describe('update — авторизация', () => {
        it('разрешает автору изменить свою задачу', async () => {
            prisma.task.findUnique.mockResolvedValue(baseTask);
            prisma.task.update.mockResolvedValue({ ...baseTask, title: 'Updated' });

            await expect(
                service.update(
                    'task-1',
                    { title: 'Updated' } as any,
                    { id: 'user-author', email: 'a@a.com', role: Role.USER },
                ),
            ).resolves.toMatchObject({ title: 'Updated' });
        });

        it('запрещает постороннему пользователю изменить чужую задачу', async () => {
            prisma.task.findUnique.mockResolvedValue(baseTask);

            await expect(
                service.update(
                    'task-1',
                    { title: 'Hack' } as any,
                    { id: 'someone-else', email: 'x@x.com', role: Role.USER },
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('разрешает ADMIN изменить любую задачу', async () => {
            prisma.task.findUnique.mockResolvedValue(baseTask);
            prisma.task.update.mockResolvedValue({ ...baseTask, title: 'By admin' });

            await expect(
                service.update(
                    'task-1',
                    { title: 'By admin' } as any,
                    { id: 'admin-id', email: 'ad@a.com', role: Role.ADMIN },
                ),
            ).resolves.toMatchObject({ title: 'By admin' });
        });
    });
});