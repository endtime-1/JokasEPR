-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'LOW_STOCK_ALERT',
  'EXPIRY_ALERT',
  'VACCINATION_REMINDER',
  'MEDICATION_REMINDER',
  'PRODUCTION_ORDER_COMPLETED',
  'PURCHASE_APPROVAL_NEEDED',
  'CUSTOMER_PAYMENT_OVERDUE',
  'SUPPLIER_PAYMENT_DUE',
  'MACHINE_MAINTENANCE_DUE',
  'AI_RISK_ALERT',
  'TASK_ASSIGNED',
  'QUALITY_BATCH_REJECTED',
  'STOCK_TRANSFER_REQUEST'
);

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateTable
CREATE TABLE "Notification" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "companyId"  UUID        NOT NULL,
  "userId"     UUID        NOT NULL,
  "type"       "NotificationType"  NOT NULL,
  "channel"    "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "status"     "NotificationStatus"  NOT NULL DEFAULT 'UNREAD',
  "title"      TEXT        NOT NULL,
  "body"       TEXT        NOT NULL,
  "entityType" TEXT,
  "entityId"   UUID,
  "metadata"   JSONB,
  "readAt"     TIMESTAMP(3),
  "sentAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "userId"           UUID        NOT NULL,
  "companyId"        UUID        NOT NULL,
  "notificationType" "NotificationType" NOT NULL,
  "inApp"            BOOLEAN     NOT NULL DEFAULT true,
  "email"            BOOLEAN     NOT NULL DEFAULT false,
  "sms"              BOOLEAN     NOT NULL DEFAULT false,
  "whatsapp"         BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationConfig" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "companyId"        UUID        NOT NULL,
  "emailEnabled"     BOOLEAN     NOT NULL DEFAULT false,
  "emailFromAddress" TEXT,
  "emailFromName"    TEXT,
  "smsEnabled"       BOOLEAN     NOT NULL DEFAULT false,
  "whatsappEnabled"  BOOLEAN     NOT NULL DEFAULT false,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_status_idx" ON "Notification"("companyId", "userId", "status");
CREATE INDEX "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");
CREATE INDEX "Notification_companyId_type_idx" ON "Notification"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_notificationType_key" ON "NotificationPreference"("userId", "notificationType");
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");
CREATE INDEX "NotificationPreference_companyId_idx" ON "NotificationPreference"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationConfig_companyId_key" ON "NotificationConfig"("companyId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
