-- DB stability audit (2026-08-16): Market Planning's createProductionExecution,
-- Feed Production's createBatch, and Soya Processing's createBatch had no
-- idempotency support, unlike their Finance/Sales siblings (Payment,
-- SalesOrder, CustomerPayment, SupplierPayment, ProcurementPayment) — a
-- client retry after a dropped response (network timeout, double-tap on a
-- slow mobile connection) could post the same production run twice, each
-- one consuming raw materials and crediting finished goods a second time.
-- Mirrors the existing idempotencyKey pattern exactly: nullable column,
-- unique per company, NULL repeats freely so it's opt-in per caller.

ALTER TABLE `FeedProductionBatch` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `FeedProductionBatch_companyId_idempotencyKey_key` ON `FeedProductionBatch`(`companyId`, `idempotencyKey`);

ALTER TABLE `SoyaProcessingBatch` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
CREATE UNIQUE INDEX `SoyaProcessingBatch_companyId_idempotencyKey_key` ON `SoyaProcessingBatch`(`companyId`, `idempotencyKey`);
