-- Этап 1 — базовые правила переходов стадий сделки.
--
-- Отдельная миграция (после 20260917090000_add_deal_crm_workflow): значения
-- 'MANAGER' / 'TECHNOLOGIST' / 'LOGIST' типа "Role" нельзя использовать в той же
-- транзакции, где они добавлены через ALTER TYPE ... ADD VALUE, поэтому seed
-- выполняется здесь, когда значения уже зафиксированы.
--
-- requiredFields — имена полей модели Deal (camelCase), которые должны быть
-- заполнены на сделке для разрешения перехода. Пустой массив — без условий.
-- Код НЕ должен дублировать эти правила: единственный источник истины —
-- таблица "stage_transition_rules".
--
-- Идемпотентность: повторный прогон безопасен (ON CONFLICT DO NOTHING).
--
-- ОТКАТ (вручную):
--   DELETE FROM "stage_transition_rules"
--     WHERE ("fromStage", "toStage") IN (
--       ('todo', 'to-be-agreed'),
--       ('to-be-agreed', 'todo'),
--       ('to-be-agreed', 'in-progress'),
--       ('in-progress', 'to-be-agreed'),
--       ('in-progress', 'produced'),
--       ('produced', 'in-progress'),
--       ('produced', 'done')
--     );
--   DELETE FROM "_prisma_migrations"
--     WHERE "migration_name" = '20260917090001_seed_stage_transition_rules';

INSERT INTO "stage_transition_rules"
  ("id", "fromStage", "toStage", "allowedRoles", "requiredFields")
VALUES
  (gen_random_uuid(), 'todo', 'to-be-agreed',
    ARRAY['MANAGER', 'ADMIN']::"Role"[],
    ARRAY['company', 'description', 'contactName']::TEXT[]),
  (gen_random_uuid(), 'to-be-agreed', 'todo',
    ARRAY['MANAGER', 'ADMIN']::"Role"[],
    ARRAY[]::TEXT[]),
  (gen_random_uuid(), 'to-be-agreed', 'in-progress',
    ARRAY['MANAGER', 'TECHNOLOGIST', 'ADMIN']::"Role"[],
    ARRAY['responsibleUserId', 'deadline']::TEXT[]),
  (gen_random_uuid(), 'in-progress', 'to-be-agreed',
    ARRAY['MANAGER', 'TECHNOLOGIST', 'ADMIN']::"Role"[],
    ARRAY[]::TEXT[]),
  (gen_random_uuid(), 'in-progress', 'produced',
    ARRAY['TECHNOLOGIST', 'LOGIST', 'ADMIN']::"Role"[],
    ARRAY[]::TEXT[]),
  (gen_random_uuid(), 'produced', 'in-progress',
    ARRAY['TECHNOLOGIST', 'LOGIST', 'ADMIN']::"Role"[],
    ARRAY[]::TEXT[]),
  (gen_random_uuid(), 'produced', 'done',
    ARRAY['LOGIST', 'MANAGER', 'ADMIN']::"Role"[],
    ARRAY[]::TEXT[])
ON CONFLICT ("fromStage", "toStage") DO NOTHING;
