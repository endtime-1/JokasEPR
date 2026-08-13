-- L-BUG (2026-08-13): a serious Poultry health observation (disease
-- outbreak, unusual mortality) only ever produced a passive notification —
-- never a trackable, assigned, follow-up-verified corrective action the way
-- Quality's own findings already get. Adds an optional link so a health
-- observation can anchor a real CorrectiveAction, mirroring the existing
-- checkId/rejectedBatchId columns exactly.

ALTER TABLE `CorrectiveAction` ADD COLUMN `poultryHealthObservationId` VARCHAR(36) NULL;

CREATE INDEX `CorrectiveAction_poultryHealthObservationId_idx` ON `CorrectiveAction`(`poultryHealthObservationId`);

ALTER TABLE `CorrectiveAction`
  ADD CONSTRAINT `CorrectiveAction_poultryHealthObservationId_fkey`
  FOREIGN KEY (`poultryHealthObservationId`) REFERENCES `PoultryHealthObservation`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
