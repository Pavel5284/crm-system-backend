import { OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TaskStatus } from '@prisma/client';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ['authorId'] as const)) {
    @IsOptional()
    @IsEnum(TaskStatus)
    status?: TaskStatus;
}