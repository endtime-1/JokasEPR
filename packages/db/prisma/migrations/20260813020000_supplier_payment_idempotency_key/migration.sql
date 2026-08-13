-- L-BUG (2026-08-13): SupplierPayment had no idempotencyKey at all, unlike
-- CustomerPayment/Payment/ProcurementPayment — a client retry after a
-- dropped response (network timeout, double-click) could record the same
-- supplier payment twice with nothing to recognize the resend. Mirrors the
-- CustomerPayment idempotencyKey migration exactly: nullable column,
-- unique per company, NULL repeats freely.

ALTER TABLE `SupplierPayment` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;

CREATE UNIQUE INDEX `SupplierPayment_companyId_idempotencyKey_key` ON `SupplierPayment`(`companyId`, `idempotencyKey`);
