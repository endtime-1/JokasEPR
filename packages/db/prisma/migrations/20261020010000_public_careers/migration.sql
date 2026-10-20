-- Owner request (2026-10-20): jobs are applied for through a public link on
-- akokofeeds.com, so applications carry the standard application details and
-- postings carry a location / employment type for the public page.
ALTER TABLE `JobPosting`
  ADD COLUMN `location` VARCHAR(160) NULL,
  ADD COLUMN `employmentType` VARCHAR(40) NULL;

ALTER TABLE `JobApplication`
  ADD COLUMN `gender` VARCHAR(20) NULL,
  ADD COLUMN `dateOfBirth` DATETIME(3) NULL,
  ADD COLUMN `address` VARCHAR(300) NULL,
  ADD COLUMN `education` VARCHAR(120) NULL,
  ADD COLUMN `yearsExperience` INTEGER NULL,
  ADD COLUMN `currentEmployer` VARCHAR(160) NULL,
  ADD COLUMN `expectedSalary` VARCHAR(60) NULL,
  ADD COLUMN `availability` VARCHAR(120) NULL,
  ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'STAFF';
