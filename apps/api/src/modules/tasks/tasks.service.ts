import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';

@Injectable()
export class TasksService {
    constructor(private readonly prisma: PrismaService) {}

    create(dto: CreateTaskDto) {
        return this.prisma.task.create({
            data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
        });
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

    async update(id: string, dto: UpdateTaskDto) {
        await this.findOne(id);
        return this.prisma.task.update({
            where: { id },
            data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
        });
    }

    async remove(id: string) {
        await this.findOne(id);
        await this.prisma.task.delete({ where: { id } });
    }
}