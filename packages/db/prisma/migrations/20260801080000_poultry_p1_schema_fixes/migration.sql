-- P-1 Poultry schema fixes
-- 1. Add `notes` to PoultryTransferRecord (referenced in CORRECTABLE map but missing from schema)
-- 2. Add `warehouseId` to FeedConsumptionRecord (already used in service for inventory adjustment)

ALTER TABLE `PoultryTransferRecord`
  ADD COLUMN `notes` VARCHAR(500) NULL AFTER `reason`;

ALTER TABLE `FeedConsumptionRecord`
  ADD COLUMN `warehouseId` VARCHAR(36) NULL AFTER `feedProductId`;

ALTER TABLE `FeedConsumptionRecord`
  ADD CONSTRAINT `FeedConsumptionRecord_warehouseId_fkey`
  FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `FeedConsumptionRecord_warehouseId_idx` ON `FeedConsumptionRecord`(`warehouseId`);
