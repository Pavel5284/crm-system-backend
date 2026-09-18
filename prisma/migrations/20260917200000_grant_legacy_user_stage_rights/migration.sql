-- Этап 3 — права legacy-роли USER на переходы стадий.
--
-- В комментарии к enum Role (prisma/schema.prisma) зафиксировано: USER —
-- legacy-значение исторических записей, по смыслу соответствует MANAGER.
-- В seed-правилах (20260917090001) роли USER нет, поэтому без этой миграции
-- все существующие USER-аккаунты получали бы 400 на любом движении сделки.
-- Выдаём USER те же права, что есть у MANAGER. Правила остаются единственным
-- источником истины: никакого маппинга ролей в коде.
--
-- Только добавление значений в массивы (WHERE исключает дубликаты).
-- Существующие строки/правила не удаляются и не изменяются иначе.
--
-- ОТКАТ (вручную):
--   UPDATE "stage_transition_rules"
--   SET "allowedRoles" = array_remove("allowedRoles", 'USER')
--   WHERE 'MANAGER' = ANY("allowedRoles");
--   (уберёт USER и там, где он мог быть добавлен вручную позже, —
--   такие случаи проверить отдельно);
--   DELETE FROM "_prisma_migrations"
--     WHERE "migration_name" = '20260917200000_grant_legacy_user_stage_rights';

UPDATE "stage_transition_rules"
SET "allowedRoles" = "allowedRoles" || ARRAY['USER']::"Role"[]
WHERE 'MANAGER' = ANY("allowedRoles")
  AND NOT ('USER' = ANY("allowedRoles"));
