-- Add missing feed mill raw material ingredients (MySQL-compatible version)
-- The original file used PostgreSQL-only syntax (DO $$ block, gen_random_uuid(),
-- double-quoted identifiers, ON CONFLICT ... DO NOTHING). This rewrite uses
-- MySQL-compatible INSERT IGNORE + SELECT FROM Company so it only inserts when
-- the company row exists and silently skips duplicate-key conflicts.
--
-- On the production database this migration was resolved with
--   prisma migrate resolve --applied 20260629000001_feed_raw_materials
-- because this is seed data whose absence does not affect schema correctness.
-- The full product catalogue should be populated via prisma:seed after deploy.

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Achieve (Enzyme Supplement)', 'RM-ACHIEVE', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Larvex', 'RM-LARVEX', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Vitamin Premix', 'RM-VPREMIX', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Feed Binder', 'RM-BINDER', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Kerosene (Anti-Mold)', 'RM-KERO', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Choline Chloride', 'RM-CHOLINE', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '488925b4-41b2-43a3-bac3-4696a2973dec',
  'Corn Oil', 'RM-COIL', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Rose (Antioxidant)', 'RM-ROSE', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;

INSERT IGNORE INTO `Product` (`id`, `companyId`, `uomId`, `name`, `sku`, `type`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `id`, '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
  'Socks (Feed Additive)', 'RM-SOCKS', 'RAW_MATERIAL', 'ACTIVE', NOW(), NOW()
FROM `Company` WHERE `id` = '23ed4040-f5a1-42ad-b4f4-690dc1640112' LIMIT 1;
