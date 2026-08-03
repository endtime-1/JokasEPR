-- Phase 1: Atomic document-number sequence counter
-- Replaces count+1 pattern (race condition) with MySQL LAST_INSERT_ID() atomic increment

CREATE TABLE `RefSequence` (
  `id`        VARCHAR(36)  NOT NULL,
  `companyId` VARCHAR(36)  NOT NULL,
  `prefix`    VARCHAR(20)  NOT NULL,
  `year`      INT          NOT NULL,
  `lastSeq`   INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RefSequence_companyId_prefix_year_key` (`companyId`, `prefix`, `year`),
  INDEX `RefSequence_companyId_idx` (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
