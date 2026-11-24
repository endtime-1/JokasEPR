-- Finance v2: contacts (customers/suppliers), CSV import log, tax codes and effective-dated rates.
-- Additive only: new fin_* tables, no foreign keys into any existing table. Undo: down.sql in this folder.

-- CreateTable
CREATE TABLE `fin_contacts` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `isCustomer` BOOLEAN NOT NULL DEFAULT true,
    `isSupplier` BOOLEAN NOT NULL DEFAULT false,
    `contactPerson` VARCHAR(120) NULL,
    `phone` VARCHAR(40) NULL,
    `email` VARCHAR(160) NULL,
    `tin` VARCHAR(40) NULL,
    `addressLine1` VARCHAR(160) NULL,
    `addressLine2` VARCHAR(160) NULL,
    `city` VARCHAR(80) NULL,
    `region` VARCHAR(80) NULL,
    `paymentTermsDays` INTEGER NOT NULL DEFAULT 0,
    `creditLimit` DECIMAL(15, 2) NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'GHS',
    `notes` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `externalRef` VARCHAR(100) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fin_contacts_companyId_name_idx`(`companyId`, `name`),
    INDEX `fin_contacts_companyId_isCustomer_idx`(`companyId`, `isCustomer`),
    INDEX `fin_contacts_companyId_isSupplier_idx`(`companyId`, `isSupplier`),
    INDEX `fin_contacts_companyId_externalRef_idx`(`companyId`, `externalRef`),
    UNIQUE INDEX `fin_contacts_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_import_batches` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `fileName` VARCHAR(200) NULL,
    `totalRows` INTEGER NOT NULL,
    `createdRows` INTEGER NOT NULL DEFAULT 0,
    `updatedRows` INTEGER NOT NULL DEFAULT 0,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fin_import_batches_companyId_kind_createdAt_idx`(`companyId`, `kind`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_tax_codes` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `appliesTo` VARCHAR(10) NOT NULL DEFAULT 'BOTH',
    `isRecoverable` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `description` VARCHAR(240) NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fin_tax_codes_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fin_tax_rates` (
    `id` VARCHAR(191) NOT NULL,
    `taxCodeId` VARCHAR(191) NOT NULL,
    `ratePercent` DECIMAL(7, 4) NOT NULL,
    `effectiveFrom` DATE NOT NULL,
    `note` VARCHAR(200) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `fin_tax_rates_taxCodeId_effectiveFrom_key`(`taxCodeId`, `effectiveFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fin_tax_rates` ADD CONSTRAINT `fin_tax_rates_taxCodeId_fkey` FOREIGN KEY (`taxCodeId`) REFERENCES `fin_tax_codes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

