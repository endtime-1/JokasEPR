-- Mobile's PaymentCollectScreen posts to /finance/customer-payments, whose
-- CreateCustomerPaymentDto had no idempotency support at all — a network
-- drop after the server had already recorded the payment fell into mobile's
-- offline-queue retry path and recorded a second real payment on resend.
-- Mirrors the existing Payment.idempotencyKey / SalesOrder.idempotencyKey
-- pattern: nullable column, unique per company, NULL repeats freely.

ALTER TABLE `CustomerPayment` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;

CREATE UNIQUE INDEX `CustomerPayment_companyId_idempotencyKey_key` ON `CustomerPayment`(`companyId`, `idempotencyKey`);
