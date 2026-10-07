-- Owner request (2026-10-07): HR letters (appointment, employment certificate,
-- disciplinary notice, grievance record) can be edited and the edited wording
-- is kept. One saved version per letter; absent row = system-generated text.
CREATE TABLE `HrLetter` (
  `id`          VARCHAR(191) NOT NULL,
  `companyId`   VARCHAR(191) NOT NULL,
  `kind`        VARCHAR(40) NOT NULL,
  `entityId`    VARCHAR(191) NOT NULL,
  `title`       VARCHAR(200) NOT NULL,
  `body`        TEXT NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `HrLetter_companyId_kind_entityId_key` (`companyId`, `kind`, `entityId`),
  INDEX `HrLetter_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `HrLetter`
  ADD CONSTRAINT `HrLetter_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
