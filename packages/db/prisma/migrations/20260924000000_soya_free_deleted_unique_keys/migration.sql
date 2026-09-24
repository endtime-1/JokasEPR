-- Owner report (2026-09-24): after deleting a soya bean intake, re-entering
-- the same receipt failed with "record with this field already exists".
-- Deletes are soft (deletedAt), so the deleted row — and the StockBatch lot
-- named after it — kept holding the unique receipt/batch number. The service
-- now renames them to `<key>__deleted_<id>` on delete (the convention every
-- other coded record already uses); this backfills rows deleted before that.
-- Data-only, idempotent: already-renamed rows are skipped.

-- Lots first, while the intake/batch still has its original number to match on.
UPDATE `StockBatch` sb
JOIN `SoyaBeanIntake` i
  ON i.`companyId` = sb.`companyId`
 AND i.`productId` = sb.`productId`
 AND sb.`batchNumber` = UPPER(i.`receiptNumber`)
SET sb.`batchNumber` = CONCAT(sb.`batchNumber`, '__DELETED_', i.`id`)
WHERE i.`deletedAt` IS NOT NULL
  AND i.`receiptNumber` NOT LIKE '%\_\_deleted\_%';

UPDATE `StockBatch` sb
JOIN `SoyaProcessingBatch` b
  ON b.`companyId` = sb.`companyId`
 AND (sb.`batchNumber` = CONCAT(b.`batchNumber`, '-OIL') OR sb.`batchNumber` = CONCAT(b.`batchNumber`, '-CAKE'))
SET sb.`batchNumber` = CONCAT(sb.`batchNumber`, '__DELETED_', b.`id`)
WHERE b.`deletedAt` IS NOT NULL
  AND b.`batchNumber` NOT LIKE '%\_\_deleted\_%';

UPDATE `SoyaBeanIntake`
SET `receiptNumber` = CONCAT(`receiptNumber`, '__deleted_', `id`)
WHERE `deletedAt` IS NOT NULL
  AND `receiptNumber` NOT LIKE '%\_\_deleted\_%';

UPDATE `SoyaProcessingBatch`
SET `batchNumber` = CONCAT(`batchNumber`, '__deleted_', `id`)
WHERE `deletedAt` IS NOT NULL
  AND `batchNumber` NOT LIKE '%\_\_deleted\_%';
