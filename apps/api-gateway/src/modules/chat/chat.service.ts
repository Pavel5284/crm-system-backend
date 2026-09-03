import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@app/database';
import { AuthUser } from '@app/shared';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async searchUsers(currentUserId: string, q: string, limit = 20) {
    const query = q?.trim();
    if (!query || query.length < 1) return [];
    return this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { email: { contains: query, mode: 'insensitive' as const } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        position: true,
      },
      take: Math.min(limit, 50),
      orderBy: { name: 'asc' },
    });
  }

  async getConversations(userId: string) {
    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });

    const map = new Map<string, (typeof messages)[number]>();
    for (const m of messages) {
      const partnerId = m.senderId === userId ? m.receiverId : m.senderId;
      if (!map.has(partnerId)) map.set(partnerId, m);
    }

    const conversations = Array.from(map.values()).map((lastMessage) => {
      const partner =
        lastMessage.senderId === userId
          ? lastMessage.receiver
          : lastMessage.sender;
      return {
        partner,
        lastMessage: {
          id: lastMessage.id,
          text: lastMessage.text,
          senderId: lastMessage.senderId,
          receiverId: lastMessage.receiverId,
          createdAt: lastMessage.createdAt,
          read: lastMessage.read,
        },
      };
    });

    // sort by lastMessage date desc
    conversations.sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt).getTime() -
        new Date(a.lastMessage.createdAt).getTime(),
    );
    return conversations;
  }

  async getMessages(userId: string, partnerId: string, limit = 50, offset = 0) {
    if (userId === partnerId)
      throw new BadRequestException('Нельзя писать самому себе');

    const partner = await this.prisma.user.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) throw new NotFoundException('Пользователь не найден');

    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: partnerId },
          { senderId: partnerId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 100),
      skip: offset,
    });

    // помечаем входящие как прочитанные
    await this.prisma.directMessage.updateMany({
      where: { senderId: partnerId, receiverId: userId, read: false },
      data: { read: true },
    });

    return messages;
  }

  async sendMessage(sender: AuthUser, receiverId: string, text: string) {
    if (sender.id === receiverId)
      throw new BadRequestException('Нельзя писать самому себе');
    const trimmed = text?.trim();
    if (!trimmed) throw new BadRequestException('Сообщение пустое');

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) throw new NotFoundException('Пользователь не найден');

    const message = await this.prisma.directMessage.create({
      data: {
        senderId: sender.id,
        receiverId,
        text: trimmed,
      },
    });
    return message;
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.directMessage.count({
      where: { receiverId: userId, read: false },
    });
    return { count };
  }
}
