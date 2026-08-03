-- HR-H: Enterprise Features — Peer Reviews, Approval Chains, Compliance Reports

CREATE TABLE `PerformancePeerReview` (
  `id`                 VARCHAR(36)   NOT NULL,
  `companyId`          VARCHAR(36)   NOT NULL,
  `performanceId`      VARCHAR(36)   NOT NULL,
  `reviewerEmployeeId` VARCHAR(36)   NOT NULL,
  `relationship`       VARCHAR(30)   NOT NULL,
  `overallRating`      ENUM('EXCEEDS_EXPECTATIONS','MEETS_EXPECTATIONS','NEEDS_IMPROVEMENT','UNSATISFACTORY') NOT NULL DEFAULT 'MEETS_EXPECTATIONS',
  `comments`           VARCHAR(1000) NULL,
  `submittedAt`        DATETIME(3)   NULL,
  `createdAt`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`          DATETIME(3)   NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `PeerReview_company_perf_reviewer_key` (`companyId`, `performanceId`, `reviewerEmployeeId`),
  INDEX `PerformancePeerReview_companyId_performanceId_idx` (`companyId`, `performanceId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PerformancePeerReview`
  ADD CONSTRAINT `PerformancePeerReview_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PerformancePeerReview`
  ADD CONSTRAINT `PerformancePeerReview_performanceId_fkey`
  FOREIGN KEY (`performanceId`) REFERENCES `HRPerformanceRecord`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ApprovalChain` (
  `id`          VARCHAR(36)    NOT NULL,
  `companyId`   VARCHAR(36)    NOT NULL,
  `entityType`  VARCHAR(60)    NOT NULL,
  `minAmount`   DECIMAL(15, 2) NULL,
  `steps`       JSON           NOT NULL,
  `isActive`    TINYINT(1)     NOT NULL DEFAULT 1,
  `createdById` VARCHAR(36)    NULL,
  `createdAt`   DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3)    NOT NULL,
  `deletedAt`   DATETIME(3)    NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `ApprovalChain_companyId_entityType_key` (`companyId`, `entityType`),
  INDEX `ApprovalChain_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ApprovalChain`
  ADD CONSTRAINT `ApprovalChain_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ComplianceReport` (
  `id`            VARCHAR(36)  NOT NULL,
  `companyId`     VARCHAR(36)  NOT NULL,
  `reportType`    VARCHAR(60)  NOT NULL,
  `period`        VARCHAR(10)  NOT NULL,
  `fileUrl`       VARCHAR(500) NULL,
  `data`          JSON         NULL,
  `generatedById` VARCHAR(36)  NULL,
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `ComplianceReport_companyId_reportType_period_idx` (`companyId`, `reportType`, `period`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ComplianceReport`
  ADD CONSTRAINT `ComplianceReport_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
