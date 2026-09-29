-- Owner request (2026-09-29): one finished feed (e.g. Chick Mash) can be made
-- from more than one formula — local soya or HiPro soya — and every one of
-- them must stock the same product.
--   isDefault       — the formula the system picks for a product by itself
--                     (sales shortfall orders, Market Planning); one per product.
--   alternativeOfId — the formula this one was created as an alternative of;
--                     its finished product follows that formula.
ALTER TABLE `FeedFormula` ADD COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `FeedFormula` ADD COLUMN `alternativeOfId` VARCHAR(191) NULL;

CREATE INDEX `FeedFormula_alternativeOfId_idx` ON `FeedFormula`(`alternativeOfId`);

-- Keep today's behaviour: the formula the system already picked for each
-- product (the most recently updated ACTIVE one) becomes its default.
UPDATE `FeedFormula` f
JOIN (
  SELECT `id` FROM (
    SELECT `id`, ROW_NUMBER() OVER (
      PARTITION BY `companyId`, `finishedProductId`
      ORDER BY (`status` = 'ACTIVE') DESC, `updatedAt` DESC, `id`
    ) AS rn
    FROM `FeedFormula`
    WHERE `deletedAt` IS NULL
  ) ranked
  WHERE ranked.rn = 1
) pick ON pick.`id` = f.`id`
SET f.`isDefault` = true;
