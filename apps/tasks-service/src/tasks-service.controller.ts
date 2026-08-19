import { Controller, Get } from '@nestjs/common';
import { TasksServiceService } from './tasks-service.service';

@Controller()
export class TasksServiceController {
  constructor(private readonly tasksServiceService: TasksServiceService) {}

  @Get()
  getHello(): string {
    return this.tasksServiceService.getHello();
  }
}
