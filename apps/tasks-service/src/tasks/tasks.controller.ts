import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import * as shared from '@app/shared';
import {TasksService} from './tasks.service';

@Controller()
export class TasksController {
    constructor(private readonly tasksService: TasksService) {
    }

    @MessagePattern(shared.TASK_PATTERNS.CREATE)
    create(@Payload() message: shared.CreateTaskMessage) {
        return this.tasksService.create(message);
    }

    @MessagePattern(shared.TASK_PATTERNS.FIND_ALL)
    findAll(@Payload() message: shared.FindAllTasksMessage) {
        return this.tasksService.findAll(message);
    }

    @MessagePattern(shared.TASK_PATTERNS.FIND_ONE)
    findOne(@Payload() id: string) {
        return this.tasksService.findOne(id);
    }

    @MessagePattern(shared.TASK_PATTERNS.UPDATE)
    update(@Payload() message: shared.UpdateTaskMessage) {
        return this.tasksService.update(message.id, message.data, message.requester);
    }

    @MessagePattern(shared.TASK_PATTERNS.REMOVE)
    remove(@Payload() message: shared.RemoveTaskMessage) {
        return this.tasksService.remove(message.id, message.requester);
    }
}