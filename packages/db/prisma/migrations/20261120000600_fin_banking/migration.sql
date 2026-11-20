-- Finance v2 banking: payment accounts, direct payments, transfers, online payments, statement import, reconciliation locks.
-- Additive only: new fin_* tables plus one nullable column on fin_customer_deposits. Undo: down.sql in this folder.

-- AlterTable
ALTER TABLE `fin_customer_deposits` ADD COLUMN `sourceReceiptId` VARCHAR(36) NULL;

-- CreateTable
CREATE TABLE `fin_payment_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('CASH', 'BANK', 'MOBILE_MONEY', 'PROVIDER') NOT NULL,
    `provider` VARCHAR(20) NULL,
    `bankName` VARCHAR(100) NULL,
    `accountNumber` VARCHAR(40) NULL,
    `ledgerAccountId` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `reconcileFrom` DATE NULL,
    `notes` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_payment_accounts_companyId_isActive_idx`(`companyId`, `isActive`),
    UNIQUE INDEX `fin_payment_accounts_companyId_ledgerAccountId_key`(`companyId`, `ledgerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_payments` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `contactId` VARCHAR(191) NULL,
    `payeeName` VARCHAR(160) NOT NULL,
    `paymentDate` DATE NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CARD') NOT NULL,
    `paidFromAccountId` VARCHAR(191) NOT NULL,
    `debitAccountId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(100) NULL,
    `notes` VARCHAR(500) NULL,
    `status` ENUM('POSTED', 'VOID') NOT NULL DEFAULT 'POSTED',
    `journalEntryId` VARCHAR(36) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_payments_companyId_paymentDate_idx`(`companyId`, `paymentDate`),
    UNIQUE INDEX `fin_payments_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_transfers` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `transferDate` DATE NOT NULL,
    `fromAccountId` VARCHAR(191) NOT NULL,
    `toAccountId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `chargeAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `chargeAccountId` VARCHAR(191) NULL,
    `reference` VARCHAR(100) NULL,
    `notes` VARCHAR(500) NULL,
    `status` ENUM('POSTED', 'VOID') NOT NULL DEFAULT 'POSTED',
    `journalEntryId` VARCHAR(36) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_transfers_companyId_transferDate_idx`(`companyId`, `transferDate`),
    UNIQUE INDEX `fin_transfers_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_online_payments` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `reference` VARCHAR(100) NOT NULL,
    `providerReference` VARCHAR(100) NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `amountPaid` DECIMAL(15, 2) NULL,
    `fee` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'GHS',
    `channel` VARCHAR(30) NULL,
    `customerEmail` VARCHAR(160) NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'REVIEW') NOT NULL DEFAULT 'PENDING',
    `checkoutUrl` VARCHAR(500) NULL,
    `receiptId` VARCHAR(36) NULL,
    `failureReason` VARCHAR(300) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_online_payments_companyId_status_idx`(`companyId`, `status`),
    INDEX `fin_online_payments_invoiceId_idx`(`invoiceId`),
    UNIQUE INDEX `fin_online_payments_provider_reference_key`(`provider`, `reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_statement_imports` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `paymentAccountId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(200) NULL,
    `lineCount` INTEGER NOT NULL,
    `addedCount` INTEGER NOT NULL,
    `skippedCount` INTEGER NOT NULL,
    `closingBalance` DECIMAL(15, 2) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_statement_imports_companyId_paymentAccountId_idx`(`companyId`, `paymentAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_statement_lines` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `paymentAccountId` VARCHAR(191) NOT NULL,
    `importId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `txnDate` DATE NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `reference` VARCHAR(100) NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `balance` DECIMAL(15, 2) NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `status` ENUM('UNMATCHED', 'MATCHED', 'IGNORED') NOT NULL DEFAULT 'UNMATCHED',
    `journalLineId` VARCHAR(36) NULL,
    `matchMethod` VARCHAR(10) NULL,
    `matchedAt` DATETIME(3) NULL,
    `matchedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_statement_lines_paymentAccountId_status_txnDate_idx`(`paymentAccountId`, `status`, `txnDate`),
    UNIQUE INDEX `fin_statement_lines_paymentAccountId_fingerprint_key`(`paymentAccountId`, `fingerprint`),
    UNIQUE INDEX `fin_statement_lines_journalLineId_key`(`journalLineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_recon_locks` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `paymentAccountId` VARCHAR(191) NOT NULL,
    `reconciledThrough` DATE NULL,
    `statementBalance` DECIMAL(15, 2) NULL,
    `ledgerBalance` DECIMAL(15, 2) NULL,
    `note` VARCHAR(300) NOT NULL,
    `setById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_recon_locks_companyId_paymentAccountId_createdAt_idx`(`companyId`, `paymentAccountId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fin_payment_accounts` ADD CONSTRAINT `fin_payment_accounts_ledgerAccountId_fkey` FOREIGN KEY (`ledgerAccountId`) REFERENCES `fin_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_payments` ADD CONSTRAINT `fin_payments_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `fin_contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_statement_lines` ADD CONSTRAINT `fin_statement_lines_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `fin_statement_imports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sanity checks (MySQL 8.0.16+ enforces CHECKs).
ALTER TABLE `fin_payments` ADD CONSTRAINT `fin_payments_chk` CHECK (`amount` > 0);
ALTER TABLE `fin_transfers` ADD CONSTRAINT `fin_transfers_chk` CHECK (`amount` > 0 AND `chargeAmount` >= 0 AND `fromAccountId` <> `toAccountId`);
ALTER TABLE `fin_online_payments` ADD CONSTRAINT `fin_online_payments_chk` CHECK (`amount` > 0 AND `fee` >= 0);
ALTER TABLE `fin_statement_lines` ADD CONSTRAINT `fin_statement_lines_chk` CHECK (`amount` <> 0);
