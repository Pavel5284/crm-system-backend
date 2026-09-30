-- Payment status audit: payment_status_history records every status
-- transition (creation, confirm, fail, refund) with actor and comment.
-- Additive-only: safe to apply on databases with existing payments
-- (no backfill — history starts from deploy time).
-- Rollback (manual, in a separate migration if ever needed):
--   DROP TABLE "payment_status_history";

-- CreateTable
CREATE TABLE "payment_status_history" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fromStatus" "PaymentStatus",
    "toStatus" "PaymentStatus" NOT NULL,
    "changedByUserId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_status_history_paymentId_idx" ON "payment_status_history"("paymentId");

-- CreateIndex
CREATE INDEX "payment_status_history_createdAt_idx" ON "payment_status_history"("createdAt");

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
