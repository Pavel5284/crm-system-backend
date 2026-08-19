import { Module } from '@nestjs/common';
import { TasksServiceController } from './tasks-service.controller';
import { TasksServiceService } from './tasks-service.service';

@Module({
  imports: [],
  controllers: [TasksServiceController],
  providers: [TasksServiceService],
})
export class TasksServiceModule {}
