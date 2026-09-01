-- Lets a purchase request be raised directly from a sales order that
-- couldn't be stock-released for lack of inventory. Loose reference (no
-- FK), same convention as PurchaseRequest.marketTargetId /
-- materialRequirementPlanId / procurementRecommendationId.
ALTER TABLE `PurchaseRequest`
  ADD COLUMN `salesOrderId` VARCHAR(191) NULL;

CREATE INDEX `PurchaseRequest_salesOrderId_idx` ON `PurchaseRequest`(`salesOrderId`);
