-- Undo 20261120000800_fin_integrations (run after the triggers' down.sql). Deletes the link settings and log.
DROP INDEX `fin_invoices_companyId_externalRef_key` ON `fin_invoices`;
DROP TABLE IF EXISTS `fin_integration_log`;
DROP TABLE IF EXISTS `fin_integration_settings`;
ALTER TABLE `fin_invoices` DROP COLUMN `externalRef`, DROP COLUMN `sourceLabel`, DROP COLUMN `sourceTotal`;
