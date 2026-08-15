-- Machine/vehicle document tracking (registration, insurance, roadworthy,
-- license) with expiry-driven renewal reminders. New feature, requested
-- 2026-08-15 after the production-readiness audit rounds — nothing existed
-- for this before (no table, no API, no UI).

CREATE TABLE `AssetDocument` (
  `id`               VARCHAR(36)  NOT NULL,
  `companyId`        VARCHAR(36)  NOT NULL,
  `branchId`         VARCHAR(36)  NOT NULL,
  `farmId`           VARCHAR(36)  NULL,
  `warehouseId`      VARCHAR(36)  NULL,
  `productionSiteId` VARCHAR(36)  NULL,
  `machineId`        VARCHAR(36)  NULL,
  `equipmentId`      VARCHAR(36)  NULL,
  `documentType`     ENUM('REGISTRATION','INSURANCE','ROADWORTHY','LICENSE','OTHER') NOT NULL,
  `documentNumber`   VARCHAR(60)  NULL,
  `issueDate`        DATETIME(3)  NULL,
  `expiryDate`       DATETIME(3)  NOT NULL,
  `fileUrl`          VARCHAR(300) NULL,
  `notes`            VARCHAR(500) NULL,
  `lastReminderAt`   DATETIME(3)  NULL,
  `createdById`      VARCHAR(36)  NULL,
  `updatedById`      VARCHAR(36)  NULL,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,
  `deletedAt`        DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  INDEX `AssetDocument_companyId_idx` (`companyId`),
  INDEX `AssetDocument_branchId_idx` (`branchId`),
  INDEX `AssetDocument_farmId_idx` (`farmId`),
  INDEX `AssetDocument_warehouseId_idx` (`warehouseId`),
  INDEX `AssetDocument_productionSiteId_idx` (`productionSiteId`),
  INDEX `AssetDocument_machineId_idx` (`machineId`),
  INDEX `AssetDocument_equipmentId_idx` (`equipmentId`),
  INDEX `AssetDocument_companyId_documentType_idx` (`companyId`, `documentType`),
  INDEX `AssetDocument_companyId_expiryDate_idx` (`companyId`, `expiryDate`),
  INDEX `AssetDocument_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AssetDocument`
  ADD CONSTRAINT `AssetDocument_companyId_fkey`        FOREIGN KEY (`companyId`)        REFERENCES `Company`        (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `AssetDocument_branchId_fkey`         FOREIGN KEY (`branchId`)         REFERENCES `Branch`         (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `AssetDocument_farmId_fkey`           FOREIGN KEY (`farmId`)           REFERENCES `Farm`           (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AssetDocument_warehouseId_fkey`      FOREIGN KEY (`warehouseId`)      REFERENCES `Warehouse`      (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AssetDocument_productionSiteId_fkey` FOREIGN KEY (`productionSiteId`) REFERENCES `ProductionSite` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AssetDocument_machineId_fkey`        FOREIGN KEY (`machineId`)        REFERENCES `Machine`        (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AssetDocument_equipmentId_fkey`      FOREIGN KEY (`equipmentId`)      REFERENCES `Equipment`      (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
