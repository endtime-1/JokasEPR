-- HR-E: Geolocation + Finance Integrations
-- Add geolocation columns to AttendanceRecord
ALTER TABLE `AttendanceRecord`
  ADD COLUMN `geoLat` DECIMAL(10, 7) NULL AFTER `overtimeHours`,
  ADD COLUMN `geoLon` DECIMAL(10, 7) NULL AFTER `geoLat`;
