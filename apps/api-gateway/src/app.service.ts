import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // осталось от nest new, в app.module не подключен. Удалю когда руки дойдут,
  // пока пусть висит чтобы ничего не отвалилось.
  getHello(): string {
    return 'Hello World!';
  }
}
