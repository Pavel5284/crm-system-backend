import { OrderStatus, PaymentStatus } from "@prisma/client";

// Допустимые ручные переходы статусов заказа.
// Автоматика (см. OrdersService.recalcStatus): CONFIRMED -> PARTIALLY_PAID -> PAID
// выставляется по сумме SUCCEEDED-платежей; вручную эти переходы тоже разрешены
// для коррекции, но обход автомата фиксируется в order_status_history.
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [
    OrderStatus.PARTIALLY_PAID,
    OrderStatus.PAID,
    OrderStatus.CANCELLED,
  ],
  PARTIALLY_PAID: [
    OrderStatus.PAID,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ],
  PAID: [OrderStatus.REFUNDED],
  CANCELLED: [],
  REFUNDED: [],
};

// Переходы в CANCELLED / REFUNDED — только ADMIN (проверяет сервис).
export const ORDER_ADMIN_ONLY_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

// Допустимые переходы статусов платежа.
export const PAYMENT_STATUS_TRANSITIONS: Record<
  PaymentStatus,
  PaymentStatus[]
> = {
  PENDING: [
    PaymentStatus.SUCCEEDED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  FAILED: [PaymentStatus.PENDING],
  SUCCEEDED: [PaymentStatus.REFUNDED],
  CANCELLED: [],
  REFUNDED: [],
};
