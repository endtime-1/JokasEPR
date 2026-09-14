-- Readiness audit (2026-09-14): PoultryCountAdjustment's own creating
-- migration (20260906120000) declared no FOREIGN KEY constraints at all,
-- unlike every sibling table added in the same batch (e.g. TransferDiscrepancy).
-- schema.prisma has always declared these five relations as required
-- (company/branch/farm/poultryHouse/flockBatch) — add the constraints the
-- original migration should have shipped with, same convention used
-- everywhere else in this schema.
--
-- penId is intentionally left unconstrained here: no `penId` column
-- anywhere in this schema has ever had a FOREIGN KEY (checked every prior
-- migration) — Pen rows are reorganized/merged more often than the tables
-- that reference them, so this follows existing (if imperfect) precedent
-- rather than introducing a one-off exception.
ALTER TABLE `PoultryCountAdjustment`
  ADD CONSTRAINT `PoultryCountAdjustment_companyId_fkey`      FOREIGN KEY (`companyId`)      REFERENCES `Company`      (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PoultryCountAdjustment_branchId_fkey`       FOREIGN KEY (`branchId`)       REFERENCES `Branch`       (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PoultryCountAdjustment_farmId_fkey`         FOREIGN KEY (`farmId`)         REFERENCES `Farm`         (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PoultryCountAdjustment_poultryHouseId_fkey` FOREIGN KEY (`poultryHouseId`) REFERENCES `PoultryHouse` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `PoultryCountAdjustment_flockBatchId_fkey`   FOREIGN KEY (`flockBatchId`)   REFERENCES `FlockBatch`   (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
