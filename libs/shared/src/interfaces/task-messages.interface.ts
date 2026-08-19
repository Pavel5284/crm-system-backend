import { TaskPriority, TaskStatus } from '@prisma/client';
import { AuthUser } from '../types/auth-user.interface';

export interface CreateTaskMessage {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: string;
    assigneeId?: string;
    authorId: string;
}

export interface UpdateTaskMessage {
    id: string;
    data: Partial<Omit<CreateTaskMessage, 'authorId'>> & { status?: TaskStatus };
    requester: AuthUser;
}

export interface FindAllTasksMessage {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string;
    page: number;
    limit: number;
}

export interface RemoveTaskMessage {
    id: string;
    requester: AuthUser;
}

interface TaskRef {
    id: string;
    title: string;
    assigneeId: string | null;
    authorId: string;
}

export interface TaskAssignedEventPayload {
    task: TaskRef;
    actorId: string;
}

export interface TaskCompletedEventPayload {
    task: TaskRef;
    actorId: string;
}