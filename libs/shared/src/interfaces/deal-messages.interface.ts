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
