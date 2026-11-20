-- Finance v2 sales: the database itself keeps issued documents unchangeable and their balances consistent.
--  * An invoice is editable only while DRAFT. Once SENT, only its payment counters, status (to VOID) and link switches can change,
--    and the balance must always equal total - paid - credited, never negative. A sent invoice cannot be deleted.
--  * Receipts, deposits and credit notes can only go POSTED -> VOID; their lines and allocations can never change.
-- Own migration: creating triggers needs the TRIGGER privilege. The app enforces all of this in code too. Undo: down.sql.

CREATE TRIGGER `fin_invoice_lines_bi` BEFORE INSERT ON `fin_invoice_lines` FOR EACH ROW
BEGIN
  DECLARE s VARCHAR(10);
  SELECT `status` INTO s FROM `fin_invoices` WHERE `id` = NEW.invoiceId;
  IF s IS NULL OR s <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: lines can only be added to a draft invoice';
  END IF;
END;

CREATE TRIGGER `fin_invoice_lines_bu` BEFORE UPDATE ON `fin_invoice_lines` FOR EACH ROW
BEGIN
  DECLARE s VARCHAR(10);
  SELECT `status` INTO s FROM `fin_invoices` WHERE `id` = OLD.invoiceId;
  IF s <> 'DRAFT' OR NEW.invoiceId <> OLD.invoiceId THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the lines of an issued invoice cannot be edited (issue a credit note)';
  END IF;
END;

CREATE TRIGGER `fin_invoice_lines_bd` BEFORE DELETE ON `fin_invoice_lines` FOR EACH ROW
BEGIN
  DECLARE s VARCHAR(10);
  SELECT `status` INTO s FROM `fin_invoices` WHERE `id` = OLD.invoiceId;
  IF s <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the lines of an issued invoice cannot be deleted (issue a credit note)';
  END IF;
END;

CREATE TRIGGER `fin_invoices_bd` BEFORE DELETE ON `fin_invoices` FOR EACH ROW
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: an issued invoice cannot be deleted (void it instead)';
  END IF;
END;

CREATE TRIGGER `fin_invoices_bu` BEFORE UPDATE ON `fin_invoices` FOR EACH ROW
BEGIN
  IF OLD.status = 'VOID' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a void invoice cannot be changed';
  ELSEIF OLD.status = 'DRAFT' THEN
    IF NEW.status = 'VOID' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a draft invoice is deleted, not voided';
    ELSEIF NEW.status = 'SENT' THEN
      IF NEW.number IS NULL OR NEW.journalEntryId IS NULL OR NEW.total <= 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: an invoice needs a number, a ledger entry and a total above zero to be issued';
      END IF;
      IF NEW.balanceDue <> NEW.total - NEW.paidAmount - NEW.creditedAmount THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: invoice balance does not match total, paid and credited';
      END IF;
    END IF;
  ELSE
    -- OLD.status = 'SENT': everything printed on the invoice is frozen.
    IF NOT (NEW.companyId <=> OLD.companyId AND NEW.number <=> OLD.number AND NEW.contactId <=> OLD.contactId
            AND NEW.quoteId <=> OLD.quoteId AND NEW.recurringId <=> OLD.recurringId AND NEW.recurringRunDate <=> OLD.recurringRunDate
            AND NEW.issueDate <=> OLD.issueDate AND NEW.dueDate <=> OLD.dueDate AND NEW.currency <=> OLD.currency
            AND NEW.subtotal <=> OLD.subtotal AND NEW.discountTotal <=> OLD.discountTotal AND NEW.taxTotal <=> OLD.taxTotal
            AND NEW.total <=> OLD.total AND NEW.notes <=> OLD.notes AND NEW.terms <=> OLD.terms AND NEW.sentAt <=> OLD.sentAt
            AND NEW.journalEntryId <=> OLD.journalEntryId AND NEW.createdById <=> OLD.createdById) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: an issued invoice cannot be edited (void it or issue a credit note)';
    END IF;
    IF NEW.status = 'SENT' THEN
      IF NEW.balanceDue <> NEW.total - NEW.paidAmount - NEW.creditedAmount OR NEW.balanceDue < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: invoice balance does not match total, paid and credited (or would go negative)';
      END IF;
    ELSEIF NEW.status = 'VOID' THEN
      IF NEW.paidAmount <> 0 OR NEW.creditedAmount <> 0 OR NEW.balanceDue <> 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: an invoice with payments or credit notes cannot be voided';
      END IF;
    END IF;
  END IF;
