-- Finance v2 links to other modules: the columns that tie a draft invoice to its source record, the per-link settings
-- (every link is OFF by default) and the log of what each link did. Additive only. Undo: down.sql in this folder.

-- AlterTable
ALTER TABLE `fin_invoices` ADD COLUMN `externalRef` VARCHAR(100) NULL,
    ADD COLUMN `sourceLabel` VARCHAR(120) NULL,
    ADD COLUMN `sourceTotal` DECIMAL(15, 2) NULL;

-- CreateTable
CREATE TABLE `fin_integration_settings` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `linkKey` VARCHAR(40) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `enabledAt` DATETIME(3) NULL,
    `defaultTaxCodeId` VARCHAR(36) NULL,
    `defaultAccountId` VARCHAR(36) NULL,
    `autoCreateContacts` BOOLEAN NOT NULL DEFAULT false,
    `lastRunAt` DATETIME(3) NULL,
    `lastRunSummary` VARCHAR(300) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_integration_settings_companyId_linkKey_key`(`companyId`, `linkKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_integration_log` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `linkKey` VARCHAR(40) NOT NULL,
    `sourceId` VARCHAR(64) NOT NULL,
    `sourceLabel` VARCHAR(120) NULL,
    `sourceCustomerId` VARCHAR(64) NULL,
    `sourceCustomerName` VARCHAR(200) NULL,
    `status` ENUM('CREATED', 'NEEDS_MAPPING', 'ERROR', 'SOURCE_CANCELLED') NOT NULL,
    `message` VARCHAR(500) NULL,
    `invoiceId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_integration_log_companyId_linkKey_status_idx`(`companyId`, `linkKey`, `status`),
    UNIQUE INDEX `fin_integration_log_companyId_linkKey_sourceId_key`(`companyId`, `linkKey`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex: one source record can only ever create one invoice (NULLs, for ordinary invoices, never collide).
CREATE UNIQUE INDEX `fin_invoices_companyId_externalRef_key` ON `fin_invoices`(`companyId`, `externalRef`);
