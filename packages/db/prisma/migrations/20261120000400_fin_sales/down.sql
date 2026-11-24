-- Undo of 20261120000400_fin_sales. Run the sales triggers down.sql first. DESTROYS all sales data (quotes, invoices, receipts, deposits, credit notes).
-- The journal entries these documents posted stay in the ledger (posted entries are never deleted): reverse them there first if needed.
DROP TABLE IF EXISTS `fin_reminder_log`;
DROP TABLE IF EXISTS `fin_recurring_invoices`;
DROP TABLE IF EXISTS `fin_credit_note_lines`;
DROP TABLE IF EXISTS `fin_credit_notes`;
DROP TABLE IF EXISTS `fin_deposit_applications`;
DROP TABLE IF EXISTS `fin_customer_deposits`;
DROP TABLE IF EXISTS `fin_receipt_allocations`;
DROP TABLE IF EXISTS `fin_receipts`;
DROP TABLE IF EXISTS `fin_invoice_lines`;
DROP TABLE IF EXISTS `fin_invoices`;
DROP TABLE IF EXISTS `fin_quote_lines`;
DROP TABLE IF EXISTS `fin_quotes`;
