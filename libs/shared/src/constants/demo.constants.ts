// Демо-стенд: demo1/demo2/demo3 с общей тестовой базой.
//
// demo1 — ADMIN, demo2 — MANAGER, demo3 — LOGIST.
// Все трое видят одни и те же тестовые данные (изоляции по юзерам нет:
// CRM однопользовательский по данным — клиенты/сделки/заказы общие).
//
// Демо-данные помечаются без миграций:
// - демо-клиенты: email на домене DEMO_CUSTOMER_EMAIL_DOMAIN + fromSource 'demo';
// - демо-сделки/заказы: связанные с демо-клиентами;
// - демо-задачи/сообщения/уведомления: автор/участник — демо-юзер.
// Сброс (clearDemoData) удаляет только этот скоуп, боевые данные не трогает.
// Демо-пользователи при сбросе НЕ удаляются (см. assertCanDeleteUser).

export const DEMO_USER_EMAILS = [
  "demo1@example.com",
  "demo2@example.com",
  "demo3@example.com",
] as const;

export type DemoUserEmail = (typeof DEMO_USER_EMAILS)[number];

// Роль задаётся именно в таком порядке: demo1 — админ, demo2 — менеджер,
// demo3 — логист. Строки вместо enum Role, чтобы shared не зависел от prisma.
export const DEMO_USER_ROLES: Record<DemoUserEmail, string> = {
  "demo1@example.com": "ADMIN",
  "demo2@example.com": "MANAGER",
  "demo3@example.com": "LOGIST",
};

export const DEMO_CUSTOMER_EMAIL_DOMAIN = "demo.local";
export const DEMO_CUSTOMER_SOURCE = "demo";

export const DEMO_DELETE_FORBIDDEN_MESSAGE =
  "Демо-пользователя нельзя удалить — он нужен для работы демо-стенда";

export function isDemoEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  return (DEMO_USER_EMAILS as readonly string[]).includes(
    email.trim().toLowerCase(),
  );
}

export function isDemoCustomerEmail(email: unknown): boolean {
  if (typeof email !== "string") return false;
  return email.trim().toLowerCase().endsWith(`@${DEMO_CUSTOMER_EMAIL_DOMAIN}`);
}

// Единая проверка для любого будущего удаления пользователей
// (сейчас DELETE /users/:id нет — helper на вырост + используется в тестах).
// Возвращает true, если удаление разрешено, иначе кидает ошибку с текстом,
// который контроллер маппит в 403.
export function assertCanDeleteUser(email: unknown): true {
  if (isDemoEmail(email)) {
    throw new Error(DEMO_DELETE_FORBIDDEN_MESSAGE);
  }
  return true;
}
