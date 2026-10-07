-- Owner request (2026-10-02): the Disciplinary "Action Taken" box stopped at
-- 500 characters. Every free-text HR narrative field had the same kind of
-- cap, so they are all widened together to TEXT (the API now allows 5000).
ALTER TABLE `PayrollRecord` MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `Employee` MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `TrainingCourse` MODIFY COLUMN `description` TEXT NULL;
ALTER TABLE `TrainingRecord` MODIFY COLUMN `description` TEXT NULL, MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `HRPerformanceRecord` MODIFY COLUMN `comments` TEXT NULL, MODIFY COLUMN `goals` TEXT NULL;
ALTER TABLE `DisciplinaryRecord` MODIFY COLUMN `description` TEXT NOT NULL, MODIFY COLUMN `actionTaken` TEXT NOT NULL, MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `GrievanceRecord` MODIFY COLUMN `description` TEXT NOT NULL, MODIFY COLUMN `resolution` TEXT NULL;
ALTER TABLE `SalaryBand` MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `JobApplication` MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `OnboardingChecklist` MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `PerformancePeerReview` MODIFY COLUMN `comments` TEXT NULL;
ALTER TABLE `EmployeeDocument` MODIFY COLUMN `notes` TEXT NULL;
ALTER TABLE `LeaveRequest` MODIFY COLUMN `reason` TEXT NULL, MODIFY COLUMN `reviewNote` TEXT NULL;
