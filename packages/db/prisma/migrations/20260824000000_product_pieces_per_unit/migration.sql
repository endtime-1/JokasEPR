-- Crate-based stock accounting (2026-08-24): there was no unit-conversion
-- concept anywhere in the system — UnitOfMeasure is just a name/code/symbol,
-- and egg-collection stock crediting (poultry.service.ts's addToInventoryTx)
-- credited the raw egg-piece count directly regardless of what unit the
-- product was actually measured in. Setting an egg product's unit to
-- "Crate" (30 eggs) would have silently overstated stock 30x — every piece
-- credited as if it were one whole crate.
--
-- piecesPerUnit records how many individual pieces make up one of this
-- product's stock unit (30 for a Crate-of-eggs product). Defaults to 1 so
-- every existing product is unaffected — a stock unit of 1 piece needs no
-- conversion. addToInventoryTx now divides by this before crediting stock.

ALTER TABLE `Product` ADD COLUMN `piecesPerUnit` INTEGER NOT NULL DEFAULT 1;
