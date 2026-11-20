-- Finance v2 sales: quotes, invoices, receipts, customer deposits, credit notes, recurring invoices, reminder log.
-- Additive only: new fin_* tables; foreign keys only between finance tables. Undo: down.sql in this folder.

-- CreateTable
CREATE TABLE `fin_quotes` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `issueDate` DATE NOT NULL,
    `validUntil` DATE NULL,
    `status` ENUM('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
    `currency` VARCHAR(3) NOT NULL DEFAULT 'GHS',
    `subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `notes` VARCHAR(1000) NULL,
    `terms` VARCHAR(1000) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_quotes_companyId_status_idx`(`companyId`, `status`),
    INDEX `fin_quotes_companyId_contactId_idx`(`companyId`, `contactId`),
    INDEX `fin_quotes_companyId_issueDate_idx`(`companyId`, `issueDate`),
    UNIQUE INDEX `fin_quotes_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_quote_lines` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `itemId` VARCHAR(36) NULL,
    `description` VARCHAR(300) NOT NULL,
    `quantity` DECIMAL(15, 4) NOT NULL,
    `unitPrice` DECIMAL(15, 2) NOT NULL,
    `discountPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxCodeId` VARCHAR(191) NULL,
    `taxRatePercent` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `accountId` VARCHAR(191) NULL,
    `isCharge` BOOLEAN NOT NULL DEFAULT false,
    `lineNet` DECIMAL(15, 2) NOT NULL,
    `lineTax` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `lineTotal` DECIMAL(15, 2) NOT NULL,

    INDEX `fin_quote_lines_quoteId_idx`(`quoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_invoices` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NULL,
    `recurringId` VARCHAR(191) NULL,
    `recurringRunDate` DATE NULL,
    `issueDate` DATE NOT NULL,
    `dueDate` DATE NOT NULL,
    `status` ENUM('DRAFT', 'SENT', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `paymentStatus` ENUM('UNPAID', 'PARTIAL', 'PAID') NOT NULL DEFAULT 'UNPAID',
    `currency` VARCHAR(3) NOT NULL DEFAULT 'GHS',
    `subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `creditedAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `balanceDue` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `notes` VARCHAR(1000) NULL,
    `terms` VARCHAR(1000) NULL,
    `sentAt` DATETIME(3) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(300) NULL,
    `journalEntryId` VARCHAR(36) NULL,
    `linkVersion` INTEGER NOT NULL DEFAULT 1,
    `linkEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_invoices_companyId_status_idx`(`companyId`, `status`),
    INDEX `fin_invoices_companyId_contactId_idx`(`companyId`, `contactId`),
    INDEX `fin_invoices_companyId_issueDate_idx`(`companyId`, `issueDate`),
    INDEX `fin_invoices_companyId_dueDate_idx`(`companyId`, `dueDate`),
    INDEX `fin_invoices_companyId_paymentStatus_idx`(`companyId`, `paymentStatus`),
    UNIQUE INDEX `fin_invoices_companyId_number_key`(`companyId`, `number`),
    UNIQUE INDEX `fin_invoices_recurringId_recurringRunDate_key`(`recurringId`, `recurringRunDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_invoice_lines` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `itemId` VARCHAR(36) NULL,
    `description` VARCHAR(300) NOT NULL,
    `quantity` DECIMAL(15, 4) NOT NULL,
    `unitPrice` DECIMAL(15, 2) NOT NULL,
    `discountPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxCodeId` VARCHAR(191) NULL,
    `taxRatePercent` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `accountId` VARCHAR(191) NULL,
    `isCharge` BOOLEAN NOT NULL DEFAULT false,
    `lineNet` DECIMAL(15, 2) NOT NULL,
    `lineTax` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `lineTotal` DECIMAL(15, 2) NOT NULL,

    INDEX `fin_invoice_lines_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_receipts` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `receiptDate` DATE NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CARD') NOT NULL,
    `paidToAccountId` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(100) NULL,
    `notes` VARCHAR(500) NULL,
    `status` ENUM('POSTED', 'VOID') NOT NULL DEFAULT 'POSTED',
    `journalEntryId` VARCHAR(36) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_receipts_companyId_contactId_idx`(`companyId`, `contactId`),
    INDEX `fin_receipts_companyId_receiptDate_idx`(`companyId`, `receiptDate`),
    UNIQUE INDEX `fin_receipts_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_receipt_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,

    INDEX `fin_receipt_allocations_receiptId_idx`(`receiptId`),
    INDEX `fin_receipt_allocations_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_customer_deposits` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `depositDate` DATE NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `appliedAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `method` ENUM('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CARD') NULL,
    `paidToAccountId` VARCHAR(191) NULL,
    `reference` VARCHAR(100) NULL,
    `notes` VARCHAR(500) NULL,
    `sourceCreditNoteId` VARCHAR(36) NULL,
    `status` ENUM('POSTED', 'VOID') NOT NULL DEFAULT 'POSTED',
    `journalEntryId` VARCHAR(36) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_customer_deposits_companyId_contactId_idx`(`companyId`, `contactId`),
    UNIQUE INDEX `fin_customer_deposits_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_deposit_applications` (
    `id` VARCHAR(191) NOT NULL,
    `depositId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `appliedDate` DATE NOT NULL,
    `journalEntryId` VARCHAR(36) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_deposit_applications_depositId_idx`(`depositId`),
    INDEX `fin_deposit_applications_invoiceId_idx`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_credit_notes` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `creditDate` DATE NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `appliedToInvoice` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `excessToDeposit` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` ENUM('POSTED', 'VOID') NOT NULL DEFAULT 'POSTED',
    `journalEntryId` VARCHAR(36) NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_credit_notes_companyId_invoiceId_idx`(`companyId`, `invoiceId`),
    INDEX `fin_credit_notes_companyId_contactId_idx`(`companyId`, `contactId`),
    UNIQUE INDEX `fin_credit_notes_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_credit_note_lines` (
    `id` VARCHAR(191) NOT NULL,
    `creditNoteId` VARCHAR(191) NOT NULL,
    `invoiceLineId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `quantity` DECIMAL(15, 4) NOT NULL,
    `unitPrice` DECIMAL(15, 2) NOT NULL,
    `discountPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxCodeId` VARCHAR(191) NULL,
    `taxRatePercent` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `accountId` VARCHAR(191) NULL,
    `lineNet` DECIMAL(15, 2) NOT NULL,
    `lineTax` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `lineTotal` DECIMAL(15, 2) NOT NULL,

    INDEX `fin_credit_note_lines_creditNoteId_idx`(`creditNoteId`),
    INDEX `fin_credit_note_lines_invoiceLineId_idx`(`invoiceLineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_recurring_invoices` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `contactId` VARCHAR(191) NOT NULL,
    `frequency` ENUM('WEEKLY', 'MONTHLY') NOT NULL,
    `startDate` DATE NOT NULL,
    `nextRunDate` DATE NOT NULL,
    `endDate` DATE NULL,
    `termsDays` INTEGER NOT NULL DEFAULT 0,
    `autoSend` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(1000) NULL,
    `terms` VARCHAR(1000) NULL,
    `lines` JSON NOT NULL,
    `lastRunAt` DATETIME(3) NULL,
    `runCount` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_recurring_invoices_companyId_active_nextRunDate_idx`(`companyId`, `active`, `nextRunDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_reminder_log` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `step` INTEGER NOT NULL,
    `channel` VARCHAR(10) NOT NULL,
    `toAddress` VARCHAR(160) NULL,
    `status` VARCHAR(10) NOT NULL,
    `error` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_reminder_log_companyId_createdAt_idx`(`companyId`, `createdAt`),
    UNIQUE INDEX `fin_reminder_log_invoiceId_step_channel_key`(`invoiceId`, `step`, `channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fin_quotes` ADD CONSTRAINT `fin_quotes_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `fin_contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_quote_lines` ADD CONSTRAINT `fin_quote_lines_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `fin_quotes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_invoices` ADD CONSTRAINT `fin_invoices_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `fin_contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_invoice_lines` ADD CONSTRAINT `fin_invoice_lines_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `fin_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_receipts` ADD CONSTRAINT `fin_receipts_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `fin_contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_receipt_allocations` ADD CONSTRAINT `fin_receipt_allocations_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `fin_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_receipt_allocations` ADD CONSTRAINT `fin_receipt_allocations_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `fin_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_customer_deposits` ADD CONSTRAINT `fin_customer_deposits_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `fin_contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_deposit_applications` ADD CONSTRAINT `fin_deposit_applications_depositId_fkey` FOREIGN KEY (`depositId`) REFERENCES `fin_customer_deposits`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_deposit_applications` ADD CONSTRAINT `fin_deposit_applications_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `fin_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_credit_notes` ADD CONSTRAINT `fin_credit_notes_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `fin_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_credit_note_lines` ADD CONSTRAINT `fin_credit_note_lines_creditNoteId_fkey` FOREIGN KEY (`creditNoteId`) REFERENCES `fin_credit_notes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_credit_note_lines` ADD CONSTRAINT `fin_credit_note_lines_invoiceLineId_fkey` FOREIGN KEY (`invoiceLineId`) REFERENCES `fin_invoice_lines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_recurring_invoices` ADD CONSTRAINT `fin_recurring_invoices_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `fin_contacts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Sanity checks (MySQL 8.0.16+ enforces CHECKs): no negative money, no zero/negative quantities, balances in range.
ALTER TABLE `fin_quote_lines` ADD CONSTRAINT `fin_quote_lines_chk`
  CHECK (`quantity` > 0 AND `unitPrice` >= 0 AND `discountPercent` BETWEEN 0 AND 100 AND `lineNet` >= 0 AND `lineTax` >= 0 AND `lineTotal` >= 0);
ALTER TABLE `fin_invoice_lines` ADD CONSTRAINT `fin_invoice_lines_chk`
  CHECK (`quantity` > 0 AND `unitPrice` >= 0 AND `discountPercent` BETWEEN 0 AND 100 AND `lineNet` >= 0 AND `lineTax` >= 0 AND `lineTotal` >= 0);
ALTER TABLE `fin_credit_note_lines` ADD CONSTRAINT `fin_credit_note_lines_chk`
  CHECK (`quantity` > 0 AND `unitPrice` >= 0 AND `lineNet` >= 0 AND `lineTax` >= 0 AND `lineTotal` >= 0);
ALTER TABLE `fin_invoices` ADD CONSTRAINT `fin_invoices_chk`
  CHECK (`total` >= 0 AND `paidAmount` >= 0 AND `creditedAmount` >= 0 AND `balanceDue` >= 0 AND `dueDate` >= `issueDate`);
ALTER TABLE `fin_receipts` ADD CONSTRAINT `fin_receipts_chk` CHECK (`amount` > 0);
ALTER TABLE `fin_receipt_allocations` ADD CONSTRAINT `fin_receipt_allocations_chk` CHECK (`amount` > 0);
ALTER TABLE `fin_customer_deposits` ADD CONSTRAINT `fin_customer_deposits_chk` CHECK (`amount` > 0 AND `appliedAmount` >= 0 AND `appliedAmount` <= `amount`);
ALTER TABLE `fin_deposit_applications` ADD CONSTRAINT `fin_deposit_applications_chk` CHECK (`amount` > 0);
ALTER TABLE `fin_credit_notes` ADD CONSTRAINT `fin_credit_notes_chk`
  CHECK (`total` > 0 AND `appliedToInvoice` >= 0 AND `excessToDeposit` >= 0 AND `appliedToInvoice` + `excessToDeposit` = `total`);
