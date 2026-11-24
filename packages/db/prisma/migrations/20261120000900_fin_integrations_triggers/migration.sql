-- Finance v2 links: database-level guarantees. Own migration because creating triggers needs the TRIGGER privilege.
--  * Once an invoice exists, the source it came from (externalRef, label, source total) can never be changed or removed.
--  * The log of what the links did is never deleted.
-- This is a separate trigger from fin_invoices_bu, so the invoice rules from the sales migration are untouched. Undo: down.sql.

CREATE TRIGGER `fin_invoices_bu_src` BEFORE UPDATE ON `fin_invoices` FOR EACH ROW
BEGIN
  IF NOT (NEW.externalRef <=> OLD.externalRef AND NEW.sourceLabel <=> OLD.sourceLabel AND NEW.sourceTotal <=> OLD.sourceTotal) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the source an invoice came from cannot be changed';
  END IF;
END;

CREATE TRIGGER `fin_integration_log_bd` BEFORE DELETE ON `fin_integration_log` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the link log cannot be deleted';
END;
