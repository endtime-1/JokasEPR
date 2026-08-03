-- HR-D Recovery: Create DisciplinaryRecord and GrievanceRecord tables
-- HR-D (20260801030000) failed because its first statement (ALTER TABLE Notification)
-- ran before the Notification table existed. The notification_system_mysql migration
-- (20260801025000) now creates Notification correctly. This migration creates the two
-- tables that HR-D never reached due to the early failure.
-- FK constraints are inline so IF NOT EXISTS makes the whole block idempotent.

CREATE TABLE IF NOT EXISTS `DisciplinaryRecord` (
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
  INDEX `DisciplinaryRecord_deletedAt_idx` (`deletedAt`),

  CONSTRAINT `DisciplinaryRecord_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `DisciplinaryRecord_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GrievanceRecord` (
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
  INDEX `GrievanceRecord_deletedAt_idx` (`deletedAt`),

  CONSTRAINT `GrievanceRecord_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `GrievanceRecord_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
