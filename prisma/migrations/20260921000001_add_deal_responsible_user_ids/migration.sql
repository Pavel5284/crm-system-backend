-- Несколько ответственных на сделку. responsibleUserIds[1] = главный ( = responsibleUserId).
ALTER TABLE "deals" ADD COLUMN "responsibleUserIds" TEXT[] NOT NULL DEFAULT '{}';

-- Бэкфилл старых строк: единственный ответственный становится списком из одного.
UPDATE "deals" SET "responsibleUserIds" = ARRAY["responsibleUserId"] WHERE "responsibleUserId" IS NOT NULL;
