-- Связка сделок с клиентами через client_id (Deal.customerId уже FK, NOT NULL).
--
-- Компания/контакт/телефон/источник больше не хранятся в сделке текстом:
-- телефон и контактное лицо переезжают на сторону клиента
-- (Customer.phone, Customer.contactPerson), источник уже был у клиента
-- (Customer.fromSource), каноническое имя компании — Customer.name.
-- Бэкфил значений не нужен: dry-run аудит (scripts/audit-deal-customer-links.js)
-- на реальных данных показал пустые значения во всех удаляемых колонках,
-- тестовые строки заранее удалены.
--
-- requiredFields правила todo -> to-be-agreed ссылалось на удаляемые поля
-- Deal (company, contactName): клиент теперь всегда привязан через customerId,
-- для перехода достаточно описания.

ALTER TABLE "customers" ADD COLUMN "phone" TEXT;

ALTER TABLE "customers" ADD COLUMN "contactPerson" TEXT;

ALTER TABLE "deals" DROP COLUMN "company";

ALTER TABLE "deals" DROP COLUMN "contactName";

ALTER TABLE "deals" DROP COLUMN "contactPhone";

ALTER TABLE "deals" DROP COLUMN "source";

UPDATE "stage_transition_rules"
SET "requiredFields" = ARRAY['description']::TEXT[]
WHERE "fromStage" = 'todo'
  AND "toStage" = 'to-be-agreed'
  AND "requiredFields" = ARRAY['company', 'description', 'contactName'];
