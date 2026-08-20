export const TASK_PATTERNS = {
    CREATE: 'tasks.create',
    FIND_ALL: 'tasks.find_all',
    FIND_ONE: 'tasks.find_one',
    UPDATE: 'tasks.update',
    REMOVE: 'tasks.remove',
} as const;

export const TASK_EVENTS = {
    ASSIGNED: 'task.assigned',
    COMPLETED: 'task.completed',
    DUE_SOON: 'task.due_soon',
} as const;

export const NOTIFICATION_PATTERNS = {
    FIND_MINE: 'notifications.find_mine',
    MARK_READ: 'notifications.mark_read',
} as const;

export const NOTIFICATION_EVENTS = {
    CREATED: 'notification.created',
} as const;