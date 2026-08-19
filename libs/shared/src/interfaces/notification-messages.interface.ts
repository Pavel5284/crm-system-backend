import { NotificationType } from '@prisma/client';

export interface NotificationCreatedEventPayload {
    id: string;
    userId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface FindMyNotificationsMessage {
    userId: string;
}

export interface MarkNotificationReadMessage {
    id: string;
    userId: string;
}