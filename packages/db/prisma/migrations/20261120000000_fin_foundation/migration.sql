-- Finance v2 ("fin") foundation: audit log, settings, numbering, chart of accounts, journals, period locks.
-- Additive only: new fin_* tables, no foreign keys into any existing table. Undo: down.sql in this folder.

-- CreateTable
CREATE TABLE `fin_audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `area` VARCHAR(40) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `entityType` VARCHAR(60) NOT NULL,
    `entityId` VARCHAR(60) NULL,
    `summary` VARCHAR(500) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_audit_logs_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `fin_audit_logs_companyId_entityType_entityId_idx`(`companyId`, `entityType`, `entityId`),
    INDEX `fin_audit_logs_companyId_area_idx`(`companyId`, `area`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_settings` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `businessName` VARCHAR(160) NOT NULL DEFAULT '',
    `legalName` VARCHAR(160) NULL,
    `tin` VARCHAR(40) NULL,
    `addressLine1` VARCHAR(160) NULL,
    `addressLine2` VARCHAR(160) NULL,
    `city` VARCHAR(80) NULL,
    `region` VARCHAR(80) NULL,
    `country` VARCHAR(80) NOT NULL DEFAULT 'Ghana',
    `phone` VARCHAR(40) NULL,
    `email` VARCHAR(160) NULL,
    `logoDataUrl` MEDIUMTEXT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'GHS',
    `fiscalYearStartMonth` INTEGER NOT NULL DEFAULT 1,
    `fiscalYearStartDay` INTEGER NOT NULL DEFAULT 1,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_settings_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_number_sequences` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `docType` VARCHAR(30) NOT NULL,
    `prefix` VARCHAR(12) NOT NULL,
    `padding` INTEGER NOT NULL DEFAULT 4,
    `nextNumber` INTEGER NOT NULL DEFAULT 1,
    `includeYear` BOOLEAN NOT NULL DEFAULT true,
    `resetYearly` BOOLEAN NOT NULL DEFAULT true,
    `lastYear` INTEGER NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_number_sequences_companyId_docType_key`(`companyId`, `docType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(24) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `isPostable` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `systemRole` VARCHAR(40) NULL,
    `description` VARCHAR(240) NULL,
    `externalRef` VARCHAR(100) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_accounts_companyId_type_idx`(`companyId`, `type`),
    INDEX `fin_accounts_parentId_idx`(`parentId`),
    UNIQUE INDEX `fin_accounts_companyId_code_key`(`companyId`, `code`),
    UNIQUE INDEX `fin_accounts_companyId_systemRole_key`(`companyId`, `systemRole`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_journal_entries` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(40) NOT NULL,
    `entryDate` DATE NOT NULL,
    `description` VARCHAR(240) NOT NULL,
    `type` ENUM('STANDARD', 'OPENING', 'ADJUSTMENT', 'CLOSING', 'REVERSAL') NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('DRAFT', 'POSTED', 'REVERSED') NOT NULL DEFAULT 'DRAFT',
    `totalDebit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `totalCredit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `sourceModule` VARCHAR(60) NULL,
    `sourceId` VARCHAR(60) NULL,
    `reversalOf` VARCHAR(36) NULL,
    `reversedById` VARCHAR(36) NULL,
    `notes` VARCHAR(500) NULL,
    `createdById` VARCHAR(191) NULL,
    `postedById` VARCHAR(191) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_journal_entries_companyId_entryDate_idx`(`companyId`, `entryDate`),
    INDEX `fin_journal_entries_companyId_status_idx`(`companyId`, `status`),
    UNIQUE INDEX `fin_journal_entries_companyId_reference_key`(`companyId`, `reference`),
    UNIQUE INDEX `fin_journal_entries_companyId_sourceModule_sourceId_key`(`companyId`, `sourceModule`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_journal_lines` (
    `id` VARCHAR(191) NOT NULL,
    `journalEntryId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `description` VARCHAR(240) NULL,
    `debit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(15, 2) NOT NULL DEFAULT 0,

    INDEX `fin_journal_lines_journalEntryId_idx`(`journalEntryId`),
    INDEX `fin_journal_lines_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_period_locks` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `lockedThrough` DATE NULL,
    `reason` VARCHAR(300) NOT NULL,
    `setById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_period_locks_companyId_createdAt_idx`(`companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fin_accounts` ADD CONSTRAINT `fin_accounts_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `fin_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_journal_lines` ADD CONSTRAINT `fin_journal_lines_journalEntryId_fkey` FOREIGN KEY (`journalEntryId`) REFERENCES `fin_journal_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_journal_lines` ADD CONSTRAINT `fin_journal_lines_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `fin_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Every line is exactly one of debit / credit, never negative, never zero (MySQL 8.0.16+ enforces CHECKs).
ALTER TABLE `fin_journal_lines` ADD CONSTRAINT `fin_journal_lines_amounts_chk`
  CHECK (`debit` >= 0 AND `credit` >= 0 AND (`debit` = 0 OR `credit` = 0) AND (`debit` + `credit`) > 0);
