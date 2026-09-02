-- Proforma / quotation: a document sent to a customer before an order is
-- confirmed. Reserves no stock, touches no ledger; converts into a real
-- SalesOrder on acceptance.

CREATE TABLE `SalesQuote` (
  `id`             VARCHAR(191) NOT NULL,
  `companyId`      VARCHAR(191) NOT NULL,
  `branchId`       VARCHAR(191) NOT NULL,
  `customerId`     VARCHAR(191) NOT NULL,
  `quoteNumber`    VARCHAR(191) NOT NULL,
  `quoteDate`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `validUntil`     DATETIME(3) NULL,
  `status`         ENUM('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','CONVERTED') NOT NULL DEFAULT 'DRAFT',
  `subtotal`       DECIMAL(18,4) NOT NULL DEFAULT 0,
  `discountAmount` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `taxAmount`      DECIMAL(18,4) NOT NULL DEFAULT 0,
  `totalAmount`    DECIMAL(18,4) NOT NULL DEFAULT 0,
  `notes`          VARCHAR(191) NULL,
  `salesOrderId`   VARCHAR(191) NULL,
  `sentAt`         DATETIME(3) NULL,
  `decidedAt`      DATETIME(3) NULL,
  `createdById`    VARCHAR(191) NULL,
  `updatedById`    VARCHAR(191) NULL,
  `createdAt`      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3) NOT NULL,
  `deletedAt`      DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SalesQuote_companyId_quoteNumber_key` (`companyId`, `quoteNumber`),
  INDEX `SalesQuote_companyId_idx` (`companyId`),
  INDEX `SalesQuote_companyId_status_idx` (`companyId`, `status`),
  INDEX `SalesQuote_customerId_idx` (`customerId`),
  INDEX `SalesQuote_salesOrderId_idx` (`salesOrderId`),
  INDEX `SalesQuote_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SalesQuoteItem` (
  `id`             VARCHAR(191) NOT NULL,
  `companyId`      VARCHAR(191) NOT NULL,
  `salesQuoteId`   VARCHAR(191) NOT NULL,
  `productId`      VARCHAR(191) NOT NULL,
  `quantity`       DECIMAL(18,4) NOT NULL,
  `unitPrice`      DECIMAL(18,4) NOT NULL,
  `discountAmount` DECIMAL(18,4) NOT NULL DEFAULT 0,
  `lineTotal`      DECIMAL(18,4) NOT NULL,
  `sequence`       INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  INDEX `SalesQuoteItem_companyId_idx` (`companyId`),
  INDEX `SalesQuoteItem_salesQuoteId_idx` (`salesQuoteId`),
  INDEX `SalesQuoteItem_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SalesQuote`
  ADD CONSTRAINT `SalesQuote_companyId_fkey`  FOREIGN KEY (`companyId`)  REFERENCES `Company`(`id`)  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `SalesQuote_branchId_fkey`   FOREIGN KEY (`branchId`)   REFERENCES `Branch`(`id`)   ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `SalesQuote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SalesQuoteItem`
  ADD CONSTRAINT `SalesQuoteItem_companyId_fkey`    FOREIGN KEY (`companyId`)    REFERENCES `Company`(`id`)    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `SalesQuoteItem_salesQuoteId_fkey` FOREIGN KEY (`salesQuoteId`) REFERENCES `SalesQuote`(`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  ADD CONSTRAINT `SalesQuoteItem_productId_fkey`    FOREIGN KEY (`productId`)    REFERENCES `Product`(`id`)    ON DELETE RESTRICT ON UPDATE CASCADE;
