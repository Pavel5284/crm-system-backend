import { Injectable } from "@nestjs/common";

@Injectable()
export class NotificationsServiceService {
  // то же что и в tasks-service: болванка из скаффолда, живёт до чистки.
  getHello(): string {
    return "Hello World!";
  }
}
