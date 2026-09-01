-- Link a direct (external) feed sale to the cash sale it now books in the
-- Sales module: a FULFILLED sales order + PAID invoice + settled payment +
-- Finance revenue entry. Loose references (no FK), matching how
-- StockMovement.referenceId points at its source elsewhere.
ALTER TABLE `FeedExternalSale`
  ADD COLUMN `salesOrderId` VARCHAR(191) NULL,
  ADD COLUMN `invoiceId` VARCHAR(191) NULL;
