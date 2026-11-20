-- Finance v2: the database itself refuses to edit or delete posted books.
--  * fin_audit_logs and fin_period_locks are append-only.
--  * A journal entry may only go DRAFT -> POSTED (and only if its lines balance), then POSTED -> REVERSED
--    (nothing else about it may change). Posted/reversed entries and their lines can never be deleted or edited.
-- Kept in its own migration: creating triggers needs the TRIGGER privilege (and, when binary logging is on,
-- log_bin_trust_function_creators=1). The app also enforces all of this in code. Undo: down.sql.

CREATE TRIGGER `fin_audit_logs_bu` BEFORE UPDATE ON `fin_audit_logs` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the audit log is append-only';
END;

CREATE TRIGGER `fin_audit_logs_bd` BEFORE DELETE ON `fin_audit_logs` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the audit log is append-only';
END;

CREATE TRIGGER `fin_period_locks_bu` BEFORE UPDATE ON `fin_period_locks` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: period lock history is append-only';
END;

CREATE TRIGGER `fin_period_locks_bd` BEFORE DELETE ON `fin_period_locks` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: period lock history is append-only';
END;

CREATE TRIGGER `fin_journal_entries_bu` BEFORE UPDATE ON `fin_journal_entries` FOR EACH ROW
BEGIN
  DECLARE n INT;
  DECLARE d DECIMAL(15,2);
  DECLARE c DECIMAL(15,2);
  IF OLD.status = 'DRAFT' THEN
    IF NEW.status = 'POSTED' THEN
      SELECT COUNT(*), COALESCE(SUM(`debit`), 0), COALESCE(SUM(`credit`), 0) INTO n, d, c
        FROM `fin_journal_lines` WHERE `journalEntryId` = OLD.id;
      IF n < 2 OR d <> c OR d = 0 OR d <> NEW.totalDebit OR c <> NEW.totalCredit THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a journal entry must balance (debits = credits, 2+ lines) to be posted';
      END IF;
    ELSEIF NEW.status <> 'DRAFT' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a draft journal entry can only be posted';
    END IF;
  ELSEIF OLD.status = 'POSTED' AND NEW.status = 'REVERSED' THEN
    IF NOT (NEW.companyId <=> OLD.companyId AND NEW.reference <=> OLD.reference AND NEW.entryDate <=> OLD.entryDate
            AND NEW.description <=> OLD.description AND NEW.type <=> OLD.type AND NEW.totalDebit <=> OLD.totalDebit
            AND NEW.totalCredit <=> OLD.totalCredit AND NEW.sourceModule <=> OLD.sourceModule AND NEW.sourceId <=> OLD.sourceId
            AND NEW.reversalOf <=> OLD.reversalOf AND NEW.notes <=> OLD.notes AND NEW.postedById <=> OLD.postedById
            AND NEW.postedAt <=> OLD.postedAt) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a posted journal entry can only be marked reversed, not edited';
    END IF;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: posted journal entries cannot be edited (post a reversing entry)';
  END IF;
END;

CREATE TRIGGER `fin_journal_entries_bd` BEFORE DELETE ON `fin_journal_entries` FOR EACH ROW
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: posted journal entries cannot be deleted (post a reversing entry)';
  END IF;
END;

CREATE TRIGGER `fin_journal_lines_bi` BEFORE INSERT ON `fin_journal_lines` FOR EACH ROW
BEGIN
  DECLARE s VARCHAR(10);
  SELECT `status` INTO s FROM `fin_journal_entries` WHERE `id` = NEW.journalEntryId;
  IF s IS NULL OR s <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: lines can only be added to a draft journal entry';
  END IF;
END;

CREATE TRIGGER `fin_journal_lines_bu` BEFORE UPDATE ON `fin_journal_lines` FOR EACH ROW
BEGIN
  DECLARE s VARCHAR(10);
  SELECT `status` INTO s FROM `fin_journal_entries` WHERE `id` = OLD.journalEntryId;
  IF s <> 'DRAFT' OR NEW.journalEntryId <> OLD.journalEntryId THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: lines of a posted journal entry cannot be edited';
  END IF;
END;

CREATE TRIGGER `fin_journal_lines_bd` BEFORE DELETE ON `fin_journal_lines` FOR EACH ROW
BEGIN
  DECLARE s VARCHAR(10);
  SELECT `status` INTO s FROM `fin_journal_entries` WHERE `id` = OLD.journalEntryId;
  IF s <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: lines of a posted journal entry cannot be deleted';
  END IF;
END;
