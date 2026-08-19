import { Injectable } from '@nestjs/common';

@Injectable()
export class TasksServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
