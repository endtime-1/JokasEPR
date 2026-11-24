-- Owner request (2026-11-12): a Marketing Ledger. Each marketer plans their week
-- (which customers, which products, how much), and at the end of the week that
-- plan is set against the sales actually recorded so management can see what was
-- planned versus what was sold. One MarketingPlan = one marketer for one
-- Monday-to-Sunday week; its lines are customer + product + planned quantity/price.
--
-- Additive only: two new tables, nothing existing is altered. No FK constraints
-- on the plain id columns, matching FieldVisit/Market; the only constraint is the
-- line -> plan link, with RESTRICT so a plan can never be removed from under its lines.
CREATE TABLE `MarketingPlan` (
  `id`               VARCHAR(191) NOT NULL,
  `companyId`        VARCHAR(191) NOT NULL,
  `branchId`         VARCHAR(191) NULL,
  `marketerId`       VARCHAR(191) NOT NULL,
  `planNumber`       VARCHAR(40) NOT NULL,
  `weekStart`        DATETIME(3) NOT NULL,
  `weekEnd`          DATETIME(3) NOT NULL,
  `status`           ENUM('DRAFT','SUBMITTED','APPROVED','CLOSED') NOT NULL DEFAULT 'DRAFT',
  `notes`            VARCHAR(500) NULL,
  `revision`         INTEGER NOT NULL DEFAULT 0,
  `firstSubmittedAt` DATETIME(3) NULL,
  `submittedAt`      DATETIME(3) NULL,
  `approvedById`     VARCHAR(191) NULL,
  `approvedAt`       DATETIME(3) NULL,
  `returnedById`     VARCHAR(191) NULL,
  `returnedAt`       DATETIME(3) NULL,
  `returnReason`     VARCHAR(300) NULL,
  `closedById`       VARCHAR(191) NULL,
  `closedAt`         DATETIME(3) NULL,
  `closingNote`      VARCHAR(1000) NULL,
  `signedOffById`    VARCHAR(191) NULL,
  `signedOffAt`      DATETIME(3) NULL,
  `signOffNote`      VARCHAR(500) NULL,
  `closeSnapshot`    JSON NULL,
  `createdById`      VARCHAR(191) NULL,
  `updatedById`      VARCHAR(191) NULL,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MarketingPlan_companyId_planNumber_key` (`companyId`, `planNumber`),
  UNIQUE INDEX `MarketingPlan_companyId_marketerId_weekStart_key` (`companyId`, `marketerId`, `weekStart`),
  INDEX `MarketingPlan_companyId_weekStart_idx` (`companyId`, `weekStart`),
  INDEX `MarketingPlan_companyId_status_idx` (`companyId`, `status`),
  INDEX `MarketingPlan_marketerId_idx` (`marketerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MarketingPlanLine` (
  `id`               VARCHAR(191) NOT NULL,
  `companyId`        VARCHAR(191) NOT NULL,
  `planId`           VARCHAR(191) NOT NULL,
  `customerId`       VARCHAR(191) NOT NULL,
  `productId`        VARCHAR(191) NOT NULL,
  `plannedQuantity`  DECIMAL(18,4) NOT NULL,
  `plannedUnitPrice` DECIMAL(18,4) NOT NULL,
  `plannedValue`     DECIMAL(18,4) NOT NULL,
  `note`             VARCHAR(300) NULL,
  `actualQuantity`   DECIMAL(18,4) NULL,
  `actualValue`      DECIMAL(18,4) NULL,
  `missReason`       VARCHAR(300) NULL,
  `createdAt`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MarketingPlanLine_planId_customerId_productId_key` (`planId`, `customerId`, `productId`),
  INDEX `MarketingPlanLine_companyId_idx` (`companyId`),
  INDEX `MarketingPlanLine_planId_idx` (`planId`),
  INDEX `MarketingPlanLine_customerId_idx` (`customerId`),
  INDEX `MarketingPlanLine_productId_idx` (`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MarketingPlanLine`
  ADD CONSTRAINT `MarketingPlanLine_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `MarketingPlan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
