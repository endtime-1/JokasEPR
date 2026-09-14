-- Owner request (2026-09-14): onboarding several marketers, each submitting
-- their own weekly plan for their own market/territory, reviewed by a
-- Marketing/Sales Manager. `Market` is the territory a marketer is assigned
-- to (assignedUserId); MarketTarget gains a nullable marketId so a plan can
-- be tied to one.
CREATE TABLE `Market` (
  `id`             VARCHAR(191) NOT NULL,
  `companyId`      VARCHAR(191) NOT NULL,
  `branchId`       VARCHAR(191) NULL,
  `name`           VARCHAR(120) NOT NULL,
  `code`           VARCHAR(40) NULL,
  `assignedUserId` VARCHAR(191) NULL,
  `isActive`       BOOLEAN NOT NULL DEFAULT true,
  `notes`          VARCHAR(500) NULL,
  `createdById`    VARCHAR(191) NULL,
  `updatedById`    VARCHAR(191) NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,
  `deletedAt`      DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Market_companyId_name_key` (`companyId`, `name`),
  INDEX `Market_companyId_idx` (`companyId`),
  INDEX `Market_branchId_idx` (`branchId`),
  INDEX `Market_assignedUserId_idx` (`assignedUserId`),
  INDEX `Market_companyId_isActive_idx` (`companyId`, `isActive`),
  INDEX `Market_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Market`
  ADD CONSTRAINT `Market_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Market_branchId_fkey`  FOREIGN KEY (`branchId`)  REFERENCES `Branch`  (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- No FK on marketId, matching every other column on MarketTarget (branchId,
-- productionSiteId, createdById, ...) — this whole subsystem uses plain FK
-- columns with no declared relations or DB constraints, so this follows
-- existing precedent rather than introducing a one-off exception.
ALTER TABLE `MarketTarget` ADD COLUMN `marketId` VARCHAR(191) NULL;
CREATE INDEX `MarketTarget_marketId_idx` ON `MarketTarget` (`marketId`);
