import { Role } from "@prisma/client";

// Матрица доступа к мутирующим эндпоинтам сделок (Этап 4 — RBAC).
// Применяется через `@Roles(...DEAL_PERMISSIONS.DEALS_CREATE)` и т.д.
// в DealsController. USER — legacy-значение исторических записей,
// по смыслу соответствует MANAGER.
export const DEAL_PERMISSIONS: Record<
  "DEALS_CREATE" | "DEALS_UPDATE" | "DEALS_DELETE" | "DEALS_IMPORT",
  Role[]
> = {
  // POST /deals — обычное создание (всегда на stage «Входящие»).
  DEALS_CREATE: [Role.MANAGER, Role.ADMIN, Role.USER],
  // PATCH /deals/:id — редактирование полей (без смены stage).
  DEALS_UPDATE: [Role.MANAGER, Role.ADMIN, Role.USER],
  // DELETE /deals/:id — удаление сделки.
  DEALS_DELETE: [Role.ADMIN],
  // POST /deals/import — внесение сразу на произвольный этап.
  DEALS_IMPORT: [Role.ADMIN],
};

// Смена stage (PATCH /deals/:id/stage) списков на уровне эндпоинта НЕ имеет:
// единственный источник истины — таблица stage_transition_rules
// (см. deal-workflow.constants.ts): правило from → to + роль + поля.
