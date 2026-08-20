import { Task } from '@prisma/client';

export class TaskAssignedEvent {
  constructor(
    public readonly task: Task,
    public readonly actorId: string,
  ) {}
}

export class TaskCompletedEvent {
  constructor(
    public readonly task: Task,
    public readonly actorId: string,
  ) {}
}
