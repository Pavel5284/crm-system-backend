-- Этап 2 — единая точка входа: поля импорта сделки.
-- isImported отличает сделки, внесённые через POST /deals/import сразу на
-- произвольный этап, от обычных (всегда создаются на stage 'todo').
--
-- Только добавление (additive): новый NOT NULL-столбец имеет DEFAULT false,
-- внешний ключ — SET NULL. Существующие строки не затрагиваются.
--
-- ОТКАТ (вручную):
--   ALTER TABLE "deals" DROP CONSTRAINT "deals_importedBy_fkey";
--   DROP INDEX "deals_importedBy_idx";
--   ALTER TABLE "deals" DROP COLUMN "importedBy", DROP COLUMN "isImported";
--   DELETE FROM "_prisma_migrations"
--     WHERE "migration_name" = '20260917190000_add_deal_import_fields';

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "importedBy" TEXT,
ADD COLUMN     "isImported" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "deals_importedBy_idx" ON "deals"("importedBy");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