END;

CREATE TRIGGER `fin_receipts_bd` BEFORE DELETE ON `fin_receipts` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a receipt cannot be deleted (void it instead)';
END;

CREATE TRIGGER `fin_receipts_bu` BEFORE UPDATE ON `fin_receipts` FOR EACH ROW
BEGIN
  IF OLD.status <> 'POSTED' OR NEW.status <> 'VOID'
     OR NOT (NEW.companyId <=> OLD.companyId AND NEW.number <=> OLD.number AND NEW.contactId <=> OLD.contactId
             AND NEW.receiptDate <=> OLD.receiptDate AND NEW.amount <=> OLD.amount AND NEW.method <=> OLD.method
             AND NEW.paidToAccountId <=> OLD.paidToAccountId AND NEW.reference <=> OLD.reference AND NEW.notes <=> OLD.notes
             AND NEW.journalEntryId <=> OLD.journalEntryId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a receipt can only be voided, not edited';
  END IF;
END;

CREATE TRIGGER `fin_receipt_allocations_bu` BEFORE UPDATE ON `fin_receipt_allocations` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: receipt allocations cannot be edited';
END;

CREATE TRIGGER `fin_receipt_allocations_bd` BEFORE DELETE ON `fin_receipt_allocations` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: receipt allocations cannot be deleted';
END;

CREATE TRIGGER `fin_customer_deposits_bd` BEFORE DELETE ON `fin_customer_deposits` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a deposit cannot be deleted (void it instead)';
END;

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

CREATE TRIGGER `fin_deposit_applications_bu` BEFORE UPDATE ON `fin_deposit_applications` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: deposit applications cannot be edited';
END;

CREATE TRIGGER `fin_deposit_applications_bd` BEFORE DELETE ON `fin_deposit_applications` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: deposit applications cannot be deleted';
END;

CREATE TRIGGER `fin_credit_notes_bd` BEFORE DELETE ON `fin_credit_notes` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a credit note cannot be deleted (void it instead)';
END;

CREATE TRIGGER `fin_credit_notes_bu` BEFORE UPDATE ON `fin_credit_notes` FOR EACH ROW
BEGIN
  IF OLD.status <> 'POSTED' OR NEW.status <> 'VOID'
     OR NOT (NEW.companyId <=> OLD.companyId AND NEW.number <=> OLD.number AND NEW.invoiceId <=> OLD.invoiceId
             AND NEW.contactId <=> OLD.contactId AND NEW.creditDate <=> OLD.creditDate AND NEW.reason <=> OLD.reason
             AND NEW.subtotal <=> OLD.subtotal AND NEW.discountTotal <=> OLD.discountTotal AND NEW.taxTotal <=> OLD.taxTotal
             AND NEW.total <=> OLD.total AND NEW.appliedToInvoice <=> OLD.appliedToInvoice AND NEW.excessToDeposit <=> OLD.excessToDeposit
             AND NEW.journalEntryId <=> OLD.journalEntryId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a credit note can only be voided, not edited';
  END IF;
END;

CREATE TRIGGER `fin_credit_note_lines_bu` BEFORE UPDATE ON `fin_credit_note_lines` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: credit note lines cannot be edited';
END;

CREATE TRIGGER `fin_credit_note_lines_bd` BEFORE DELETE ON `fin_credit_note_lines` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: credit note lines cannot be deleted';
END;
