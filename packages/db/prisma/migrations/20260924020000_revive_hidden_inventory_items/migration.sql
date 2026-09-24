-- Owner report (2026-09-24): Cake Store showed 2,700 kg "came in today" but
-- 0 products / 0 on hand. InventoryItem is unique per (company, warehouse,
-- product) and deletes are soft, so when a product's row in a warehouse had
-- been deleted (Items → delete, or the warehouse merge tool — both only ever
-- delete a row at quantity 0), every later stock-in upsert incremented that
-- *deleted* row: the quantity was real but hidden from every stock view.
-- The upserts now clear deletedAt; this revives rows already caught.
-- A correctly deleted row always has quantityOnHand = 0, so any deleted row
-- holding stock is one of these. Data-only, idempotent.
UPDATE `InventoryItem`
SET `deletedAt` = NULL
WHERE `deletedAt` IS NOT NULL
  AND `quantityOnHand` <> 0;
