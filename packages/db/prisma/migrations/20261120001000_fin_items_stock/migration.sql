-- Finance v2 items and stock: the item list (with running quantity and value) and the append-only stock movements.
-- Additive only: two new tables. Undo: down.sql in this folder (run the triggers' down.sql first).

-- CreateTable
CREATE TABLE `fin_items` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(60) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `barcode` VARCHAR(80) NULL,
    `kind` ENUM('GOODS', 'SERVICE') NOT NULL DEFAULT 'GOODS',
    `unit` VARCHAR(20) NOT NULL DEFAULT 'each',
    `category` VARCHAR(80) NULL,
    `sellPrice` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `priceIncludesTax` BOOLEAN NOT NULL DEFAULT true,
    `taxCodeId` VARCHAR(36) NULL,
    `incomeAccountId` VARCHAR(36) NULL,
    `cogsAccountId` VARCHAR(36) NULL,
    `inventoryAccountId` VARCHAR(36) NULL,
    `trackStock` BOOLEAN NOT NULL DEFAULT true,
    `reorderLevel` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `qtyOnHand` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `stockValue` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(500) NULL,
    `externalRef` VARCHAR(100) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_items_companyId_name_idx`(`companyId`, `name`),
    INDEX `fin_items_companyId_isActive_idx`(`companyId`, `isActive`),
    UNIQUE INDEX `fin_items_companyId_sku_key`(`companyId`, `sku`),
    UNIQUE INDEX `fin_items_companyId_barcode_key`(`companyId`, `barcode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_stock_movements` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `movementDate` DATE NOT NULL,
    `type` ENUM('OPENING', 'ADJUSTMENT', 'SALE', 'SALE_RETURN', 'PURCHASE', 'PURCHASE_RETURN') NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unitCost` DECIMAL(15, 4) NOT NULL DEFAULT 0,
    `value` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `balanceQty` DECIMAL(15, 3) NOT NULL,
    `balanceValue` DECIMAL(15, 2) NOT NULL,
    `sourceModule` VARCHAR(40) NOT NULL,
    `sourceId` VARCHAR(80) NOT NULL,
    `journalEntryId` VARCHAR(36) NULL,
    `reference` VARCHAR(100) NULL,
    `notes` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_stock_movements_companyId_itemId_movementDate_idx`(`companyId`, `itemId`, `movementDate`),
    UNIQUE INDEX `fin_stock_movements_companyId_sourceModule_sourceId_key`(`companyId`, `sourceModule`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fin_stock_movements` ADD CONSTRAINT `fin_stock_movements_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `fin_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
