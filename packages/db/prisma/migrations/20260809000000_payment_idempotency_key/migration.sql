-- H9: a client retry after a timeout for a partial payment previously
-- passed the overpayment guard twice independently and recorded two real
-- payments, since neither payment DTO carried a client-supplied
-- idempotency key. Adding a nullable column with a unique (companyId, key)
-- index lets the service detect a resend and return the original payment
-- instead of creating a duplicate. NULL is allowed and repeats freely
-- (MySQL unique indexes treat each NULL as distinct), so existing rows and
-- future payments made without a key are unaffected.

ALTER TABLE `Payment` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;
ALTER TABLE `ProcurementPayment` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;

CREATE UNIQUE INDEX `Payment_companyId_idempotencyKey_key` ON `Payment`(`companyId`, `idempotencyKey`);
CREATE UNIQUE INDEX `ProcurementPayment_companyId_idempotencyKey_key` ON `ProcurementPayment`(`companyId`, `idempotencyKey`);
