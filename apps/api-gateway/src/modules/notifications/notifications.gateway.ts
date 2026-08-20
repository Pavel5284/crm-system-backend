import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  namespace: 'notifications',
  cors: { origin: process.env.CORS_ORIGIN ?? '*', credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('Токен не передан');

      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
        {
          secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
        },
      );

      (client.data as { userId?: string }).userId = payload.sub;
      await client.join(`user:${payload.sub}`);
    } catch {
      client.emit('error', 'Unauthorized');
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // Socket.IO сам убирает клиента из комнат — дополнительная логика не нужна
  }

  sendToUser(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
