// Канонический список стадий сделки.
//
// Источник истины для разрешённых ПЕРЕХОДОВ между стадиями —
// таблица stage_transition_rules в БД (см. prisma/schema.prisma).
// Переходы и их условия НЕ дублировать в коде.
export const DEAL_STAGES = [
  "todo",
  "to-be-agreed",
  "in-progress",
  "produced",
  "done",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

// Имена полей модели Deal, на которые может ссылаться
// StageTransitionRule.requiredFields.
export const DEAL_REQUIRED_FIELD_KEYS = [
  "company",
  "description",
  "responsibleUserId",
  "contactName",
  "contactPhone",
  "deadline",
  "priority",
  "source",
] as const;

export type DealRequiredFieldKey = (typeof DEAL_REQUIRED_FIELD_KEYS)[number];
