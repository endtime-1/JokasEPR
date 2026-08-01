-- HR-G: Recruitment Pipeline, Onboarding, Salary Bands

CREATE TABLE `SalaryBand` (
  `id`             VARCHAR(36)    NOT NULL,
  `companyId`      VARCHAR(36)    NOT NULL,
  `employeeRoleId` VARCHAR(36)    NULL,
  `grade`          VARCHAR(30)    NOT NULL,
  `minSalary`      DECIMAL(15, 2) NOT NULL,
  `midSalary`      DECIMAL(15, 2) NULL,
  `maxSalary`      DECIMAL(15, 2) NOT NULL,
  `currency`       VARCHAR(10)    NOT NULL DEFAULT 'GHS',
  `effectiveDate`  DATETIME(3)    NOT NULL,
  `notes`          VARCHAR(500)   NULL,
  `createdById`    VARCHAR(36)    NULL,
  `createdAt`      DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`      DATETIME(3)    NOT NULL,
  `deletedAt`      DATETIME(3)    NULL,

  PRIMARY KEY (`id`),
  INDEX `SalaryBand_companyId_employeeRoleId_idx` (`companyId`, `employeeRoleId`),
  INDEX `SalaryBand_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SalaryBand`
  ADD CONSTRAINT `SalaryBand_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SalaryBand`
  ADD CONSTRAINT `SalaryBand_employeeRoleId_fkey`
  FOREIGN KEY (`employeeRoleId`) REFERENCES `EmployeeRole`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `JobPosting` (
  `id`           VARCHAR(36)  NOT NULL,
  `companyId`    VARCHAR(36)  NOT NULL,
  `reference`    VARCHAR(30)  NOT NULL,
  `title`        VARCHAR(200) NOT NULL,
  `department`   VARCHAR(120) NULL,
  `branchId`     VARCHAR(36)  NULL,
  `salaryBandId` VARCHAR(36)  NULL,
  `description`  TEXT         NOT NULL,
  `requirements` TEXT         NULL,
  `status`       VARCHAR(30)  NOT NULL DEFAULT 'OPEN',
  `closingDate`  DATETIME(3)  NULL,
  `createdById`  VARCHAR(36)  NULL,
  `updatedById`  VARCHAR(36)  NULL,
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3)  NOT NULL,
  `deletedAt`    DATETIME(3)  NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `JobPosting_companyId_reference_key` (`companyId`, `reference`),
  INDEX `JobPosting_companyId_status_idx` (`companyId`, `status`),
  INDEX `JobPosting_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `JobPosting`
  ADD CONSTRAINT `JobPosting_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `JobApplication` (
  `id`                  VARCHAR(36)   NOT NULL,
  `companyId`           VARCHAR(36)   NOT NULL,
  `jobPostingId`        VARCHAR(36)   NOT NULL,
  `reference`           VARCHAR(30)   NOT NULL,
  `applicantName`       VARCHAR(160)  NOT NULL,
  `applicantEmail`      VARCHAR(160)  NULL,
  `applicantPhone`      VARCHAR(40)   NULL,
  `resumeUrl`           VARCHAR(500)  NULL,
  `coverLetter`         TEXT          NULL,
  `status`              VARCHAR(30)   NOT NULL DEFAULT 'RECEIVED',
  `notes`               VARCHAR(1000) NULL,
  `interviewDate`       DATETIME(3)   NULL,
  `reviewedById`        VARCHAR(36)   NULL,
  `convertedEmployeeId` VARCHAR(36)   NULL,
  `createdById`         VARCHAR(36)   NULL,
  `updatedById`         VARCHAR(36)   NULL,
  `createdAt`           DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`           DATETIME(3)   NOT NULL,
  `deletedAt`           DATETIME(3)   NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `JobApplication_companyId_reference_key` (`companyId`, `reference`),
  INDEX `JobApplication_companyId_jobPostingId_idx` (`companyId`, `jobPostingId`),
  INDEX `JobApplication_companyId_status_idx` (`companyId`, `status`),
  INDEX `JobApplication_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `JobApplication`
  ADD CONSTRAINT `JobApplication_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `JobApplication`
  ADD CONSTRAINT `JobApplication_jobPostingId_fkey`
  FOREIGN KEY (`jobPostingId`) REFERENCES `JobPosting`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `OnboardingChecklist` (
  `id`            VARCHAR(36)  NOT NULL,
  `companyId`     VARCHAR(36)  NOT NULL,
  `employeeId`    VARCHAR(36)  NOT NULL,
  `title`         VARCHAR(200) NOT NULL,
  `dueDate`       DATETIME(3)  NULL,
  `completedAt`   DATETIME(3)  NULL,
  `completedById` VARCHAR(36)  NULL,
  `notes`         VARCHAR(500) NULL,
  `sortOrder`     INT          NOT NULL DEFAULT 0,
  `createdById`   VARCHAR(36)  NULL,
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `OnboardingChecklist_companyId_employeeId_idx` (`companyId`, `employeeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OnboardingChecklist`
  ADD CONSTRAINT `OnboardingChecklist_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OnboardingChecklist`
  ADD CONSTRAINT `OnboardingChecklist_employeeId_fkey`
  FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
