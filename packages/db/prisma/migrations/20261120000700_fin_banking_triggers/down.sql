-- Undo of 20261120000700_fin_banking_triggers. Restores the deposit trigger exactly as it was in 20261120000500_fin_sales_triggers.
DROP TRIGGER IF EXISTS `fin_recon_locks_bd`;
DROP TRIGGER IF EXISTS `fin_recon_locks_bu`;
DROP TRIGGER IF EXISTS `fin_statement_lines_bu`;
DROP TRIGGER IF EXISTS `fin_statement_lines_bd`;
DROP TRIGGER IF EXISTS `fin_statement_imports_bd`;
DROP TRIGGER IF EXISTS `fin_statement_imports_bu`;
DROP TRIGGER IF EXISTS `fin_online_payments_bu`;
DROP TRIGGER IF EXISTS `fin_online_payments_bd`;
DROP TRIGGER IF EXISTS `fin_transfers_bu`;
DROP TRIGGER IF EXISTS `fin_transfers_bd`;
DROP TRIGGER IF EXISTS `fin_payments_bu`;
DROP TRIGGER IF EXISTS `fin_payments_bd`;
DROP TRIGGER IF EXISTS `fin_customer_deposits_bu`;

CREATE TRIGGER `fin_customer_deposits_bu` BEFORE UPDATE ON `fin_customer_deposits` FOR EACH ROW
BEGIN
  IF OLD.status = 'VOID' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a void deposit cannot be changed';
  END IF;
  IF NOT (NEW.companyId <=> OLD.companyId AND NEW.number <=> OLD.number AND NEW.contactId <=> OLD.contactId
          AND NEW.depositDate <=> OLD.depositDate AND NEW.amount <=> OLD.amount AND NEW.method <=> OLD.method
          AND NEW.paidToAccountId <=> OLD.paidToAccountId AND NEW.reference <=> OLD.reference AND NEW.notes <=> OLD.notes
          AND NEW.sourceCreditNoteId <=> OLD.sourceCreditNoteId AND NEW.journalEntryId <=> OLD.journalEntryId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a deposit can only be applied or voided, not edited';
  END IF;
  IF NEW.status = 'VOID' AND NEW.appliedAmount <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a deposit that has been applied to invoices cannot be voided';
  END IF;
END;
