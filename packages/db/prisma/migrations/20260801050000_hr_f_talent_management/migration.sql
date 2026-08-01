-- HR-F: Talent Management — Org Chart, Training Catalog, Certificate Expiry

-- Add managerId to Employee
ALTER TABLE `Employee`
  ADD COLUMN `managerId` VARCHAR(36) NULL AFTER `photoUrl`;

ALTER TABLE `Employee`
  ADD INDEX `Employee_companyId_managerId_idx` (`companyId`, `managerId`);

ALTER TABLE `Employee`
  ADD CONSTRAINT `Employee_managerId_fkey`
  FOREIGN KEY (`managerId`) REFERENCES `Employee`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add certificateExpiry and courseId to TrainingRecord
ALTER TABLE `TrainingRecord`
  ADD COLUMN `courseId` VARCHAR(36) NULL AFTER `employeeId`,
  ADD COLUMN `certificateExpiry` DATETIME(3) NULL AFTER `certificate`;

ALTER TABLE `TrainingRecord`
  ADD INDEX `TrainingRecord_certificateExpiry_idx` (`certificateExpiry`);

-- Create TrainingCourse table
CREATE TABLE `TrainingCourse` (
  `id`            VARCHAR(36)    NOT NULL,
  `companyId`     VARCHAR(36)    NOT NULL,
  `code`          VARCHAR(30)    NOT NULL,
  `title`         VARCHAR(200)   NOT NULL,
  `description`   VARCHAR(500)   NULL,
  `category`      VARCHAR(80)    NULL,
  `durationHours` DECIMAL(5, 1)  NULL,
  `provider`      VARCHAR(120)   NULL,
  `isActive`      TINYINT(1)     NOT NULL DEFAULT 1,
  `createdById`   VARCHAR(36)    NULL,
  `createdAt`     DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3)    NOT NULL,
  `deletedAt`     DATETIME(3)    NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `TrainingCourse_companyId_code_key` (`companyId`, `code`),
  INDEX `TrainingCourse_companyId_idx` (`companyId`),
  INDEX `TrainingCourse_deletedAt_idx` (`deletedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TrainingCourse`
  ADD CONSTRAINT `TrainingCourse_companyId_fkey`
  FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
