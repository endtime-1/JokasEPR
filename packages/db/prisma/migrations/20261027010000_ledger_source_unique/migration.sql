-- Phase 2 of Finance: the general ledger posts automatically from sales, purchasing, payroll and expenses.
-- A business event (an invoice, a payment ...) may produce at most one automatic entry, so a retry can
-- never post twice. Manual entries have no source, and several NULLs never conflict.
CREATE UNIQUE INDEX `JournalEntry_companyId_sourceModule_sourceId_key` ON `JournalEntry`(`companyId`, `sourceModule`, `sourceId`);
