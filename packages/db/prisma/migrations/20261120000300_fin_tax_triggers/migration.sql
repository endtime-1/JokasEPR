-- Finance v2: a tax rate, once recorded, can never be edited or deleted (a new rate with a later date replaces it),
-- and the CSV import log is append-only. Own migration: creating triggers needs the TRIGGER privilege.

CREATE TRIGGER `fin_tax_rates_bu` BEFORE UPDATE ON `fin_tax_rates` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: tax rate history is append-only (add a new rate instead)';
END;

CREATE TRIGGER `fin_tax_rates_bd` BEFORE DELETE ON `fin_tax_rates` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: tax rate history is append-only (add a new rate instead)';
END;

CREATE TRIGGER `fin_import_batches_bu` BEFORE UPDATE ON `fin_import_batches` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the import log is append-only';
END;

CREATE TRIGGER `fin_import_batches_bd` BEFORE DELETE ON `fin_import_batches` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fin: the import log is append-only';
END;
