-- AlterEnum: add PENDING_STOCK_APPROVAL to FeedProductionOrderStatus
ALTER TABLE `FeedProductionOrder` MODIFY COLUMN `status` ENUM('DRAFT','PENDING_STOCK_APPROVAL','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT';

-- CreateTable: FeedExternalSale
CREATE TABLE `FeedExternalSale` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `productionBatchId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `fromWarehouseId` VARCHAR(191) NOT NULL,
    `quantityKg` DECIMAL(18, 4) NOT NULL,
    `unitPrice` DECIMAL(18, 4) NOT NULL,
    `totalValue` DECIMAL(18, 4) NOT NULL,
    `customerName` VARCHAR(191) NULL,
    `saleDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdById` VARCHAR(191) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeedExternalSale_companyId_idx`(`companyId`),
    INDEX `FeedExternalSale_companyId_productionBatchId_idx`(`companyId`, `productionBatchId`),
    INDEX `FeedExternalSale_companyId_saleDate_idx`(`companyId`, `saleDate`),
    INDEX `FeedExternalSale_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FeedExternalSale` ADD CONSTRAINT `FeedExternalSale_productionBatchId_fkey` FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
