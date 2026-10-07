-- Owner request (2026-10-07): upload the signed copy of an HR letter after the
-- employee signs it. Stored as an EmployeeDocument tagged with the letter it
-- belongs to, so it is served/authorised like every other employee document.
ALTER TABLE `EmployeeDocument` ADD COLUMN `letterKind` VARCHAR(40) NULL;
ALTER TABLE `EmployeeDocument` ADD COLUMN `letterEntityId` VARCHAR(191) NULL;
CREATE INDEX `EmployeeDocument_companyId_letterKind_letterEntityId_idx` ON `EmployeeDocument`(`companyId`, `letterKind`, `letterEntityId`);
