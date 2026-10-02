import { Injectable } from "@nestjs/common";

@Injectable()
export class TasksServiceService {
  // заглушка из nest new, реальная логика в tasks/. Не удаляю пока — на него
  // ссылается дефолтный контроллер, вычищу вместе с ним.
  getHello(): string {
    return "Hello World!";
  }
}
