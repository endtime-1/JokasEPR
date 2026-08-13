-- M-BUG (2026-08-13): Finance's SupplierPayment was entirely disconnected
-- from Procurement's real Supplier/SupplierInvoice records — supplierName
-- and purchaseOrderRef were free text, so recording a payment here never
-- reduced what was actually owed on a real invoice, risking the same
-- payment being entered twice (once "for real" in Procurement, once here).
-- Adds optional links so a payment CAN be tied to a real supplier/invoice
-- going forward; the free-text fields stay for suppliers not yet tracked
-- in Procurement and for existing historical rows.

ALTER TABLE `SupplierPayment` ADD COLUMN `supplierId` VARCHAR(36) NULL;
ALTER TABLE `SupplierPayment` ADD COLUMN `invoiceId` VARCHAR(36) NULL;

CREATE INDEX `SupplierPayment_supplierId_idx` ON `SupplierPayment`(`supplierId`);
CREATE INDEX `SupplierPayment_invoiceId_idx` ON `SupplierPayment`(`invoiceId`);

ALTER TABLE `SupplierPayment`
  ADD CONSTRAINT `SupplierPayment_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SupplierPayment`
  ADD CONSTRAINT `SupplierPayment_invoiceId_fkey`
  FOREIGN KEY (`invoiceId`) REFERENCES `SupplierInvoice`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
