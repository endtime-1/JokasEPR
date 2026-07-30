-- The original migration 20260701000000_leave_request_system used PostgreSQL
-- DDL syntax (CREATE TYPE, UUID, double-quoted identifiers) which is invalid
-- on the MySQL database used in production. That migration was never applied.
-- This migration recreates the table in correct MySQL syntax.

CREATE TABLE IF NOT EXISTS `LeaveRequest` (
    `id`            VARCHAR(36)  NOT NULL,
    `companyId`     VARCHAR(36)  NOT NULL,
    `employeeId`    VARCHAR(36)  NULL,
    `employeeName`  VARCHAR(160) NOT NULL,
    `employeeCode`  VARCHAR(30)  NULL,
    `reference`     VARCHAR(30)  NOT NULL,
    `leaveType`     ENUM('ANNUAL','SICK','MATERNITY','PATERNITY','COMPASSIONATE','UNPAID') NOT NULL,
    `startDate`     DATETIME(3)  NOT NULL,
    `endDate`       DATETIME(3)  NOT NULL,
    `daysRequested` INTEGER      NOT NULL,
    `reason`        VARCHAR(500) NULL,
    `status`        ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    `reviewedById`  VARCHAR(36)  NULL,
    `reviewNote`    VARCHAR(500) NULL,
    `reviewedAt`    DATETIME(3)  NULL,
    `createdById`   VARCHAR(36)  NULL,
    `updatedById`   VARCHAR(36)  NULL,
    `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt`     DATETIME(3)  NULL,

    UNIQUE INDEX `LeaveRequest_companyId_reference_key`(`companyId`, `reference`),
    INDEX `LeaveRequest_companyId_idx`(`companyId`),
    INDEX `LeaveRequest_companyId_status_idx`(`companyId`, `status`),
    INDEX `LeaveRequest_companyId_employeeId_idx`(`companyId`, `employeeId`),
    INDEX `LeaveRequest_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LeaveRequest`
    ADD CONSTRAINT `LeaveRequest_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LeaveRequest`
    ADD CONSTRAINT `LeaveRequest_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
