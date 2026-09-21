-- Owner request (2026-09-21): lets a FeedProductionOrder be traced back to
-- the sales order whose stock shortfall it was auto-opened for. Loose
-- reference (no FK constraint), same convention as this table's existing
-- marketTargetId column — cross-module references in this codebase are
-- deliberately kept relation-less to avoid cascade-delete risk.
ALTER TABLE `FeedProductionOrder` ADD COLUMN `salesOrderId` VARCHAR(191) NULL;

CREATE INDEX `FeedProductionOrder_salesOrderId_idx` ON `FeedProductionOrder`(`salesOrderId`);
