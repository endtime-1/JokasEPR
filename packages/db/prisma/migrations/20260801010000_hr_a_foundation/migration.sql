-- HR-A Foundation: LeavePolicy, LeaveBalance, PublicHoliday, EmployeeDocument

CREATE TABLE IF NOT EXISTS `LeavePolicy` (
    `id`             VARCHAR(36)  NOT NULL,
    `companyId`      VARCHAR(36)  NOT NULL,
    `name`           VARCHAR(120) NOT NULL,
    `leaveType`      ENUM('ANNUAL','SICK','MATERNITY','PATERNITY','COMPASSIONATE','UNPAID') NOT NULL,
    `daysPerYear`    INTEGER      NOT NULL,
    `carryOverDays`  INTEGER      NOT NULL DEFAULT 0,
    `employeeRoleId` VARCHAR(36)  NULL,
    `isActive`       TINYINT(1)   NOT NULL DEFAULT 1,
    `createdById`    VARCHAR(36)  NULL,
    `updatedById`    VARCHAR(36)  NULL,
    `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt`      DATETIME(3)  NULL,

    UNIQUE INDEX `LeavePolicy_companyId_leaveType_employeeRoleId_key`(`companyId`, `leaveType`, `employeeRoleId`),
    INDEX `LeavePolicy_companyId_idx`(`companyId`),
    INDEX `LeavePolicy_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LeavePolicy`
    ADD CONSTRAINT `LeavePolicy_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LeavePolicy`
    ADD CONSTRAINT `LeavePolicy_employeeRoleId_fkey`
    FOREIGN KEY (`employeeRoleId`) REFERENCES `EmployeeRole`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `LeaveBalance` (
    `id`         VARCHAR(36) NOT NULL,
    `companyId`  VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `leaveType`  ENUM('ANNUAL','SICK','MATERNITY','PATERNITY','COMPASSIONATE','UNPAID') NOT NULL,
    `year`       INTEGER     NOT NULL,
    `entitled`   INTEGER     NOT NULL,
    `taken`      INTEGER     NOT NULL DEFAULT 0,
    `pending`    INTEGER     NOT NULL DEFAULT 0,
    `remaining`  INTEGER     NOT NULL,
    `carryOver`  INTEGER     NOT NULL DEFAULT 0,
    `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LeaveBalance_companyId_employeeId_leaveType_year_key`(`companyId`, `employeeId`, `leaveType`, `year`),
    INDEX `LeaveBalance_companyId_employeeId_idx`(`companyId`, `employeeId`),
    INDEX `LeaveBalance_companyId_year_idx`(`companyId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LeaveBalance`
    ADD CONSTRAINT `LeaveBalance_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LeaveBalance`
    ADD CONSTRAINT `LeaveBalance_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `PublicHoliday` (
    `id`          VARCHAR(36)  NOT NULL,
    `companyId`   VARCHAR(36)  NOT NULL,
    `name`        VARCHAR(120) NOT NULL,
    `date`        DATETIME(3)  NOT NULL,
    `isRecurring` TINYINT(1)   NOT NULL DEFAULT 1,
    `year`        INTEGER      NULL,
    `createdById` VARCHAR(36)  NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PublicHoliday_companyId_date_key`(`companyId`, `date`),
    INDEX `PublicHoliday_companyId_date_idx`(`companyId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PublicHoliday`
    ADD CONSTRAINT `PublicHoliday_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `EmployeeDocument` (
    `id`          VARCHAR(36)  NOT NULL,
    `companyId`   VARCHAR(36)  NOT NULL,
    `employeeId`  VARCHAR(36)  NOT NULL,
    `docType`     VARCHAR(60)  NOT NULL,
    `title`       VARCHAR(200) NOT NULL,
    `fileUrl`     VARCHAR(500) NOT NULL,
    `expiryDate`  DATETIME(3)  NULL,
    `notes`       VARCHAR(500) NULL,
    `createdById` VARCHAR(36)  NULL,
    `updatedById` VARCHAR(36)  NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `deletedAt`   DATETIME(3)  NULL,

    INDEX `EmployeeDocument_companyId_employeeId_idx`(`companyId`, `employeeId`),
    INDEX `EmployeeDocument_companyId_docType_idx`(`companyId`, `docType`),
    INDEX `EmployeeDocument_expiryDate_idx`(`expiryDate`),
    INDEX `EmployeeDocument_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmployeeDocument`
    ADD CONSTRAINT `EmployeeDocument_companyId_fkey`
    FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `EmployeeDocument`
    ADD CONSTRAINT `EmployeeDocument_employeeId_fkey`
    FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
