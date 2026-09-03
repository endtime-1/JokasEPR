-- Audit H2: these free-text columns were bare Prisma `String` = VARCHAR(191),
-- while the DTOs that feed them allow up to 500 chars. On MariaDB with the
-- lenient sql_mode set during the VPS cutover, a 192-500 char note was
-- silently truncated on write. Widen to VARCHAR(500) to match the DTOs.
-- Widening stays within the 2-byte length prefix, so MariaDB applies this
-- in place (ALGORITHM=INSTANT).

ALTER TABLE `StockMovement` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `StockAdjustment` MODIFY `reason` VARCHAR(500) NOT NULL;
ALTER TABLE `StockApproval` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `SalesOrder` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `SalesQuote` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `SalesReturn` MODIFY `reason` VARCHAR(500) NOT NULL;
ALTER TABLE `ProspectVisit` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `DeliveryNote` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `Machine` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `Equipment` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `MaintenanceSchedule` MODIFY `instructions` VARCHAR(500) NULL;
ALTER TABLE `SparePartUsage` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `TechnicianAssignment` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `MachineDowntimeRecord` MODIFY `reason` VARCHAR(500) NOT NULL;
ALTER TABLE `FlockBatch` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `DailyPoultryRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `MortalityRecord` MODIFY `reason` VARCHAR(500) NULL;
ALTER TABLE `MortalityRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `FeedConsumptionRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `EggProductionRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `BirdWeightRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `MedicationRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `VaccinationRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `PoultryTransferRecord` MODIFY `reason` VARCHAR(500) NULL;
ALTER TABLE `PoultryTransferRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `FeedReceiptRecord` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `BatchPenAllocation` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `FeedFormulaVersion` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `FeedProductionOrder` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `FeedInternalTransfer` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `SoyaBeanIntake` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `SoyaProcessingBatch` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `SoyaWasteRecord` MODIFY `reason` VARCHAR(500) NULL;
ALTER TABLE `SoyaQualityCheck` MODIFY `notes` VARCHAR(500) NULL;
ALTER TABLE `SoyaInternalTransfer` MODIFY `notes` VARCHAR(500) NULL;
