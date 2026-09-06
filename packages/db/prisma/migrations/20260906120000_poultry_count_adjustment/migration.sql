-- A physical head-count of the birds in a batch / house / pen. The farm
-- recounts periodically; the Excel sheets book it as a transfer with a
-- "Recount" remark. `delta` (= countedTotal - expectedTotal at count time) is
-- a fixed signed number added into every live-bird calculation exactly like an
-- outgoing transfer is subtracted. Soft-delete removes the effect.

CREATE TABLE `PoultryCountAdjustment` (
  `id`             VARCHAR(191) NOT NULL,
  `companyId`      VARCHAR(191) NOT NULL,
  `branchId`       VARCHAR(191) NOT NULL,
  `farmId`         VARCHAR(191) NOT NULL,
  `poultryHouseId` VARCHAR(191) NOT NULL,
  `penId`          VARCHAR(191) NULL,
  `flockBatchId`   VARCHAR(191) NOT NULL,
  `adjustmentDate` DATETIME(3) NOT NULL,
  `countedTotal`   INTEGER NOT NULL,
  `expectedTotal`  INTEGER NOT NULL,
  `delta`          INTEGER NOT NULL,
  `reason`         VARCHAR(500) NULL,
  `notes`          VARCHAR(500) NULL,
  `status`         ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  `idempotencyKey` VARCHAR(100) NULL,
  `createdById`    VARCHAR(191) NULL,
  `updatedById`    VARCHAR(191) NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,
  `deletedAt`      DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PoultryCountAdjustment_companyId_idempotencyKey_key` (`companyId`, `idempotencyKey`),
  INDEX `PoultryCountAdjustment_companyId_idx` (`companyId`),
  INDEX `PoultryCountAdjustment_branchId_idx` (`branchId`),
  INDEX `PoultryCountAdjustment_farmId_idx` (`farmId`),
  INDEX `PoultryCountAdjustment_poultryHouseId_idx` (`poultryHouseId`),
  INDEX `PoultryCountAdjustment_penId_idx` (`penId`),
  INDEX `PoultryCountAdjustment_flockBatchId_idx` (`flockBatchId`),
  INDEX `PoultryCountAdjustment_companyId_status_idx` (`companyId`, `status`),
  INDEX `PoultryCountAdjustment_companyId_adjustmentDate_idx` (`companyId`, `adjustmentDate`),
  INDEX `PoultryCountAdjustment_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
