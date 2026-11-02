-- Owner request (2026-11-02): group customers under the market/destination
-- they belong to. Plain FK column (no constraint), same as the rest of the
-- Market subsystem.
ALTER TABLE `Customer`
  ADD COLUMN `marketId` VARCHAR(191) NULL,
  ADD INDEX `Customer_marketId_idx` (`marketId`);
