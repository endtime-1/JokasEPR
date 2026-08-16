-- DB stability audit (2026-08-16), Medium: SalesOrder cascaded hard-delete to
-- SalesOrderItem/SalesCommission/DeliveryNote, and FeedProductionBatch /
-- SoyaProcessingBatch each cascaded to 7 child tables carrying real cost
-- data. SalesCommission and DeliveryNote both already carry their own
-- deletedAt column — clear evidence they were designed for soft-delete, not
-- cascade. No service code anywhere currently hard-deletes any of these
-- three parent models (verified — the cascade was dormant, not active), but
-- it was a footgun sitting in the schema: any future hard-delete endpoint,
-- admin script, or direct DB operation would silently wipe audit-relevant
-- history with no warning. Changes ON DELETE from CASCADE to RESTRICT on
-- these 17 relations so a hard delete now fails loudly against real
-- children instead of quietly taking them with it — this changes nothing
-- about current behavior since nothing exercises the cascade today.

-- SalesOrder children
ALTER TABLE `SalesOrderItem` DROP FOREIGN KEY `SalesOrderItem_salesOrderId_fkey`;
ALTER TABLE `SalesOrderItem` ADD CONSTRAINT `SalesOrderItem_salesOrderId_fkey`
  FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SalesCommission` DROP FOREIGN KEY `SalesCommission_salesOrderId_fkey`;
ALTER TABLE `SalesCommission` ADD CONSTRAINT `SalesCommission_salesOrderId_fkey`
  FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `DeliveryNote` DROP FOREIGN KEY `DeliveryNote_salesOrderId_fkey`;
ALTER TABLE `DeliveryNote` ADD CONSTRAINT `DeliveryNote_salesOrderId_fkey`
  FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- FeedProductionBatch children
ALTER TABLE `FeedRawMaterialUsage` DROP FOREIGN KEY `FeedRawMaterialUsage_productionBatchId_fkey`;
ALTER TABLE `FeedRawMaterialUsage` ADD CONSTRAINT `FeedRawMaterialUsage_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FeedQualityCheck` DROP FOREIGN KEY `FeedQualityCheck_productionBatchId_fkey`;
ALTER TABLE `FeedQualityCheck` ADD CONSTRAINT `FeedQualityCheck_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FinishedFeedStock` DROP FOREIGN KEY `FinishedFeedStock_productionBatchId_fkey`;
ALTER TABLE `FinishedFeedStock` ADD CONSTRAINT `FinishedFeedStock_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FeedPackagingRecord` DROP FOREIGN KEY `FeedPackagingRecord_productionBatchId_fkey`;
ALTER TABLE `FeedPackagingRecord` ADD CONSTRAINT `FeedPackagingRecord_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FeedProductionCost` DROP FOREIGN KEY `FeedProductionCost_productionBatchId_fkey`;
ALTER TABLE `FeedProductionCost` ADD CONSTRAINT `FeedProductionCost_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FeedInternalTransfer` DROP FOREIGN KEY `FeedInternalTransfer_productionBatchId_fkey`;
ALTER TABLE `FeedInternalTransfer` ADD CONSTRAINT `FeedInternalTransfer_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FeedExternalSale` DROP FOREIGN KEY `FeedExternalSale_productionBatchId_fkey`;
ALTER TABLE `FeedExternalSale` ADD CONSTRAINT `FeedExternalSale_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `FeedProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- SoyaProcessingBatch children
ALTER TABLE `SoyaOilOutput` DROP FOREIGN KEY `SoyaOilOutput_productionBatchId_fkey`;
ALTER TABLE `SoyaOilOutput` ADD CONSTRAINT `SoyaOilOutput_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `SoyaProcessingBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SoyaCakeOutput` DROP FOREIGN KEY `SoyaCakeOutput_productionBatchId_fkey`;
ALTER TABLE `SoyaCakeOutput` ADD CONSTRAINT `SoyaCakeOutput_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `SoyaProcessingBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SoyaWasteRecord` DROP FOREIGN KEY `SoyaWasteRecord_productionBatchId_fkey`;
ALTER TABLE `SoyaWasteRecord` ADD CONSTRAINT `SoyaWasteRecord_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `SoyaProcessingBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SoyaQualityCheck` DROP FOREIGN KEY `SoyaQualityCheck_productionBatchId_fkey`;
ALTER TABLE `SoyaQualityCheck` ADD CONSTRAINT `SoyaQualityCheck_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `SoyaProcessingBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SoyaProductionCost` DROP FOREIGN KEY `SoyaProductionCost_productionBatchId_fkey`;
ALTER TABLE `SoyaProductionCost` ADD CONSTRAINT `SoyaProductionCost_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `SoyaProcessingBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SoyaInternalTransfer` DROP FOREIGN KEY `SoyaInternalTransfer_productionBatchId_fkey`;
ALTER TABLE `SoyaInternalTransfer` ADD CONSTRAINT `SoyaInternalTransfer_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `SoyaProcessingBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SoyaSalesLink` DROP FOREIGN KEY `SoyaSalesLink_productionBatchId_fkey`;
ALTER TABLE `SoyaSalesLink` ADD CONSTRAINT `SoyaSalesLink_productionBatchId_fkey`
  FOREIGN KEY (`productionBatchId`) REFERENCES `SoyaProcessingBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
