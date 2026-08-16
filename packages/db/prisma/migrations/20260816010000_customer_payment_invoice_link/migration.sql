-- DB stability audit (2026-08-16): Finance's CustomerPayment was entirely
-- disconnected from Sales' real Invoice records — invoiceRef was free text,
-- so recording a payment here never reduced what was actually owed on a
-- real invoice, risking the same payment being entered twice (once "for
-- real" via Sales' own recordPayment, once here). Mirrors the equivalent
-- SupplierPayment/SupplierInvoice link added in
-- 20260813000000_supplier_payment_procurement_link: an optional link so a
-- payment CAN be tied to a real invoice going forward; invoiceRef stays for
-- customers not yet tracked as real Invoice rows and for existing
-- historical rows.

ALTER TABLE `CustomerPayment` ADD COLUMN `invoiceId` VARCHAR(36) NULL;

CREATE INDEX `CustomerPayment_invoiceId_idx` ON `CustomerPayment`(`invoiceId`);

ALTER TABLE `CustomerPayment`
  ADD CONSTRAINT `CustomerPayment_invoiceId_fkey`
  FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
