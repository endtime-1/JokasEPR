-- Owner request (2026-09-14): a simple, direct egg sale — buyer + quantity
-- (pieces or crates) + price, sold from one EGG_STORE warehouse, no line
-- items, no approval step. Deliberately not SalesOrder/Invoice — the
-- general Sales form's kg/bag/formula logic doesn't fit a one-product,
-- walk-in-buyer transaction, and egg sales are tracked separately from
-- Sales' own reporting by design, not by omission.
CREATE TABLE `EggSale` (
  `id`             VARCHAR(191) NOT NULL,
  `companyId`      VARCHAR(191) NOT NULL,
  `branchId`       VARCHAR(191) NULL,
  `warehouseId`    VARCHAR(191) NOT NULL,
  `saleNumber`     VARCHAR(40) NOT NULL,
  `saleDate`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `buyerName`      VARCHAR(160) NULL,
  `quantityPieces` INT NOT NULL,
  `quantityCrates` DECIMAL(10, 2) NOT NULL,
  `unitPriceCrate` DECIMAL(18, 4) NOT NULL,
  `totalAmount`    DECIMAL(18, 4) NOT NULL,
  `notes`          VARCHAR(500) NULL,
  `createdById`    VARCHAR(191) NULL,
  `updatedById`    VARCHAR(191) NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,
  `deletedAt`      DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `EggSale_companyId_saleNumber_key` (`companyId`, `saleNumber`),
  INDEX `EggSale_companyId_idx` (`companyId`),
  INDEX `EggSale_branchId_idx` (`branchId`),
  INDEX `EggSale_warehouseId_idx` (`warehouseId`),
  INDEX `EggSale_saleDate_idx` (`saleDate`),
  INDEX `EggSale_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EggSale`
  ADD CONSTRAINT `EggSale_companyId_fkey`   FOREIGN KEY (`companyId`)   REFERENCES `Company`   (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `EggSale_branchId_fkey`    FOREIGN KEY (`branchId`)    REFERENCES `Branch`    (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `EggSale_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
