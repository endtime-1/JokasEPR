-- Finance v2 point of sale: tills, sales, payments and refunds. Additive only: new fin_pos_* tables. Undo: down.sql in this folder (run the triggers' down.sql first).

-- CreateTable
CREATE TABLE `fin_pos_settings` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `momoPaymentAccountId` VARCHAR(36) NULL,
    `cardPaymentAccountId` VARCHAR(36) NULL,
    `floatSourceAccountId` VARCHAR(36) NULL,
    `maxDiscountPercent` DECIMAL(5, 2) NOT NULL DEFAULT 10,
    `refundApprovalAbove` DECIMAL(15, 2) NULL,
    `receiptHeader` VARCHAR(300) NULL,
    `receiptFooter` VARCHAR(300) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_pos_settings_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_registers` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `cashAccountId` VARCHAR(36) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_pos_registers_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `registerId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `cashierId` VARCHAR(64) NOT NULL,
    `cashierName` VARCHAR(160) NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `openingFloat` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `closedAt` DATETIME(3) NULL,
    `closedById` VARCHAR(64) NULL,
    `expectedCash` DECIMAL(15, 2) NULL,
    `countedCash` DECIMAL(15, 2) NULL,
    `variance` DECIMAL(15, 2) NULL,
    `closeNote` VARCHAR(300) NULL,
    `floatTransferId` VARCHAR(36) NULL,
    `varianceEntryId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_pos_sessions_companyId_registerId_status_idx`(`companyId`, `registerId`, `status`),
    INDEX `fin_pos_sessions_companyId_openedAt_idx`(`companyId`, `openedAt`),
    UNIQUE INDEX `fin_pos_sessions_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_sales` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `registerId` VARCHAR(36) NOT NULL,
    `cashierId` VARCHAR(64) NOT NULL,
    `cashierName` VARCHAR(160) NOT NULL,
    `contactId` VARCHAR(36) NULL,
    `customerName` VARCHAR(160) NULL,
    `saleDate` DATE NOT NULL,
    `subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `tendered` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `changeGiven` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `costTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `clientKey` VARCHAR(80) NOT NULL,
    `journalEntryId` VARCHAR(36) NULL,
    `notes` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_pos_sales_companyId_saleDate_idx`(`companyId`, `saleDate`),
    INDEX `fin_pos_sales_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `fin_pos_sales_companyId_number_key`(`companyId`, `number`),
    UNIQUE INDEX `fin_pos_sales_companyId_clientKey_key`(`companyId`, `clientKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_sale_lines` (
    `id` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `itemId` VARCHAR(36) NULL,
    `description` VARCHAR(300) NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unitPrice` DECIMAL(15, 2) NOT NULL,
    `priceIncludesTax` BOOLEAN NOT NULL DEFAULT true,
    `discountAmount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `taxCodeId` VARCHAR(36) NULL,
    `taxRatePercent` DECIMAL(7, 4) NOT NULL DEFAULT 0,
    `lineNet` DECIMAL(15, 2) NOT NULL,
    `lineTax` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `lineTotal` DECIMAL(15, 2) NOT NULL,
    `cost` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `incomeAccountId` VARCHAR(36) NULL,
    `isCharge` BOOLEAN NOT NULL DEFAULT false,
    `movementId` VARCHAR(36) NULL,

    INDEX `fin_pos_sale_lines_saleId_idx`(`saleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_payments` (
    `id` VARCHAR(191) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `method` ENUM('CASH', 'MOMO', 'CARD') NOT NULL,
    `paymentAccountId` VARCHAR(36) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `tendered` DECIMAL(15, 2) NOT NULL,
    `reference` VARCHAR(100) NULL,

    INDEX `fin_pos_payments_saleId_idx`(`saleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_refunds` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(40) NOT NULL,
    `saleId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `cashierId` VARCHAR(64) NOT NULL,
    `cashierName` VARCHAR(160) NOT NULL,
    `approvedById` VARCHAR(64) NULL,
    `refundDate` DATE NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `restock` BOOLEAN NOT NULL DEFAULT true,
    `netTotal` DECIMAL(15, 2) NOT NULL,
    `taxTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 2) NOT NULL,
    `costReturned` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `clientKey` VARCHAR(80) NOT NULL,
    `journalEntryId` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_pos_refunds_companyId_refundDate_idx`(`companyId`, `refundDate`),
    INDEX `fin_pos_refunds_saleId_idx`(`saleId`),
    UNIQUE INDEX `fin_pos_refunds_companyId_number_key`(`companyId`, `number`),
    UNIQUE INDEX `fin_pos_refunds_companyId_clientKey_key`(`companyId`, `clientKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_refund_lines` (
    `id` VARCHAR(191) NOT NULL,
    `refundId` VARCHAR(191) NOT NULL,
    `saleLineId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `net` DECIMAL(15, 2) NOT NULL,
    `tax` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 2) NOT NULL,
    `costReturned` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `movementId` VARCHAR(36) NULL,

    INDEX `fin_pos_refund_lines_refundId_idx`(`refundId`),
    INDEX `fin_pos_refund_lines_saleLineId_idx`(`saleLineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_pos_refund_payments` (
    `id` VARCHAR(191) NOT NULL,
    `refundId` VARCHAR(191) NOT NULL,
    `method` ENUM('CASH', 'MOMO', 'CARD') NOT NULL,
    `paymentAccountId` VARCHAR(36) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `reference` VARCHAR(100) NULL,

    INDEX `fin_pos_refund_payments_refundId_idx`(`refundId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fin_pos_sessions` ADD CONSTRAINT `fin_pos_sessions_registerId_fkey` FOREIGN KEY (`registerId`) REFERENCES `fin_pos_registers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_sales` ADD CONSTRAINT `fin_pos_sales_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `fin_pos_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_sale_lines` ADD CONSTRAINT `fin_pos_sale_lines_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `fin_pos_sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_payments` ADD CONSTRAINT `fin_pos_payments_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `fin_pos_sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_refunds` ADD CONSTRAINT `fin_pos_refunds_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `fin_pos_sales`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_refunds` ADD CONSTRAINT `fin_pos_refunds_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `fin_pos_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_refund_lines` ADD CONSTRAINT `fin_pos_refund_lines_refundId_fkey` FOREIGN KEY (`refundId`) REFERENCES `fin_pos_refunds`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_refund_lines` ADD CONSTRAINT `fin_pos_refund_lines_saleLineId_fkey` FOREIGN KEY (`saleLineId`) REFERENCES `fin_pos_sale_lines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fin_pos_refund_payments` ADD CONSTRAINT `fin_pos_refund_payments_refundId_fkey` FOREIGN KEY (`refundId`) REFERENCES `fin_pos_refunds`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

