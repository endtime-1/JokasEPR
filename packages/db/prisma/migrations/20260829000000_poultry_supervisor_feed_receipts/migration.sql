-- Poultry Supervisor feature (requested 2026-08-29): feed arriving at a farm's
-- feed store is now a first-class record the supervisor keeps. Creating a
-- FeedReceiptRecord credits inventory (InventoryItem + StockBatch lot +
-- PURCHASE_RECEIPT/TRANSFER StockMovement) for that FEED_STORE warehouse.
-- Feeding the birds (FeedConsumptionRecord) already draws it down via the
-- existing consumeInventoryTx FIFO path — nothing new needed on that side.

CREATE TABLE `FeedReceiptRecord` (
  `id`                     VARCHAR(36)  NOT NULL,
  `companyId`              VARCHAR(36)  NOT NULL,
  `branchId`               VARCHAR(36)  NOT NULL,
  `farmId`                 VARCHAR(36)  NOT NULL,
  `warehouseId`            VARCHAR(36)  NOT NULL,
  `feedProductId`          VARCHAR(36)  NOT NULL,
  `receiptDate`            DATETIME(3)  NOT NULL,
  `quantityKg`             DECIMAL(18,4) NOT NULL,
  `sourceType`             ENUM('SUPPLIER','FEED_MILL','OTHER') NOT NULL DEFAULT 'SUPPLIER',
  `supplierName`           VARCHAR(191) NULL,
  `feedInternalTransferId` VARCHAR(36)  NULL,
  `billReference`          VARCHAR(100) NULL,
  `unitCost`               DECIMAL(18,4) NULL,
  `totalCost`              DECIMAL(18,4) NULL,
  `notes`                  VARCHAR(191) NULL,
  `status`                 ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  `idempotencyKey`         VARCHAR(100) NULL,
  `createdById`            VARCHAR(36)  NULL,
  `updatedById`            VARCHAR(36)  NULL,
  `createdAt`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`              DATETIME(3)  NOT NULL,
  `deletedAt`              DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `FeedReceiptRecord_companyId_idempotencyKey_key` (`companyId`, `idempotencyKey`),
  INDEX `FeedReceiptRecord_companyId_idx` (`companyId`),
  INDEX `FeedReceiptRecord_branchId_idx` (`branchId`),
  INDEX `FeedReceiptRecord_farmId_idx` (`farmId`),
  INDEX `FeedReceiptRecord_warehouseId_idx` (`warehouseId`),
  INDEX `FeedReceiptRecord_feedProductId_idx` (`feedProductId`),
  INDEX `FeedReceiptRecord_feedInternalTransferId_idx` (`feedInternalTransferId`),
  INDEX `FeedReceiptRecord_companyId_status_idx` (`companyId`, `status`),
  INDEX `FeedReceiptRecord_companyId_receiptDate_idx` (`companyId`, `receiptDate`),
  INDEX `FeedReceiptRecord_companyId_farmId_receiptDate_idx` (`companyId`, `farmId`, `receiptDate`),
  INDEX `FeedReceiptRecord_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `FeedReceiptRecord`
  ADD CONSTRAINT `FeedReceiptRecord_companyId_fkey`              FOREIGN KEY (`companyId`)              REFERENCES `Company`              (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FeedReceiptRecord_branchId_fkey`               FOREIGN KEY (`branchId`)               REFERENCES `Branch`               (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FeedReceiptRecord_farmId_fkey`                 FOREIGN KEY (`farmId`)                 REFERENCES `Farm`                 (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FeedReceiptRecord_warehouseId_fkey`            FOREIGN KEY (`warehouseId`)            REFERENCES `Warehouse`            (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FeedReceiptRecord_feedProductId_fkey`          FOREIGN KEY (`feedProductId`)          REFERENCES `Product`              (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FeedReceiptRecord_feedInternalTransferId_fkey` FOREIGN KEY (`feedInternalTransferId`) REFERENCES `FeedInternalTransfer` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
