import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TaskPriority } from '@prisma/client';

export class CreateTaskDto {
    @ApiProperty({ example: 'Настроить CI' })
    @IsString()
    @MaxLength(200)
    title: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
    @IsOptional()
    @IsEnum(TaskPriority)
    priority?: TaskPriority;

    @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
    @IsOptional()
    @IsISO8601()
    dueDate?: string;

    @ApiProperty({ description: 'ВРЕМЕННО передаётся вручную. В Stage 2 заменим на req.user.id из JWT' })
    @IsUUID()
    authorId: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    assigneeId?: string;
}