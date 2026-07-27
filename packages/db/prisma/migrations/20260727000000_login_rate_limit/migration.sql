-- Migration: add LoginRateLimit table for DB-backed login rate limiting

CREATE TABLE IF NOT EXISTS `LoginRateLimit` (
  `id`        VARCHAR(191) NOT NULL,
  `key`       VARCHAR(320) NOT NULL,
  `attempts`  INT          NOT NULL DEFAULT 1,
  `windowEnd` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS `LoginRateLimit_key_idx`       ON `LoginRateLimit`(`key`);
CREATE INDEX IF NOT EXISTS `LoginRateLimit_windowEnd_idx` ON `LoginRateLimit`(`windowEnd`);
