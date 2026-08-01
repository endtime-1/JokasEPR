-- HR-D: Disciplinary Records & Grievances
-- Extend NotificationType enum
ALTER TABLE `Notification`
  MODIFY COLUMN `type` ENUM(
    'LOW_STOCK_ALERT','EXPIRY_ALERT','VACCINATION_REMINDER','MEDICATION_REMINDER',
    'PRODUCTION_ORDER_COMPLETED','PURCHASE_APPROVAL_NEEDED','CUSTOMER_PAYMENT_OVERDUE',
    'SUPPLIER_PAYMENT_DUE','MACHINE_MAINTENANCE_DUE','AI_RISK_ALERT','TASK_ASSIGNED',
    'QUALITY_BATCH_REJECTED','STOCK_TRANSFER_REQUEST',
    'LEAVE_REQUEST_SUBMITTED','LEAVE_APPROVED','LEAVE_REJECTED',
    'PAYROLL_APPROVED','PAYROLL_PAID','DOCUMENT_EXPIRY_ALERT',
    'DISCIPLINARY_ISSUED','GRIEVANCE_UPDATED'
  ) NOT NULL;

-- DisciplinaryRecord table
CREATE TABLE `DisciplinaryRecord` (
  `id`             VARCHAR(36)   NOT NULL,
  `companyId`      VARCHAR(36)   NOT NULL,
  `employeeId`     VARCHAR(36)   NOT NULL,
  `reference`      VARCHAR(30)   NOT NULL,
  `incidentDate`   DATETIME(3)   NOT NULL,
  `category`       VARCHAR(60)   NOT NULL,
  `description`    VARCHAR(1000) NOT NULL,
  `actionTaken`    VARCHAR(500)  NOT NULL,
  `issuedById`     VARCHAR(36)   NULL,
  `acknowledgedAt` DATETIME(3)   NULL,
  `notes`          VARCHAR(500)  NULL,
  `createdById`    VARCHAR(36)   NULL,
  `updatedById`    VARCHAR(36)   NULL,
  `createdAt`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3)   NOT NULL,
  `deletedAt`      DATETIME(3)   NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `DisciplinaryRecord_companyId_reference_key` (`companyId`, `reference`),
  INDEX `DisciplinaryRecord_companyId_employeeId_idx` (`companyId`, `employeeId`),
  INDEX `DisciplinaryRecord_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DisciplinaryRecord`
  ADD CONSTRAINT `DisciplinaryRecord_companyId_fkey`  FOREIGN KEY (`companyId`)  REFERENCES `Company`  (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `DisciplinaryRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- GrievanceRecord table
CREATE TABLE `GrievanceRecord` (
  `id`            VARCHAR(36)    NOT NULL,
  `companyId`     VARCHAR(36)    NOT NULL,
  `employeeId`    VARCHAR(36)    NOT NULL,
  `reference`     VARCHAR(30)    NOT NULL,
  `submittedDate` DATETIME(3)    NOT NULL,
  `category`      VARCHAR(60)    NOT NULL,
  `description`   VARCHAR(1000)  NOT NULL,
  `status`        VARCHAR(30)    NOT NULL DEFAULT 'OPEN',
  `resolution`    VARCHAR(1000)  NULL,
  `resolvedById`  VARCHAR(36)    NULL,
  `resolvedAt`    DATETIME(3)    NULL,
  `createdById`   VARCHAR(36)    NULL,
  `updatedById`   VARCHAR(36)    NULL,
  `createdAt`     DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3)    NOT NULL,
  `deletedAt`     DATETIME(3)    NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `GrievanceRecord_companyId_reference_key` (`companyId`, `reference`),
  INDEX `GrievanceRecord_companyId_employeeId_idx` (`companyId`, `employeeId`),
  INDEX `GrievanceRecord_companyId_status_idx` (`companyId`, `status`),
  INDEX `GrievanceRecord_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GrievanceRecord`
  ADD CONSTRAINT `GrievanceRecord_companyId_fkey`  FOREIGN KEY (`companyId`)  REFERENCES `Company`  (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `GrievanceRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
