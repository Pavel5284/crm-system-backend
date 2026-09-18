-- Этап 8 — уведомления: новые типы уведомлений для сделок.
--
-- Только добавление значений в enum (существующие строки не затрагиваются).
-- PostgreSQL позволяет несколько ADD VALUE в одной миграции начиная с v12
-- (проект: postgres:18-alpine; Render Postgres — 14+).
--
-- ОТКАТ (вручную): штатного DROP VALUE нет — только пересоздание типа
-- "NotificationType" без новых значений после проверки отсутствия строк:
--   SELECT count(*) FROM "notifications"
--     WHERE "type" IN ('DEAL_STAGE_CHANGED', 'DEAL_DEADLINE_SOON');
--   DELETE FROM "_prisma_migrations"
--     WHERE "migration_name" = '20260917210000_add_deal_notification_types';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DEAL_STAGE_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'DEAL_DEADLINE_SOON';
