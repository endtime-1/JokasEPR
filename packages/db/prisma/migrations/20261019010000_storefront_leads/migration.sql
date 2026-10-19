-- Owner request (2026-10-19): the akokofeeds.com contact form and "Become a
-- Retailer" application are saved here first (then emailed), so enquiries are
-- never lost when email is down, and the sales team can follow them up.
CREATE TABLE `StorefrontLead` (
  `id`              VARCHAR(191) NOT NULL,
  `companyId`       VARCHAR(191) NOT NULL,
  `kind`            VARCHAR(20) NOT NULL,
  `name`            VARCHAR(160) NOT NULL,
  `location`        VARCHAR(200) NULL,
  `phone`           VARCHAR(40) NULL,
  `email`           VARCHAR(160) NULL,
  `isDistributor`   BOOLEAN NULL,
  `distributorFeed` VARCHAR(200) NULL,
  `subject`         VARCHAR(200) NULL,
  `message`         TEXT NULL,
  `status`          VARCHAR(20) NOT NULL DEFAULT 'NEW',
  `createdAt`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `StorefrontLead_companyId_status_createdAt_idx` (`companyId`, `status`, `createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StorefrontLead`
  ADD CONSTRAINT `StorefrontLead_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
