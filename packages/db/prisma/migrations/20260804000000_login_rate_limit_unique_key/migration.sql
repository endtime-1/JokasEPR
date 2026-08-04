-- Replace compound (key, windowEnd) index with a UNIQUE constraint on key.
-- This allows the guard to use upsert (INSERT ... ON DUPLICATE KEY UPDATE)
-- which eliminates the read-then-write race condition under concurrent logins.
-- Existing rows are cleared first to avoid constraint violations from any duplicates.

TRUNCATE TABLE `LoginRateLimit`;

DROP INDEX `LoginRateLimit_key_windowEnd_idx` ON `LoginRateLimit`;

CREATE UNIQUE INDEX `LoginRateLimit_key_key` ON `LoginRateLimit`(`key`);
