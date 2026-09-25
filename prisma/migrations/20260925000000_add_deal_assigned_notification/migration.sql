-- Уведомление «назначили ответственным за сделку» (DEAL_ASSIGNED).
-- Только добавление значения в enum (существующие строки не затрагиваются).
-- ОТКАТ (вручную): штатного DROP VALUE нет — только пересоздание типа
-- "NotificationType" без нового значения после проверки отсутствия строк:
--   SELECT count(*) FROM "notifications" WHERE "type" = 'DEAL_ASSIGNED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DEAL_ASSIGNED';
