-- Staged stock transfers (2026-09-01): every inter-warehouse transfer now
-- runs request -> approve -> in-transit -> confirm receipt, instead of
-- completing instantly. See the plan doc "Staged Stock Transfers".
--   * new status IN_TRANSIT (stock has left source, not yet at destination)
--   * new WarehouseType EGG_STORE (drives the egg-collection default, like FEED_STORE)
--   * StockTransfer gains: dispatchedLots (the FIFO lots drawn at approval),
--     receivedQuantity/receivedById/receivedAt, rejectionReason, notes;
--     default status flips COMPLETED -> PENDING_APPROVAL
--   * TransferDiscrepancy: the unaccounted difference when received != dispatched

-- ── enum: StockWorkflowStatus gains IN_TRANSIT (used by 3 tables) ────────────
ALTER TABLE `StockTransfer`
  MODIFY `status` ENUM('DRAFT','PENDING_APPROVAL','APPROVED','IN_TRANSIT','REJECTED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE `StockAdjustment`
  MODIFY `status` ENUM('DRAFT','PENDING_APPROVAL','APPROVED','IN_TRANSIT','REJECTED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE `StockApproval`
  MODIFY `status` ENUM('DRAFT','PENDING_APPROVAL','APPROVED','IN_TRANSIT','REJECTED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING_APPROVAL';

-- ── enum: WarehouseType gains EGG_STORE ─────────────────────────────────────
ALTER TABLE `Warehouse`
  MODIFY `type` ENUM('GENERAL','COLD_STORAGE','FARM_STORE','FEED_STORE','SOYA_STORE','EGG_STORE') NOT NULL DEFAULT 'GENERAL';

-- ── StockTransfer: new columns ─────────────────────────────────────────────
ALTER TABLE `StockTransfer`
  ADD COLUMN `dispatchedLots`   JSON          NULL AFTER `approvedAt`,
  ADD COLUMN `receivedQuantity` DECIMAL(18,4) NULL AFTER `dispatchedLots`,
  ADD COLUMN `receivedById`     VARCHAR(36)   NULL AFTER `receivedQuantity`,
  ADD COLUMN `receivedAt`       DATETIME(3)   NULL AFTER `receivedById`,
  ADD COLUMN `rejectionReason`  TEXT          NULL AFTER `receivedAt`,
  ADD COLUMN `notes`            TEXT          NULL AFTER `rejectionReason`;

-- ── TransferDiscrepancy ────────────────────────────────────────────────────
CREATE TABLE `TransferDiscrepancy` (
  `id`                 VARCHAR(36)  NOT NULL,
  `companyId`          VARCHAR(36)  NOT NULL,
  `branchId`           VARCHAR(36)  NOT NULL,
  `stockTransferId`    VARCHAR(36)  NOT NULL,
  `expectedQuantity`   DECIMAL(18,4) NOT NULL,
  `receivedQuantity`   DECIMAL(18,4) NOT NULL,
  `differenceQuantity` DECIMAL(18,4) NOT NULL,
  `status`             ENUM('PENDING_REVIEW','RESOLVED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `resolution`         ENUM('WRITE_OFF','RECOVERED','SOURCE_MISCOUNT') NULL,
  `reason`             TEXT         NULL,
  `notes`              TEXT         NULL,
  `reportedById`       VARCHAR(36)  NULL,
  `resolvedById`       VARCHAR(36)  NULL,
  `resolvedAt`         DATETIME(3)  NULL,
  `createdAt`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`          DATETIME(3)  NOT NULL,
  `deletedAt`          DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  INDEX `TransferDiscrepancy_companyId_idx` (`companyId`),
  INDEX `TransferDiscrepancy_branchId_idx` (`branchId`),
  INDEX `TransferDiscrepancy_companyId_status_idx` (`companyId`, `status`),
  INDEX `TransferDiscrepancy_stockTransferId_idx` (`stockTransferId`),
  INDEX `TransferDiscrepancy_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TransferDiscrepancy`
  ADD CONSTRAINT `TransferDiscrepancy_companyId_fkey`       FOREIGN KEY (`companyId`)       REFERENCES `Company`       (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `TransferDiscrepancy_branchId_fkey`        FOREIGN KEY (`branchId`)        REFERENCES `Branch`        (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `TransferDiscrepancy_stockTransferId_fkey` FOREIGN KEY (`stockTransferId`) REFERENCES `StockTransfer` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
