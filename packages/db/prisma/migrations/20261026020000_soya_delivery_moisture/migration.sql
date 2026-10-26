-- Owner request (2026-10-26): analyse each bean delivery separately (moisture), and trace each
-- processing run back to the deliveries it used, so yield can be reported per delivery.
ALTER TABLE `SoyaBeanIntake`
  ADD COLUMN `decisionNote` VARCHAR(300) NULL,
  ADD COLUMN `decidedById` VARCHAR(191) NULL,
  ADD COLUMN `decidedAt` DATETIME(3) NULL;

CREATE TABLE `SoyaMoistureReading` (
  `id`              VARCHAR(191) NOT NULL,
  `companyId`       VARCHAR(191) NOT NULL,
  `intakeId`        VARCHAR(191) NOT NULL,
  `moisturePercent` DECIMAL(8,2) NOT NULL,
  `recordedById`    VARCHAR(191) NULL,
  `readAt`          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt`       DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `SoyaMoistureReading_companyId_idx` (`companyId`),
  INDEX `SoyaMoistureReading_intakeId_idx` (`intakeId`),
  CONSTRAINT `SoyaMoistureReading_intakeId_fkey` FOREIGN KEY (`intakeId`) REFERENCES `SoyaBeanIntake`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE `SoyaBatchLot` (
  `id`                VARCHAR(191) NOT NULL,
  `companyId`         VARCHAR(191) NOT NULL,
  `productionBatchId` VARCHAR(191) NOT NULL,
  `intakeId`          VARCHAR(191) NULL,
  `stockBatchId`      VARCHAR(191) NULL,
  `receiptNumber`     VARCHAR(80) NULL,
  `quantityKg`        DECIMAL(18,4) NOT NULL,
  `unitCost`          DECIMAL(18,4) NOT NULL DEFAULT 0,
  `createdAt`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt`         DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `SoyaBatchLot_companyId_idx` (`companyId`),
  INDEX `SoyaBatchLot_productionBatchId_idx` (`productionBatchId`),
  INDEX `SoyaBatchLot_intakeId_idx` (`intakeId`)
);

-- Deliveries that already had a moisture figure: carry it over as their first reading.
INSERT INTO `SoyaMoistureReading` (`id`, `companyId`, `intakeId`, `moisturePercent`, `readAt`)
SELECT UUID(), `companyId`, `id`, `moisturePercent`, `receivedAt`
FROM `SoyaBeanIntake` WHERE `moisturePercent` IS NOT NULL AND `moisturePercent` > 0 AND `deletedAt` IS NULL;
