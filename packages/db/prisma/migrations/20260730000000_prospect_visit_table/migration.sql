-- ProspectVisit was in the Prisma schema but never had a migration.
-- The sales_customer_management migration created the surrounding models
-- (SalesOrder, Customer, etc.) but omitted this table.
-- This migration creates it in correct MySQL syntax.

CREATE TABLE IF NOT EXISTS `ProspectVisit` (
    `id`           VARCHAR(36)   NOT NULL,
    `companyId`    VARCHAR(36)   NOT NULL,
    `branchId`     VARCHAR(36)   NULL,
    `repId`        VARCHAR(36)   NOT NULL,
    `prospectName` VARCHAR(191)  NOT NULL,
    `phone`        VARCHAR(191)  NULL,
    `address`      VARCHAR(191)  NULL,
    `latitude`     DECIMAL(10,7) NULL,
    `longitude`    DECIMAL(10,7) NULL,
    `visitType`    ENUM('COLD_CALL','REFERRAL','FOLLOW_UP','DEMO','REACTIVATION')          NOT NULL DEFAULT 'COLD_CALL',
    `outcome`      ENUM('INTERESTED','NOT_INTERESTED','FOLLOW_UP_NEEDED','CONVERTED','NO_ANSWER') NOT NULL DEFAULT 'INTERESTED',
    `notes`        TEXT          NULL,
    `visitedAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt`    DATETIME(3)   NULL,

    INDEX `ProspectVisit_companyId_idx`(`companyId`),
    INDEX `ProspectVisit_repId_idx`(`repId`),
    INDEX `ProspectVisit_companyId_visitedAt_idx`(`companyId`, `visitedAt`),
    INDEX `ProspectVisit_companyId_repId_idx`(`companyId`, `repId`),
    INDEX `ProspectVisit_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ProspectVisit`
    ADD CONSTRAINT `ProspectVisit_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
