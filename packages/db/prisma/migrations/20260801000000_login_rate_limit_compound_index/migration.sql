-- Replace the single-column key index with a compound (key, windowEnd) index.
-- The hot query in LoginRateLimitGuard is:
--   WHERE key = ? AND windowEnd > NOW()
-- A compound index covers both predicates in one range scan instead of
-- an index seek on key followed by an in-memory filter on windowEnd.
DROP INDEX `LoginRateLimit_key_idx` ON `LoginRateLimit`;
CREATE INDEX `LoginRateLimit_key_windowEnd_idx` ON `LoginRateLimit`(`key`, `windowEnd`);
