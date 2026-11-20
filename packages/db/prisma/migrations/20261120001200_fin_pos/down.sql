-- Undo 20261120001200_fin_pos (run the triggers' down.sql first). Deletes all POS tills, sales and refunds.
DROP TABLE IF EXISTS `fin_pos_refund_payments`;
DROP TABLE IF EXISTS `fin_pos_refund_lines`;
DROP TABLE IF EXISTS `fin_pos_refunds`;
DROP TABLE IF EXISTS `fin_pos_payments`;
DROP TABLE IF EXISTS `fin_pos_sale_lines`;
DROP TABLE IF EXISTS `fin_pos_sales`;
DROP TABLE IF EXISTS `fin_pos_sessions`;
DROP TABLE IF EXISTS `fin_pos_registers`;
DROP TABLE IF EXISTS `fin_pos_settings`;
