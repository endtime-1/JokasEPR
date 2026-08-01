-- HR-B: Payroll Intelligence
-- Add overtime hours to AttendanceRecord
ALTER TABLE `AttendanceRecord`
  ADD COLUMN `overtimeHours` DECIMAL(5, 2) NULL AFTER `hoursWorked`;

-- Add employer contribution + overtime fields to PayrollRecord
ALTER TABLE `PayrollRecord`
  ADD COLUMN `employerSsnit`      DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER `ssnit`,
  ADD COLUMN `pensionTier2`       DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER `employerSsnit`,
  ADD COLUMN `pensionTier3`       DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER `pensionTier2`,
  ADD COLUMN `overtimePay`        DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER `pensionTier3`,
  ADD COLUMN `allowanceBreakdown` JSON           NULL      AFTER `overtimePay`;
