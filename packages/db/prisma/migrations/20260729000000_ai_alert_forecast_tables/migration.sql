-- CreateTable: AiAlert
-- AiAlert was present in the Prisma schema but had no corresponding migration,
-- so the table was never created in production. This migration adds it.
CREATE TABLE IF NOT EXISTS `AiAlert` (
    `id`                 VARCHAR(191) NOT NULL,
    `companyId`          VARCHAR(191) NOT NULL,
    `branchId`           VARCHAR(191) NULL,
    `farmId`             VARCHAR(191) NULL,
    `warehouseId`        VARCHAR(191) NULL,
    `productionSiteId`   VARCHAR(191) NULL,
    `category`           ENUM('MORTALITY_ANOMALY','EGG_PRODUCTION_DROP','FEED_CONSUMPTION_ANOMALY','LOW_STOCK_PREDICTION','FEED_DEMAND_FORECAST','SALES_FORECAST','CUSTOMER_REORDER_PREDICTION','SMART_PRICING','SOYA_YIELD_ANOMALY','MACHINE_MAINTENANCE','CUSTOMER_DEBT_RISK','SUPPLIER_DELAY_RISK') NOT NULL,
    `severity`           ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
    `status`             ENUM('UNREAD','ACKNOWLEDGED','RESOLVED') NOT NULL DEFAULT 'UNREAD',
    `title`              VARCHAR(191) NOT NULL,
    `message`            TEXT NOT NULL,
    `requiredPermission` VARCHAR(191) NOT NULL,
    `metadata`           JSON NULL,
    `entityType`         VARCHAR(191) NULL,
    `entityId`           VARCHAR(191) NULL,
    `entityName`         VARCHAR(191) NULL,
    `acknowledgedAt`     DATETIME(3) NULL,
    `acknowledgedById`   VARCHAR(191) NULL,
    `resolvedAt`         DATETIME(3) NULL,
    `resolvedById`       VARCHAR(191) NULL,
    `expiresAt`          DATETIME(3) NULL,
    `createdAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`          DATETIME(3) NOT NULL,

    INDEX `AiAlert_companyId_status_idx`(`companyId`, `status`),
    INDEX `AiAlert_companyId_category_idx`(`companyId`, `category`),
    INDEX `AiAlert_companyId_severity_idx`(`companyId`, `severity`),
    INDEX `AiAlert_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `AiAlert_farmId_idx`(`farmId`),
    INDEX `AiAlert_warehouseId_idx`(`warehouseId`),
    INDEX `AiAlert_productionSiteId_idx`(`productionSiteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: AiForecast
CREATE TABLE IF NOT EXISTS `AiForecast` (
    `id`            VARCHAR(191) NOT NULL,
    `companyId`     VARCHAR(191) NOT NULL,
    `category`      ENUM('MORTALITY_ANOMALY','EGG_PRODUCTION_DROP','FEED_CONSUMPTION_ANOMALY','LOW_STOCK_PREDICTION','FEED_DEMAND_FORECAST','SALES_FORECAST','CUSTOMER_REORDER_PREDICTION','SMART_PRICING','SOYA_YIELD_ANOMALY','MACHINE_MAINTENANCE','CUSTOMER_DEBT_RISK','SUPPLIER_DELAY_RISK') NOT NULL,
    `entityType`    VARCHAR(191) NOT NULL,
    `entityId`      VARCHAR(191) NOT NULL,
    `entityName`    VARCHAR(191) NOT NULL,
    `forecastDate`  DATETIME(3) NOT NULL,
    `forecastValue` DOUBLE NOT NULL,
    `unit`          VARCHAR(191) NULL,
    `confidence`    DOUBLE NOT NULL DEFAULT 0.7,
    `metadata`      JSON NULL,
    `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiForecast_companyId_category_idx`(`companyId`, `category`),
    INDEX `AiForecast_companyId_forecastDate_idx`(`companyId`, `forecastDate`),
    INDEX `AiForecast_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: AiAlert → Company
ALTER TABLE `AiAlert` ADD CONSTRAINT `AiAlert_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: AiAlert → Branch (optional)
ALTER TABLE `AiAlert` ADD CONSTRAINT `AiAlert_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: AiAlert → Farm (optional)
ALTER TABLE `AiAlert` ADD CONSTRAINT `AiAlert_farmId_fkey`
    FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: AiAlert → Warehouse (optional)
ALTER TABLE `AiAlert` ADD CONSTRAINT `AiAlert_warehouseId_fkey`
    FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: AiAlert → ProductionSite (optional)
ALTER TABLE `AiAlert` ADD CONSTRAINT `AiAlert_productionSiteId_fkey`
    FOREIGN KEY (`productionSiteId`) REFERENCES `ProductionSite`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: AiAlert → User (acknowledgedBy, optional)
ALTER TABLE `AiAlert` ADD CONSTRAINT `AiAlert_acknowledgedById_fkey`
    FOREIGN KEY (`acknowledgedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: AiAlert → User (resolvedBy, optional)
ALTER TABLE `AiAlert` ADD CONSTRAINT `AiAlert_resolvedById_fkey`
    FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: AiForecast → Company
ALTER TABLE `AiForecast` ADD CONSTRAINT `AiForecast_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
