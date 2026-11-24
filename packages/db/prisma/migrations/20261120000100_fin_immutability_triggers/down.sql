-- Undo of 20261120000100_fin_immutability_triggers.
DROP TRIGGER IF EXISTS `fin_journal_lines_bd`;
DROP TRIGGER IF EXISTS `fin_journal_lines_bu`;
DROP TRIGGER IF EXISTS `fin_journal_lines_bi`;
DROP TRIGGER IF EXISTS `fin_journal_entries_bd`;
DROP TRIGGER IF EXISTS `fin_journal_entries_bu`;
DROP TRIGGER IF EXISTS `fin_period_locks_bd`;
DROP TRIGGER IF EXISTS `fin_period_locks_bu`;
DROP TRIGGER IF EXISTS `fin_audit_logs_bd`;
DROP TRIGGER IF EXISTS `fin_audit_logs_bu`;
