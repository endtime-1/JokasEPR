-- Mobile parity audit (2026-08-17): 21 of the 25 /sync/batch endpoints had
-- no idempotencyKey protection at all — a mobile offline-queue resend, or a
-- direct online submit that succeeded server-side but lost its response and
-- was later replayed via the offline queue, had no way to be recognized as
-- a duplicate. Mirrors the existing idempotencyKey pattern exactly on every
-- remaining "create one row per submission" endpoint: nullable column,
-- unique per company, NULL repeats freely so it's opt-in per caller.
--
-- StockMovement is the one partial exception: it's stamped only on the
-- MobileStockMovementDto "in" path (a single row). The "out"/FIFO
-- consumption path can legitimately create several StockMovement rows for
-- one submission and is left unstamped, relying on MobileSyncRecord's own
-- (companyId, localId) dedup instead — see the schema comment on
-- StockMovement.idempotencyKey.
--
-- /hr/attendance/me and /hr/tasks/:id/status are intentionally excluded:
-- both are already naturally idempotent (attendance check-in upserts by the
-- existing (companyId, employeeId, date) unique key; a task status PATCH
-- has no duplicate-row risk to protect against).

ALTER TABLE `MortalityRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `MortalityRecord_companyId_idempotencyKey_key` ON `MortalityRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `FeedConsumptionRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `FeedConsumptionRecord_companyId_idempotencyKey_key` ON `FeedConsumptionRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `EggProductionRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `EggProductionRecord_companyId_idempotencyKey_key` ON `EggProductionRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `BirdWeightRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `BirdWeightRecord_companyId_idempotencyKey_key` ON `BirdWeightRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `MedicationRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `MedicationRecord_companyId_idempotencyKey_key` ON `MedicationRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `VaccinationRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `VaccinationRecord_companyId_idempotencyKey_key` ON `VaccinationRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `PoultryHealthObservation` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `PoultryHealthObservation_companyId_idempotencyKey_key` ON `PoultryHealthObservation`(`companyId`, `idempotencyKey`);

ALTER TABLE `PoultryCostRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `PoultryCostRecord_companyId_idempotencyKey_key` ON `PoultryCostRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `StockAdjustment` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `StockAdjustment_companyId_idempotencyKey_key` ON `StockAdjustment`(`companyId`, `idempotencyKey`);

ALTER TABLE `StockTransfer` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `StockTransfer_companyId_idempotencyKey_key` ON `StockTransfer`(`companyId`, `idempotencyKey`);

ALTER TABLE `StockMovement` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `StockMovement_companyId_idempotencyKey_key` ON `StockMovement`(`companyId`, `idempotencyKey`);

ALTER TABLE `Expense` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `Expense_companyId_idempotencyKey_key` ON `Expense`(`companyId`, `idempotencyKey`);

ALTER TABLE `MaintenanceRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `MaintenanceRecord_companyId_idempotencyKey_key` ON `MaintenanceRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `BreakdownRecord` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `BreakdownRecord_companyId_idempotencyKey_key` ON `BreakdownRecord`(`companyId`, `idempotencyKey`);

ALTER TABLE `LabReportUpload` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `LabReportUpload_companyId_idempotencyKey_key` ON `LabReportUpload`(`companyId`, `idempotencyKey`);

ALTER TABLE `CorrectiveAction` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `CorrectiveAction_companyId_idempotencyKey_key` ON `CorrectiveAction`(`companyId`, `idempotencyKey`);

ALTER TABLE `ProspectVisit` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `ProspectVisit_companyId_idempotencyKey_key` ON `ProspectVisit`(`companyId`, `idempotencyKey`);

ALTER TABLE `SoyaBeanIntake` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `SoyaBeanIntake_companyId_idempotencyKey_key` ON `SoyaBeanIntake`(`companyId`, `idempotencyKey`);
