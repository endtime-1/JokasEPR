-- Undo of 20261120000600_fin_banking. Run the banking triggers down.sql first. DESTROYS payment accounts, direct payments, transfers,
-- online payment records, imported statement lines and reconciliation history. The journal entries these posted stay in the ledger.
DROP TABLE IF EXISTS `fin_recon_locks`;
DROP TABLE IF EXISTS `fin_statement_lines`;
DROP TABLE IF EXISTS `fin_statement_imports`;
DROP TABLE IF EXISTS `fin_online_payments`;
DROP TABLE IF EXISTS `fin_transfers`;
DROP TABLE IF EXISTS `fin_payments`;
DROP TABLE IF EXISTS `fin_payment_accounts`;
ALTER TABLE `fin_customer_deposits` DROP COLUMN `sourceReceiptId`;
