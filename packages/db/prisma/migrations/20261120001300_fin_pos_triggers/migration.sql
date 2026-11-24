-- Finance v2 POS: database-level guarantees. Own migration because creating triggers needs the TRIGGER privilege.
--  * A sale, its lines and payments, and a refund with its lines and payments are permanent: never edited, never deleted.
--    (A mistake is corrected by a refund, which is its own record.)
--  * A till session can only move from OPEN to CLOSED, once; the opening details never change, and a closed session is final.
--  * A session cannot be deleted.
-- Undo: down.sql.

CREATE TRIGGER `fin_pos_sales_bu` BEFORE UPDATE ON `fin_pos_sales` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a POS sale cannot be edited (refund it instead)';
END;

CREATE TRIGGER `fin_pos_sales_bd` BEFORE DELETE ON `fin_pos_sales` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a POS sale cannot be deleted (refund it instead)';
END;

CREATE TRIGGER `fin_pos_sale_lines_bu` BEFORE UPDATE ON `fin_pos_sale_lines` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the lines of a POS sale cannot be edited';
END;

CREATE TRIGGER `fin_pos_sale_lines_bd` BEFORE DELETE ON `fin_pos_sale_lines` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the lines of a POS sale cannot be deleted';
END;

CREATE TRIGGER `fin_pos_payments_bu` BEFORE UPDATE ON `fin_pos_payments` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the payments of a POS sale cannot be edited';
END;

CREATE TRIGGER `fin_pos_payments_bd` BEFORE DELETE ON `fin_pos_payments` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the payments of a POS sale cannot be deleted';
END;

CREATE TRIGGER `fin_pos_refunds_bu` BEFORE UPDATE ON `fin_pos_refunds` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a POS refund cannot be edited';
END;

CREATE TRIGGER `fin_pos_refunds_bd` BEFORE DELETE ON `fin_pos_refunds` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a POS refund cannot be deleted';
END;

CREATE TRIGGER `fin_pos_refund_lines_bu` BEFORE UPDATE ON `fin_pos_refund_lines` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the lines of a POS refund cannot be edited';
END;

CREATE TRIGGER `fin_pos_refund_lines_bd` BEFORE DELETE ON `fin_pos_refund_lines` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the lines of a POS refund cannot be deleted';
END;

CREATE TRIGGER `fin_pos_refund_payments_bu` BEFORE UPDATE ON `fin_pos_refund_payments` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the payments of a POS refund cannot be edited';
END;

CREATE TRIGGER `fin_pos_refund_payments_bd` BEFORE DELETE ON `fin_pos_refund_payments` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the payments of a POS refund cannot be deleted';
END;

CREATE TRIGGER `fin_pos_sessions_bu` BEFORE UPDATE ON `fin_pos_sessions` FOR EACH ROW
BEGIN
  IF OLD.status = 'CLOSED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a closed till session is final';
  END IF;
  IF NOT (NEW.companyId <=> OLD.companyId AND NEW.registerId <=> OLD.registerId AND NEW.number <=> OLD.number
          AND NEW.cashierId <=> OLD.cashierId AND NEW.openedAt <=> OLD.openedAt AND NEW.openingFloat <=> OLD.openingFloat) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the opening details of a till session cannot be changed';
  END IF;
  IF NEW.status = 'CLOSED' AND (NEW.countedCash IS NULL OR NEW.expectedCash IS NULL OR NEW.variance IS NULL OR NEW.closedAt IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a till session closes with a cash count, the expected cash and the variance';
  END IF;
END;

CREATE TRIGGER `fin_pos_sessions_bd` BEFORE DELETE ON `fin_pos_sessions` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: a till session cannot be deleted';
END;
