-- Finance v2 items and stock: database-level guarantees. Own migration because creating triggers needs the TRIGGER privilege.
--  * A stock movement is the permanent record: it is never deleted, and never edited. The one allowed change is linking it,
--    once, to the ledger entry that was posted for it (journalEntryId from empty to a value). Corrections are new movements.
--  * An item that has stock history cannot be deleted (switch it off instead).
-- Undo: down.sql.

CREATE TRIGGER `fin_stock_movements_bu` BEFORE UPDATE ON `fin_stock_movements` FOR EACH ROW
BEGIN
  IF NOT (OLD.journalEntryId IS NULL AND NEW.journalEntryId IS NOT NULL
          AND NEW.companyId <=> OLD.companyId AND NEW.itemId <=> OLD.itemId AND NEW.movementDate <=> OLD.movementDate
          AND NEW.type <=> OLD.type AND NEW.quantity <=> OLD.quantity AND NEW.unitCost <=> OLD.unitCost AND NEW.value <=> OLD.value
          AND NEW.balanceQty <=> OLD.balanceQty AND NEW.balanceValue <=> OLD.balanceValue
          AND NEW.sourceModule <=> OLD.sourceModule AND NEW.sourceId <=> OLD.sourceId
          AND NEW.reference <=> OLD.reference AND NEW.notes <=> OLD.notes) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a stock movement cannot be edited (post a correcting movement)';
  END IF;
END;

CREATE TRIGGER `fin_stock_movements_bd` BEFORE DELETE ON `fin_stock_movements` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a stock movement cannot be deleted';
END;

CREATE TRIGGER `fin_items_bd` BEFORE DELETE ON `fin_items` FOR EACH ROW
BEGIN
  IF OLD.qtyOnHand <> 0 OR OLD.stockValue <> 0 OR EXISTS (SELECT 1 FROM `fin_stock_movements` WHERE `itemId` = OLD.`id`) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: an item with stock history cannot be deleted (switch it off instead)';
  END IF;
END;
