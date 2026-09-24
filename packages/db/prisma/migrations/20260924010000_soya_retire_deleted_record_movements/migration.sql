-- Owner report (2026-09-24): a deleted soya batch still showed in the
-- warehouse log. Deletes used to post "Reversal" movements on top of the
-- originals, so the log listed the entry plus its undo. The service now
-- retires the record's own movements instead; this does the same for soya
-- records deleted before that change (originals and their reversals alike).
-- Quantities are unaffected — on-hand was already corrected at delete time,
-- and every stock report already ignores movements with deletedAt set.
-- Data-only, idempotent.

UPDATE `StockMovement` m
JOIN `SoyaProcessingBatch` r ON r.`id` = m.`referenceId`
SET m.`deletedAt` = r.`deletedAt`
WHERE m.`referenceType` = 'SoyaProcessingBatch' AND m.`deletedAt` IS NULL AND r.`deletedAt` IS NOT NULL;

UPDATE `StockMovement` m
JOIN `SoyaBeanIntake` r ON r.`id` = m.`referenceId`
SET m.`deletedAt` = r.`deletedAt`
WHERE m.`referenceType` = 'SoyaBeanIntake' AND m.`deletedAt` IS NULL AND r.`deletedAt` IS NOT NULL;

UPDATE `StockMovement` m
JOIN `SoyaInternalTransfer` r ON r.`id` = m.`referenceId`
SET m.`deletedAt` = r.`deletedAt`
WHERE m.`referenceType` = 'SoyaInternalTransfer' AND m.`deletedAt` IS NULL AND r.`deletedAt` IS NOT NULL;

UPDATE `StockMovement` m
JOIN `SoyaSalesLink` r ON r.`id` = m.`referenceId`
SET m.`deletedAt` = r.`deletedAt`
WHERE m.`referenceType` = 'SoyaSalesLink' AND m.`deletedAt` IS NULL AND r.`deletedAt` IS NOT NULL;
