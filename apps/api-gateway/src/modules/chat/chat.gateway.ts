import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@Injectable()
@WebSocketGateway({
  namespace: 'chat',
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private parseCookies(cookieHeader?: string): Record<string, string> {
    if (!cookieHeader) return {};
    return Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      }),
    );
  }

  async handleConnection(client: Socket) {
    try {
      const cookies = this.parseCookies(client.handshake.headers.cookie);
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        cookies.accessToken;
      if (!token) throw new Error('No token');
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
        {
          secret: this.configService.getOrThrow('JWT_ACCESS_SECRET'),
        },
      );
      const userId = payload.sub;
      (client.data as { userId?: string }).userId = userId;
      await client.join(`user:${userId}`);
      // также в личную комнату для чата
      await client.join(`chat:${userId}`);
    } catch {
      client.emit('error', 'Unauthorized');
      client.disconnect(true);
    }
  }

  handleDisconnect() {}

  @SubscribeMessage('chat:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    const senderId = (client.data as { userId?: string }).userId;
    if (!senderId || !data?.receiverId) return;
    this.server.to(`user:${data.receiverId}`).emit('chat:typing', {
      senderId,
      isTyping: !!data.isTyping,
    });
  }

  sendToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
    this.server.to(`chat:${userId}`).emit(event, payload);
  }

  notifyNewMessage(receiverId: string, message: unknown) {
    this.sendToUser(receiverId, 'chat:message', message);
  }
}
