-- Owner request (2026-10-20): jobs are advertised with a flyer image, shown on the public job page.
ALTER TABLE `JobPosting` ADD COLUMN `flyerUrl` VARCHAR(500) NULL;
