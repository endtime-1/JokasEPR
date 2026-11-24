-- Finance v2 banking: database-level guarantees.
--  * Direct payments and transfers can only go POSTED -> VOID; nothing else about them can change, and they cannot be deleted.
--  * An online payment that is PAID is final: the database refuses any further change, so a repeated webhook can never post twice.
--  * Statement lines keep their original data forever; only their match status can change, and a MATCHED line must name a ledger line.
--  * Reconciliation history and statement imports are append-only.
--  * Customer deposits now also protect their new source-receipt link.
-- Own migration: creating triggers needs the TRIGGER privilege. The app enforces all of this in code too. Undo: down.sql.

CREATE TRIGGER `fin_payments_bd` BEFORE DELETE ON `fin_payments` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a payment cannot be deleted (void it instead)';
END;

CREATE TRIGGER `fin_payments_bu` BEFORE UPDATE ON `fin_payments` FOR EACH ROW
BEGIN
  IF OLD.status <> 'POSTED' OR NEW.status <> 'VOID'
     OR NOT (NEW.companyId <=> OLD.companyId AND NEW.number <=> OLD.number AND NEW.contactId <=> OLD.contactId
             AND NEW.payeeName <=> OLD.payeeName AND NEW.paymentDate <=> OLD.paymentDate AND NEW.amount <=> OLD.amount
             AND NEW.method <=> OLD.method AND NEW.paidFromAccountId <=> OLD.paidFromAccountId AND NEW.debitAccountId <=> OLD.debitAccountId
             AND NEW.reference <=> OLD.reference AND NEW.notes <=> OLD.notes AND NEW.journalEntryId <=> OLD.journalEntryId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a payment can only be voided, not edited';
  END IF;
END;

CREATE TRIGGER `fin_transfers_bd` BEFORE DELETE ON `fin_transfers` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a transfer cannot be deleted (void it instead)';
END;

CREATE TRIGGER `fin_transfers_bu` BEFORE UPDATE ON `fin_transfers` FOR EACH ROW
BEGIN
  IF OLD.status <> 'POSTED' OR NEW.status <> 'VOID'
     OR NOT (NEW.companyId <=> OLD.companyId AND NEW.number <=> OLD.number AND NEW.transferDate <=> OLD.transferDate
             AND NEW.fromAccountId <=> OLD.fromAccountId AND NEW.toAccountId <=> OLD.toAccountId AND NEW.amount <=> OLD.amount
             AND NEW.chargeAmount <=> OLD.chargeAmount AND NEW.chargeAccountId <=> OLD.chargeAccountId AND NEW.reference <=> OLD.reference
             AND NEW.notes <=> OLD.notes AND NEW.journalEntryId <=> OLD.journalEntryId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a transfer can only be voided, not edited';
  END IF;
END;

CREATE TRIGGER `fin_online_payments_bd` BEFORE DELETE ON `fin_online_payments` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: an online payment record cannot be deleted';
END;

CREATE TRIGGER `fin_online_payments_bu` BEFORE UPDATE ON `fin_online_payments` FOR EACH ROW
BEGIN
  IF OLD.status = 'PAID' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a paid online payment is final and cannot be changed';
  END IF;
  IF NOT (NEW.companyId <=> OLD.companyId AND NEW.provider <=> OLD.provider AND NEW.reference <=> OLD.reference
          AND NEW.invoiceId <=> OLD.invoiceId AND NEW.contactId <=> OLD.contactId AND NEW.amount <=> OLD.amount
          AND NEW.currency <=> OLD.currency) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: an online payment''s reference, invoice and amount cannot be changed';
  END IF;
END;

CREATE TRIGGER `fin_statement_imports_bu` BEFORE UPDATE ON `fin_statement_imports` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: statement imports cannot be edited';
END;

CREATE TRIGGER `fin_statement_imports_bd` BEFORE DELETE ON `fin_statement_imports` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: statement imports cannot be deleted';
END;

CREATE TRIGGER `fin_statement_lines_bd` BEFORE DELETE ON `fin_statement_lines` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: statement lines cannot be deleted';
END;

CREATE TRIGGER `fin_statement_lines_bu` BEFORE UPDATE ON `fin_statement_lines` FOR EACH ROW
BEGIN
  IF NOT (NEW.companyId <=> OLD.companyId AND NEW.paymentAccountId <=> OLD.paymentAccountId AND NEW.importId <=> OLD.importId
          AND NEW.lineNo <=> OLD.lineNo AND NEW.txnDate <=> OLD.txnDate AND NEW.description <=> OLD.description
          AND NEW.reference <=> OLD.reference AND NEW.amount <=> OLD.amount AND NEW.balance <=> OLD.balance
          AND NEW.fingerprint <=> OLD.fingerprint) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a statement line keeps its original data; only its match can change';
  END IF;
  IF NEW.status = 'MATCHED' AND NEW.journalLineId IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a matched statement line must name its ledger line';
  END IF;
  IF NEW.status <> 'MATCHED' AND NEW.journalLineId IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: only a matched statement line can name a ledger line';
  END IF;
END;

CREATE TRIGGER `fin_recon_locks_bu` BEFORE UPDATE ON `fin_recon_locks` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: reconciliation history is append-only';
END;

CREATE TRIGGER `fin_recon_locks_bd` BEFORE DELETE ON `fin_recon_locks` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: reconciliation history is append-only';
END;

-- Deposits: same rule as before, now also protecting the link to the receipt that created the excess.
DROP TRIGGER IF EXISTS `fin_customer_deposits_bu`;

CREATE TRIGGER `fin_customer_deposits_bu` BEFORE UPDATE ON `fin_customer_deposits` FOR EACH ROW
BEGIN
  IF OLD.status = 'VOID' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a void deposit cannot be changed';
  END IF;
  IF NOT (NEW.companyId <=> OLD.companyId AND NEW.number <=> OLD.number AND NEW.contactId <=> OLD.contactId
          AND NEW.depositDate <=> OLD.depositDate AND NEW.amount <=> OLD.amount AND NEW.method <=> OLD.method
          AND NEW.paidToAccountId <=> OLD.paidToAccountId AND NEW.reference <=> OLD.reference AND NEW.notes <=> OLD.notes
          AND NEW.sourceCreditNoteId <=> OLD.sourceCreditNoteId AND NEW.sourceReceiptId <=> OLD.sourceReceiptId
          AND NEW.journalEntryId <=> OLD.journalEntryId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a deposit can only be applied or voided, not edited';
  END IF;
  IF NEW.status = 'VOID' AND NEW.appliedAmount <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a deposit that has been applied to invoices cannot be voided';
  END IF;
END;
