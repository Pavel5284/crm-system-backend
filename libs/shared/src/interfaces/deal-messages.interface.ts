interface DealRef {
  id: string;
  name: string;
  customerName: string;
  status: string;
  responsibleUserId: string | null;
  /** ISO-строка или null (даты через RMQ едут строками) */
  deadline: string | null;
}

export interface DealStageChangedEventPayload {
  deal: DealRef;
  fromStage: string;
  toStage: string;
  comment: string | null;
  actorId: string;
}

export interface DealDeadlineSoonEventPayload {
  deal: DealRef;
  actorId: string;
}

/**
 * Назначение ответственного за сделку.
 * Одно событие — один новый ответственный (поддерживает
 * PATCH /deals/:id/responsibles с несколькими userIds).
 * deal.responsibleUserId — главный на момент события (для совместимости),
 * конкретный получатель — в assigneeUserId.
 */
export interface DealAssignedEventPayload {
  deal: DealRef;
  assigneeUserId: string;
  actorId?: string;
}
