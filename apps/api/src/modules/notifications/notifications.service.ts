import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly gateway: NotificationsGateway,
    ) {}

    async notifyUser(userId: string, type: NotificationType, payload: Prisma.InputJsonValue) {
        const notification = await this.prisma.notification.create({
            data: { userId, type, payload },
        });
        this.gateway.sendToUser(userId, notification);
        return notification;
    }
}