-- Undo of 20261120000200_fin_contacts_tax. Run the tax triggers down.sql first. DESTROYS contacts, tax codes and rates.
DROP TABLE IF EXISTS `fin_tax_rates`;
DROP TABLE IF EXISTS `fin_tax_codes`;
DROP TABLE IF EXISTS `fin_import_batches`;
DROP TABLE IF EXISTS `fin_contacts`;
