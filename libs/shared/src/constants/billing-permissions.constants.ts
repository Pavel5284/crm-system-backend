import { Role } from "@prisma/client";

// RBAC для заказов и платежей. Применяется через `@Roles(...)`
// в OrdersController / PaymentsController.
// USER — legacy-значение (по смыслу MANAGER).
export const ORDER_PERMISSIONS: Record<
  "ORDERS_CREATE" | "ORDERS_UPDATE" | "ORDERS_DELETE",
  Role[]
> = {
  // POST /orders — создание из сделки (dealId) или вручную (customerId + total/items).
  ORDERS_CREATE: [Role.MANAGER, Role.ADMIN, Role.USER],
  // PATCH /orders/:id, PATCH /orders/:id/status — редактирование и смена статуса.
  // Переходы в CANCELLED / REFUNDED дополнительно проверяет сервис (только ADMIN).
  ORDERS_UPDATE: [Role.MANAGER, Role.ADMIN, Role.USER],
  // DELETE /orders/:id — только ADMIN; заказы с успешными платежами не удаляются.
  ORDERS_DELETE: [Role.ADMIN],
};

export const PAYMENT_PERMISSIONS: Record<
  "PAYMENTS_CREATE" | "PAYMENTS_UPDATE" | "PAYMENTS_REFUND" | "PAYMENTS_DELETE",
  Role[]
> = {
  // POST /payments — учёт оплаты по заказу.
  PAYMENTS_CREATE: [Role.MANAGER, Role.ADMIN, Role.USER],
  // PATCH /payments/:id/status — PENDING -> SUCCEEDED / FAILED / CANCELLED.
  PAYMENTS_UPDATE: [Role.MANAGER, Role.ADMIN, Role.USER],
  // POST /payments/:id/refund — возврат успешной оплаты (только ADMIN/MANAGER).
  PAYMENTS_REFUND: [Role.ADMIN, Role.MANAGER],
  // DELETE /payments/:id — только PENDING/FAILED и только ADMIN.
  PAYMENTS_DELETE: [Role.ADMIN],
};
