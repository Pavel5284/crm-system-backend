-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "telegram" TEXT;

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visits_userId_idx" ON "visits"("userId");

-- CreateIndex
CREATE INDEX "visits_createdAt_idx" ON "visits"("createdAt");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
