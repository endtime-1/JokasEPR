-- AddColumn: Employee.userId (nullable FK to User)
ALTER TABLE `Employee` ADD COLUMN `userId` VARCHAR(191) NULL;

-- Populate userId for existing employees by matching on email within the same company.
-- Employees whose email matches exactly one User in the same company get linked automatically.
-- Employees with no matching user, or ambiguous matches, are left as NULL and can be
-- linked manually via the Identity UI.
UPDATE `Employee` e
JOIN `User` u ON u.email = e.email AND u.companyId = e.companyId AND u.deletedAt IS NULL
SET e.userId = u.id
WHERE e.userId IS NULL AND e.email IS NOT NULL AND e.deletedAt IS NULL;

-- Unique constraint: one Employee per User
CREATE UNIQUE INDEX `Employee_userId_key` ON `Employee`(`userId`);

-- Foreign key to User
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
