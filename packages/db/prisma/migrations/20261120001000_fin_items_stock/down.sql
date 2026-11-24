-- Undo 20261120001000_fin_items_stock (run the triggers' down.sql first). Deletes all items and stock history.
DROP TABLE IF EXISTS `fin_stock_movements`;
DROP TABLE IF EXISTS `fin_items`;
