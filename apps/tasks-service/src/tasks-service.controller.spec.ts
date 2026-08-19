import { Test, TestingModule } from '@nestjs/testing';
import { TasksServiceController } from './tasks-service.controller';
import { TasksServiceService } from './tasks-service.service';

describe('TasksServiceController', () => {
  let tasksServiceController: TasksServiceController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [TasksServiceController],
      providers: [TasksServiceService],
    }).compile();

    tasksServiceController = app.get<TasksServiceController>(TasksServiceController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(tasksServiceController.getHello()).toBe('Hello World!');
    });
  });
});
