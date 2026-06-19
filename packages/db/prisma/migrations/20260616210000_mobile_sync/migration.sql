-- CreateEnum
CREATE TYPE "MobileSyncStatus" AS ENUM ('SYNCED', 'DUPLICATE', 'FAILED');

-- CreateTable
CREATE TABLE "MobileSyncRecord" (
    "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "userId"    UUID NOT NULL,
    "localId"   TEXT NOT NULL,
    "module"    TEXT NOT NULL,
    "endpoint"  TEXT NOT NULL,
    "method"    TEXT NOT NULL DEFAULT 'POST',
    "recordId"  TEXT,
    "status"    "MobileSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "errorMsg"  TEXT,
    "payload"   JSONB,
    "syncedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileSyncRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MobileSyncRecord" ADD CONSTRAINT "MobileSyncRecord_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MobileSyncRecord" ADD CONSTRAINT "MobileSyncRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "MobileSyncRecord_companyId_localId_key" ON "MobileSyncRecord"("companyId", "localId");

-- CreateIndex
CREATE INDEX "MobileSyncRecord_companyId_userId_idx" ON "MobileSyncRecord"("companyId", "userId");

-- CreateIndex
CREATE INDEX "MobileSyncRecord_companyId_syncedAt_idx" ON "MobileSyncRecord"("companyId", "syncedAt");
