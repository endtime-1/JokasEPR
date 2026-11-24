-- Undo of 20261120000000_fin_foundation. Run the triggers down.sql first. DESTROYS all fin_* data.
DROP TABLE IF EXISTS `fin_journal_lines`;
DROP TABLE IF EXISTS `fin_journal_entries`;
DROP TABLE IF EXISTS `fin_period_locks`;
DROP TABLE IF EXISTS `fin_accounts`;
DROP TABLE IF EXISTS `fin_number_sequences`;
DROP TABLE IF EXISTS `fin_settings`;
DROP TABLE IF EXISTS `fin_audit_logs`;
