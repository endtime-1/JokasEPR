-- Repair Notification enum drift left by the VPS cutover.
--
-- During the Hostinger -> VPS migration, 20260801030000_hr_d_disciplinary_grievance
-- was marked `--applied` without its SQL running (prisma migrate deploy kept
-- re-picking it up after a rollback). Its DisciplinaryRecord / GrievanceRecord
-- tables were recreated by a recovery migration, but the ALTER that widens the
-- NotificationType enum was not — so on the VPS `Notification.type` and
-- `NotificationPreference.notificationType` are still the pre-HR-D 13-value enum.
--
-- Hostinger's lenient sql_mode silently stored an empty string for an unknown
-- enum value; MariaDB strict mode on the VPS raises "Data truncated for column
-- 'type'", which broke every LEAVE_*/PAYROLL_*/DOCUMENT_EXPIRY_ALERT/
-- DISCIPLINARY_ISSUED/GRIEVANCE_UPDATED notification (the asset-document expiry
-- cron has failed daily since 2026-08-29).
--
-- MODIFY to a superset enum is safe and idempotent — no existing row changes.

ALTER TABLE `Notification`
  MODIFY COLUMN `type` ENUM(
    'LOW_STOCK_ALERT','EXPIRY_ALERT','VACCINATION_REMINDER','MEDICATION_REMINDER',
    'PRODUCTION_ORDER_COMPLETED','PURCHASE_APPROVAL_NEEDED','CUSTOMER_PAYMENT_OVERDUE',
    'SUPPLIER_PAYMENT_DUE','MACHINE_MAINTENANCE_DUE','AI_RISK_ALERT','TASK_ASSIGNED',
    'QUALITY_BATCH_REJECTED','STOCK_TRANSFER_REQUEST',
    'LEAVE_REQUEST_SUBMITTED','LEAVE_APPROVED','LEAVE_REJECTED',
    'PAYROLL_APPROVED','PAYROLL_PAID','DOCUMENT_EXPIRY_ALERT',
    'DISCIPLINARY_ISSUED','GRIEVANCE_UPDATED'
  ) NOT NULL;

ALTER TABLE `NotificationPreference`
  MODIFY COLUMN `notificationType` ENUM(
    'LOW_STOCK_ALERT','EXPIRY_ALERT','VACCINATION_REMINDER','MEDICATION_REMINDER',
    'PRODUCTION_ORDER_COMPLETED','PURCHASE_APPROVAL_NEEDED','CUSTOMER_PAYMENT_OVERDUE',
    'SUPPLIER_PAYMENT_DUE','MACHINE_MAINTENANCE_DUE','AI_RISK_ALERT','TASK_ASSIGNED',
    'QUALITY_BATCH_REJECTED','STOCK_TRANSFER_REQUEST',
    'LEAVE_REQUEST_SUBMITTED','LEAVE_APPROVED','LEAVE_REJECTED',
    'PAYROLL_APPROVED','PAYROLL_PAID','DOCUMENT_EXPIRY_ALERT',
    'DISCIPLINARY_ISSUED','GRIEVANCE_UPDATED'
  ) NOT NULL;
