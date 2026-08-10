-- A storefront checkout retry after a dropped response (timeout, connection
-- reset — the browser never learned whether the first attempt landed) had no
-- way to avoid placing a second real order for the same checkout. Adding a
-- nullable column with a unique (companyId, key) index lets the service
-- detect a resend and return the original order instead of creating a
-- duplicate. NULL is allowed and repeats freely (MySQL unique indexes treat
-- each NULL as distinct), so existing rows and admin/counter-created orders
-- (which never pass a key) are unaffected.

ALTER TABLE `SalesOrder` ADD COLUMN `idempotencyKey` VARCHAR(100) NULL;

CREATE UNIQUE INDEX `SalesOrder_companyId_idempotencyKey_key` ON `SalesOrder`(`companyId`, `idempotencyKey`);
