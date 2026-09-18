-- Этап 1 — модель данных сделок: новые поля Deal, таблицы deal_items /
-- deal_stage_history / deal_attachments / stage_transition_rules, роли
-- MANAGER / TECHNOLOGIST / LOGIST, enum DealPriority.
--
-- Только добавление (additive): существующие строки и столбцы не затрагиваются,
-- новые NOT NULL-столбцы имеют DEFAULT, внешние ключи — SET NULL / CASCADE
-- без удаления пользовательских данных.
--
-- ОТКАТ (вручную, в обратном порядке; выполняется в одной транзакции):
--   ALTER TABLE "deals" DROP CONSTRAINT "deals_responsibleUserId_fkey";
--   ALTER TABLE "deal_items" DROP CONSTRAINT "deal_items_dealId_fkey";
--   ALTER TABLE "deal_stage_history" DROP CONSTRAINT "deal_stage_history_dealId_fkey";
--   ALTER TABLE "deal_stage_history" DROP CONSTRAINT "deal_stage_history_changedByUserId_fkey";
--   ALTER TABLE "deal_attachments" DROP CONSTRAINT "deal_attachments_dealId_fkey";
--   ALTER TABLE "deal_attachments" DROP CONSTRAINT "deal_attachments_uploadedBy_fkey";
--   DROP INDEX "deals_status_idx";
--   DROP INDEX "deals_responsibleUserId_idx";
--   DROP INDEX "stage_transition_rules_fromStage_toStage_key";
--   DROP INDEX "deal_attachments_dealId_idx";
--   DROP INDEX "deal_stage_history_createdAt_idx";
--   DROP INDEX "deal_stage_history_dealId_idx";
--   DROP INDEX "deal_items_dealId_idx";
--   DROP TABLE "stage_transition_rules";
--   DROP TABLE "deal_attachments";
--   DROP TABLE "deal_stage_history";
--   DROP TABLE "deal_items";
--   ALTER TABLE "deals"
--     DROP COLUMN "source",
--     DROP COLUMN "responsibleUserId",
--     DROP COLUMN "priority",
--     DROP COLUMN "description",
--     DROP COLUMN "deadline",
--     DROP COLUMN "contactPhone",
--     DROP COLUMN "contactName",
--     DROP COLUMN "company";
--   DROP TYPE "DealPriority";
--   -- Значения 'MANAGER' / 'TECHNOLOGIST' / 'LOGIST' типа "Role" удалить
--   -- штатно нельзя (PostgreSQL не поддерживает DROP VALUE вне пересоздания
--   -- типа); они безвредны для отката. Полный откат enum — пересоздать тип
--   -- "Role" только со значениями ('USER', 'ADMIN') после проверки, что строк
--   -- с новыми значениями нет.
--   DELETE FROM "_prisma_migrations"
--     WHERE "migration_name" = '20260917090000_add_deal_crm_workflow';

-- CreateEnum
CREATE TYPE "DealPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'MANAGER';
ALTER TYPE "Role" ADD VALUE 'TECHNOLOGIST';
ALTER TYPE "Role" ADD VALUE 'LOGIST';

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "company" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "priority" "DealPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "responsibleUserId" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "deal_items" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "spec" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_stage_history" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_attachments" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_transition_rules" (
    "id" TEXT NOT NULL,
    "fromStage" TEXT NOT NULL,
    "toStage" TEXT NOT NULL,
    "allowedRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "stage_transition_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_items_dealId_idx" ON "deal_items"("dealId");

-- CreateIndex
CREATE INDEX "deal_stage_history_dealId_idx" ON "deal_stage_history"("dealId");

-- CreateIndex
CREATE INDEX "deal_stage_history_createdAt_idx" ON "deal_stage_history"("createdAt");

-- CreateIndex
CREATE INDEX "deal_attachments_dealId_idx" ON "deal_attachments"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "stage_transition_rules_fromStage_toStage_key" ON "stage_transition_rules"("fromStage", "toStage");

-- CreateIndex
CREATE INDEX "deals_responsibleUserId_idx" ON "deals"("responsibleUserId");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_items" ADD CONSTRAINT "deal_items_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_attachments" ADD CONSTRAINT "deal_attachments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_attachments" ADD CONSTRAINT "deal_attachments_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
