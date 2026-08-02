-- MySQL-compatible notification tables.
-- The original 20260616200000_notification_system/migration.sql used PostgreSQL DDL
-- (CREATE TYPE AS ENUM, UUID, gen_random_uuid(), JSONB) which MySQL rejected silently,
-- leaving these three tables absent from the database.
-- This migration creates them with proper MySQL syntax. IF NOT EXISTS guards against
-- any partially-created state.

CREATE TABLE IF NOT EXISTS `Notification` (
  `id`          VARCHAR(36)    NOT NULL,
  `companyId`   VARCHAR(36)    NOT NULL,
  `userId`      VARCHAR(36)    NOT NULL,
  `type`        ENUM(
    'LOW_STOCK_ALERT','EXPIRY_ALERT','VACCINATION_REMINDER','MEDICATION_REMINDER',
    'PRODUCTION_ORDER_COMPLETED','PURCHASE_APPROVAL_NEEDED','CUSTOMER_PAYMENT_OVERDUE',
    'SUPPLIER_PAYMENT_DUE','MACHINE_MAINTENANCE_DUE','AI_RISK_ALERT','TASK_ASSIGNED',
    'QUALITY_BATCH_REJECTED','STOCK_TRANSFER_REQUEST',
    'LEAVE_REQUEST_SUBMITTED','LEAVE_APPROVED','LEAVE_REJECTED',
    'PAYROLL_APPROVED','PAYROLL_PAID','DOCUMENT_EXPIRY_ALERT',
    'DISCIPLINARY_ISSUED','GRIEVANCE_UPDATED'
  ) NOT NULL,
  `channel`     ENUM('IN_APP','EMAIL','SMS','WHATSAPP') NOT NULL DEFAULT 'IN_APP',
  `status`      ENUM('UNREAD','READ') NOT NULL DEFAULT 'UNREAD',
  `title`       TEXT           NOT NULL,
  `body`        TEXT           NOT NULL,
  `entityType`  VARCHAR(120)   NULL,
  `entityId`    VARCHAR(36)    NULL,
  `metadata`    JSON           NULL,
  `readAt`      DATETIME(3)    NULL,
  `sentAt`      DATETIME(3)    NULL,
  `createdAt`   DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Notification_companyId_userId_status_idx` (`companyId`, `userId`, `status`),
  INDEX `Notification_companyId_userId_createdAt_idx` (`companyId`, `userId`, `createdAt`),
  INDEX `Notification_companyId_type_idx` (`companyId`, `type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NotificationPreference` (
  `id`                VARCHAR(36)   NOT NULL,
  `userId`            VARCHAR(36)   NOT NULL,
  `companyId`         VARCHAR(36)   NOT NULL,
  `notificationType`  ENUM(
    'LOW_STOCK_ALERT','EXPIRY_ALERT','VACCINATION_REMINDER','MEDICATION_REMINDER',
    'PRODUCTION_ORDER_COMPLETED','PURCHASE_APPROVAL_NEEDED','CUSTOMER_PAYMENT_OVERDUE',
    'SUPPLIER_PAYMENT_DUE','MACHINE_MAINTENANCE_DUE','AI_RISK_ALERT','TASK_ASSIGNED',
    'QUALITY_BATCH_REJECTED','STOCK_TRANSFER_REQUEST',
    'LEAVE_REQUEST_SUBMITTED','LEAVE_APPROVED','LEAVE_REJECTED',
    'PAYROLL_APPROVED','PAYROLL_PAID','DOCUMENT_EXPIRY_ALERT',
    'DISCIPLINARY_ISSUED','GRIEVANCE_UPDATED'
  ) NOT NULL,
  `inApp`             TINYINT(1)    NOT NULL DEFAULT 1,
  `email`             TINYINT(1)    NOT NULL DEFAULT 0,
  `sms`               TINYINT(1)    NOT NULL DEFAULT 0,
  `whatsapp`          TINYINT(1)    NOT NULL DEFAULT 0,
  `createdAt`         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`         DATETIME(3)   NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `NotificationPreference_userId_notificationType_key` (`userId`, `notificationType`),
  INDEX `NotificationPreference_userId_idx` (`userId`),
  INDEX `NotificationPreference_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `NotificationConfig` (
  `id`               VARCHAR(36)   NOT NULL,
  `companyId`        VARCHAR(36)   NOT NULL,
  `emailEnabled`     TINYINT(1)    NOT NULL DEFAULT 0,
  `emailFromAddress` VARCHAR(200)  NULL,
  `emailFromName`    VARCHAR(120)  NULL,
  `smsEnabled`       TINYINT(1)    NOT NULL DEFAULT 0,
  `whatsappEnabled`  TINYINT(1)    NOT NULL DEFAULT 0,
  `updatedAt`        DATETIME(3)   NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `NotificationConfig_companyId_key` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
