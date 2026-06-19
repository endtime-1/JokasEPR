-- CreateEnum
CREATE TYPE "MachineType" AS ENUM ('FEED_MIXER', 'GRINDER', 'PELLETIZER', 'SOYA_EXPELLER', 'OIL_FILTER', 'GENERATOR', 'WEIGHING_SCALE', 'PACKAGING_MACHINE', 'DELIVERY_VEHICLE', 'POULTRY_EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentType" AS ENUM ('FARM_EQUIPMENT', 'PROCESSING_EQUIPMENT', 'WAREHOUSE_EQUIPMENT', 'VEHICLE_ACCESSORY', 'TOOL', 'SAFETY_EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'UNDER_MAINTENANCE', 'BROKEN_DOWN', 'RETIRED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'CALIBRATION', 'REPAIR');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenanceWorkflowStatus" AS ENUM ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "BreakdownSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BreakdownStatus" AS ENUM ('REPORTED', 'ASSIGNED', 'IN_REPAIR', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TechnicianAssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DowntimeStatus" AS ENUM ('OPEN', 'CLOSED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "MaintenanceCostType" AS ENUM ('LABOR', 'SPARE_PART', 'OUTSOURCED_SERVICE', 'UTILITIES', 'TRANSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RevenueSource" AS ENUM ('PRODUCT_SALES', 'SERVICE_FEES', 'RENTAL_INCOME', 'INVESTMENT_INCOME', 'OTHER');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CURRENT', 'SAVINGS', 'FIXED_DEPOSIT', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PettyCashType" AS ENUM ('FUNDING', 'DISBURSEMENT', 'REPLENISHMENT');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('STANDARD', 'OPENING', 'CLOSING', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchType" AS ENUM ('FLOCK', 'FEED_PRODUCTION', 'SOYA_PROCESSING');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLACKLISTED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_PO', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_SUPPLIER', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GRNStatus" AS ENUM ('DRAFT', 'RECEIVED', 'QUALITY_HOLD', 'QUALITY_PASSED', 'QUALITY_FAILED', 'POSTED');

-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('PENDING', 'MATCHED', 'APPROVED', 'PAID', 'DISPUTED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ProcurementPaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PerformanceRating" AS ENUM ('EXCELLENT', 'GOOD', 'SATISFACTORY', 'POOR', 'UNACCEPTABLE');

-- CreateEnum
CREATE TYPE "PurchaseApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED', 'RESIGNED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'PUBLIC_HOLIDAY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskAssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TrainingOutcome" AS ENUM ('PASSED', 'FAILED', 'ONGOING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HRRating" AS ENUM ('OUTSTANDING', 'EXCEEDS_EXPECTATIONS', 'MEETS_EXPECTATIONS', 'NEEDS_IMPROVEMENT', 'UNSATISFACTORY');

-- CreateEnum
CREATE TYPE "HRPerformanceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "Machine" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineType" "MachineType" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "manufacturer" TEXT,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "installationDate" TIMESTAMP(3),
    "capacity" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "machineId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentType" "EquipmentType" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "manufacturer" TEXT,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "machineId" UUID,
    "equipmentId" UUID,
    "scheduleNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "maintenanceType" "MaintenanceType" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
    "frequencyDays" INTEGER NOT NULL,
    "lastCompletedAt" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3) NOT NULL,
    "status" "MaintenanceWorkflowStatus" NOT NULL DEFAULT 'SCHEDULED',
    "instructions" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "scheduleId" UUID,
    "machineId" UUID,
    "equipmentId" UUID,
    "recordNumber" TEXT NOT NULL,
    "maintenanceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maintenanceType" "MaintenanceType" NOT NULL,
    "status" "MaintenanceWorkflowStatus" NOT NULL DEFAULT 'COMPLETED',
    "completedById" UUID,
    "description" TEXT NOT NULL,
    "findings" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakdownRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "machineId" UUID,
    "equipmentId" UUID,
    "breakdownNumber" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "severity" "BreakdownSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "BreakdownStatus" NOT NULL DEFAULT 'REPORTED',
    "description" TEXT NOT NULL,
    "rootCause" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "reportedById" UUID,
    "resolvedById" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BreakdownRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SparePartUsage" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "machineId" UUID,
    "equipmentId" UUID,
    "maintenanceRecordId" UUID,
    "breakdownRecordId" UUID,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "issuedById" UUID,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SparePartUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianAssignment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "machineId" UUID,
    "equipmentId" UUID,
    "scheduleId" UUID,
    "maintenanceRecordId" UUID,
    "breakdownRecordId" UUID,
    "technicianId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "TechnicianAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TechnicianAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineDowntimeRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "machineId" UUID,
    "equipmentId" UUID,
    "breakdownRecordId" UUID,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "durationHours" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" "DowntimeStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MachineDowntimeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceCost" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "machineId" UUID,
    "equipmentId" UUID,
    "maintenanceRecordId" UUID,
    "breakdownRecordId" UUID,
    "costDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "costType" "MaintenanceCostType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "description" TEXT,
    "status" "MaintenanceWorkflowStatus" NOT NULL DEFAULT 'COMPLETED',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaintenanceCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(240),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "description" VARCHAR(240),
    "accountId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "accountName" VARCHAR(120) NOT NULL,
    "accountNumber" VARCHAR(40) NOT NULL,
    "bankName" VARCHAR(120) NOT NULL,
    "branchName" VARCHAR(120),
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "accountType" "BankAccountType" NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "categoryId" UUID NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "vendorName" VARCHAR(160),
    "receiptRef" VARCHAR(120),
    "notes" VARCHAR(500),
    "branchId" UUID,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "submittedById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(240),
    "bankAccountId" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revenue" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "source" "RevenueSource" NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "revenueDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "customerName" VARCHAR(160),
    "invoiceRef" VARCHAR(60),
    "branchId" UUID,
    "notes" VARCHAR(500),
    "bankAccountId" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "supplierName" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "purchaseOrderRef" VARCHAR(60),
    "bankAccountId" UUID,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "customerName" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "invoiceRef" VARCHAR(60),
    "bankAccountId" UUID,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "employeeName" VARCHAR(160) NOT NULL,
    "employeeCode" VARCHAR(30),
    "basicSalary" DECIMAL(15,2) NOT NULL,
    "allowances" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(15,2) NOT NULL,
    "taxDeduction" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ssnit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(15,2) NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "bankAccountId" UUID,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(500),
    "branchId" UUID,
    "employeeId" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashTransaction" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "type" "PettyCashType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "categoryId" UUID,
    "branchId" UUID,
    "requestedById" UUID,
    "approvedById" UUID,
    "receiptRef" VARCHAR(60),
    "balance" DECIMAL(15,2) NOT NULL,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PettyCashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "type" "JournalEntryType" NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDebit" DECIMAL(15,2) NOT NULL,
    "totalCredit" DECIMAL(15,2) NOT NULL,
    "sourceModule" VARCHAR(60),
    "sourceId" VARCHAR(60),
    "reversalOf" UUID,
    "notes" VARCHAR(500),
    "postedById" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryLine" (
    "id" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "description" VARCHAR(240),
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitLossReport" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DECIMAL(15,2) NOT NULL,
    "totalExpenses" DECIMAL(15,2) NOT NULL,
    "grossProfit" DECIMAL(15,2) NOT NULL,
    "netProfit" DECIMAL(15,2) NOT NULL,
    "reportData" JSONB NOT NULL,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProfitLossReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowReport" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL,
    "closingBalance" DECIMAL(15,2) NOT NULL,
    "operatingCashFlow" DECIMAL(15,2) NOT NULL,
    "investingCashFlow" DECIMAL(15,2) NOT NULL,
    "financingCashFlow" DECIMAL(15,2) NOT NULL,
    "netCashFlow" DECIMAL(15,2) NOT NULL,
    "reportData" JSONB NOT NULL,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CashFlowReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductProfitability" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "productName" VARCHAR(160) NOT NULL,
    "productCode" VARCHAR(30),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "grossProfit" DECIMAL(15,2) NOT NULL,
    "margin" DECIMAL(5,2) NOT NULL,
    "unitsSold" DECIMAL(15,3) NOT NULL,
    "reportData" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductProfitability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchProfitability" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "batchType" "BatchType" NOT NULL,
    "batchId" VARCHAR(60) NOT NULL,
    "batchReference" VARCHAR(60) NOT NULL,
    "batchName" VARCHAR(120) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DECIMAL(15,2) NOT NULL,
    "totalCost" DECIMAL(15,2) NOT NULL,
    "grossProfit" DECIMAL(15,2) NOT NULL,
    "margin" DECIMAL(5,2) NOT NULL,
    "reportData" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BatchProfitability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "description" VARCHAR(240),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "categoryId" UUID,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "contactPerson" VARCHAR(120),
    "phone" VARCHAR(40),
    "email" VARCHAR(160),
    "address" VARCHAR(300),
    "taxId" VARCHAR(40),
    "bankName" VARCHAR(120),
    "bankAccount" VARCHAR(40),
    "paymentTermsDays" INTEGER,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "rating" DECIMAL(3,2),
    "leadTimeDays" INTEGER,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "requestedById" UUID NOT NULL,
    "branchId" UUID,
    "requiredDate" TIMESTAMP(3),
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEstimate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" UUID,
    "rejectionReason" VARCHAR(240),
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" UUID NOT NULL,
    "purchaseRequestId" UUID NOT NULL,
    "productId" UUID,
    "productName" VARCHAR(160) NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "uomCode" VARCHAR(10),
    "estimatedUnitCost" DECIMAL(15,2),
    "description" VARCHAR(240),
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseRequestId" UUID,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDelivery" TIMESTAMP(3),
    "deliveryAddress" VARCHAR(300),
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "paymentTermsDays" INTEGER,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" UUID,
    "rejectionReason" VARCHAR(240),
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID,
    "productName" VARCHAR(160) NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitCost" DECIMAL(15,2) NOT NULL,
    "lineTotal" DECIMAL(15,2) NOT NULL,
    "uomCode" VARCHAR(10),
    "receivedQty" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "description" VARCHAR(240),
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceivedNote" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "branchId" UUID,
    "warehouseId" UUID NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryNoteRef" VARCHAR(60),
    "status" "GRNStatus" NOT NULL DEFAULT 'DRAFT',
    "qualityCheckRequired" BOOLEAN NOT NULL DEFAULT true,
    "qualityPassedById" UUID,
    "qualityPassedAt" TIMESTAMP(3),
    "qualityNotes" VARCHAR(500),
    "postedAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GoodsReceivedNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceivedItem" (
    "id" UUID NOT NULL,
    "grnId" UUID NOT NULL,
    "purchaseOrderItemId" UUID,
    "productId" UUID,
    "productName" VARCHAR(160) NOT NULL,
    "orderedQty" DECIMAL(15,4) NOT NULL,
    "receivedQty" DECIMAL(15,4) NOT NULL,
    "rejectedQty" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(15,2) NOT NULL,
    "uomCode" VARCHAR(10),
    "batchNumber" VARCHAR(60),
    "expiryDate" TIMESTAMP(3),
    "qualityStatus" VARCHAR(30),
    "notes" VARCHAR(240),
    "sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GoodsReceivedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierInvoice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "invoiceNumber" VARCHAR(60) NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(15,2) NOT NULL,
    "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(15,2) NOT NULL,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementPayment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reference" VARCHAR(30) NOT NULL,
    "supplierId" UUID NOT NULL,
    "invoiceId" UUID,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "bankAccountId" UUID,
    "description" VARCHAR(240) NOT NULL,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPerformanceRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "rating" "PerformanceRating" NOT NULL,
    "onTimeDelivery" BOOLEAN NOT NULL DEFAULT true,
    "qualityScore" INTEGER NOT NULL,
    "priceCompetitiveness" INTEGER,
    "responsiveness" INTEGER,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "lateDeliveries" INTEGER NOT NULL DEFAULT 0,
    "rejectedItems" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "reviewedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierPerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseApproval" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "purchaseRequestId" UUID,
    "approvalLevel" INTEGER NOT NULL DEFAULT 1,
    "status" "PurchaseApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "comments" VARCHAR(500),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPriceHistory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "productId" UUID,
    "productName" VARCHAR(160) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'GHS',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" VARCHAR(240),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRole" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(240),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "firstName" VARCHAR(80) NOT NULL,
    "lastName" VARCHAR(80) NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "phone" VARCHAR(40),
    "email" VARCHAR(160),
    "address" VARCHAR(300),
    "nationalId" VARCHAR(40),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "employeeRoleId" UUID,
    "branchId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "basicSalary" DECIMAL(15,2),
    "bankName" VARCHAR(120),
    "bankAccount" VARCHAR(40),
    "ssnitNumber" VARCHAR(20),
    "tinNumber" VARCHAR(20),
    "emergencyContactName" VARCHAR(120),
    "emergencyContactPhone" VARCHAR(40),
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "hoursWorked" DECIMAL(5,2),
    "shiftId" UUID,
    "notes" VARCHAR(240),
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "code" VARCHAR(24) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(240),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "taskType" VARCHAR(60),
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "branchId" UUID,
    "farmId" UUID,
    "productionSiteId" UUID,
    "assignedById" UUID,
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "assignedById" UUID,
    "status" "TaskAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "completedAt" TIMESTAMP(3),
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "trainer" VARCHAR(120),
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "durationHours" DECIMAL(5,1),
    "outcome" "TrainingOutcome" NOT NULL DEFAULT 'ONGOING',
    "certificate" VARCHAR(120),
    "notes" VARCHAR(500),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRPerformanceRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "period" VARCHAR(10) NOT NULL,
    "reviewerId" UUID,
    "overallRating" "HRRating" NOT NULL DEFAULT 'MEETS_EXPECTATIONS',
    "attendanceScore" INTEGER NOT NULL DEFAULT 0,
    "taskCompletionScore" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "teamworkScore" INTEGER NOT NULL DEFAULT 0,
    "comments" VARCHAR(1000),
    "goals" VARCHAR(500),
    "status" "HRPerformanceStatus" NOT NULL DEFAULT 'DRAFT',
    "acknowledgedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HRPerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentAssignment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "branchId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "department" VARCHAR(120) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(240),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Machine_companyId_idx" ON "Machine"("companyId");

-- CreateIndex
CREATE INDEX "Machine_branchId_idx" ON "Machine"("branchId");

-- CreateIndex
CREATE INDEX "Machine_farmId_idx" ON "Machine"("farmId");

-- CreateIndex
CREATE INDEX "Machine_warehouseId_idx" ON "Machine"("warehouseId");

-- CreateIndex
CREATE INDEX "Machine_productionSiteId_idx" ON "Machine"("productionSiteId");

-- CreateIndex
CREATE INDEX "Machine_companyId_machineType_idx" ON "Machine"("companyId", "machineType");

-- CreateIndex
CREATE INDEX "Machine_companyId_status_idx" ON "Machine"("companyId", "status");

-- CreateIndex
CREATE INDEX "Machine_companyId_createdAt_idx" ON "Machine"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Machine_deletedAt_idx" ON "Machine"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_companyId_code_key" ON "Machine"("companyId", "code");

-- CreateIndex
CREATE INDEX "Equipment_companyId_idx" ON "Equipment"("companyId");

-- CreateIndex
CREATE INDEX "Equipment_branchId_idx" ON "Equipment"("branchId");

-- CreateIndex
CREATE INDEX "Equipment_farmId_idx" ON "Equipment"("farmId");

-- CreateIndex
CREATE INDEX "Equipment_warehouseId_idx" ON "Equipment"("warehouseId");

-- CreateIndex
CREATE INDEX "Equipment_productionSiteId_idx" ON "Equipment"("productionSiteId");

-- CreateIndex
CREATE INDEX "Equipment_machineId_idx" ON "Equipment"("machineId");

-- CreateIndex
CREATE INDEX "Equipment_companyId_equipmentType_idx" ON "Equipment"("companyId", "equipmentType");

-- CreateIndex
CREATE INDEX "Equipment_companyId_status_idx" ON "Equipment"("companyId", "status");

-- CreateIndex
CREATE INDEX "Equipment_companyId_createdAt_idx" ON "Equipment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Equipment_deletedAt_idx" ON "Equipment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_companyId_code_key" ON "Equipment"("companyId", "code");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_companyId_idx" ON "MaintenanceSchedule"("companyId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_branchId_idx" ON "MaintenanceSchedule"("branchId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_farmId_idx" ON "MaintenanceSchedule"("farmId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_warehouseId_idx" ON "MaintenanceSchedule"("warehouseId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_productionSiteId_idx" ON "MaintenanceSchedule"("productionSiteId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_machineId_idx" ON "MaintenanceSchedule"("machineId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_equipmentId_idx" ON "MaintenanceSchedule"("equipmentId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_companyId_maintenanceType_idx" ON "MaintenanceSchedule"("companyId", "maintenanceType");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_companyId_priority_idx" ON "MaintenanceSchedule"("companyId", "priority");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_companyId_status_idx" ON "MaintenanceSchedule"("companyId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_nextDueDate_idx" ON "MaintenanceSchedule"("nextDueDate");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_companyId_createdAt_idx" ON "MaintenanceSchedule"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_deletedAt_idx" ON "MaintenanceSchedule"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceSchedule_companyId_scheduleNumber_key" ON "MaintenanceSchedule"("companyId", "scheduleNumber");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_companyId_idx" ON "MaintenanceRecord"("companyId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_branchId_idx" ON "MaintenanceRecord"("branchId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_farmId_idx" ON "MaintenanceRecord"("farmId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_warehouseId_idx" ON "MaintenanceRecord"("warehouseId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_productionSiteId_idx" ON "MaintenanceRecord"("productionSiteId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_scheduleId_idx" ON "MaintenanceRecord"("scheduleId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_machineId_idx" ON "MaintenanceRecord"("machineId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_equipmentId_idx" ON "MaintenanceRecord"("equipmentId");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_completedById_idx" ON "MaintenanceRecord"("completedById");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_companyId_maintenanceType_idx" ON "MaintenanceRecord"("companyId", "maintenanceType");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_companyId_status_idx" ON "MaintenanceRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_maintenanceDate_idx" ON "MaintenanceRecord"("maintenanceDate");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_companyId_createdAt_idx" ON "MaintenanceRecord"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_deletedAt_idx" ON "MaintenanceRecord"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRecord_companyId_recordNumber_key" ON "MaintenanceRecord"("companyId", "recordNumber");

-- CreateIndex
CREATE INDEX "BreakdownRecord_companyId_idx" ON "BreakdownRecord"("companyId");

-- CreateIndex
CREATE INDEX "BreakdownRecord_branchId_idx" ON "BreakdownRecord"("branchId");

-- CreateIndex
CREATE INDEX "BreakdownRecord_farmId_idx" ON "BreakdownRecord"("farmId");

-- CreateIndex
CREATE INDEX "BreakdownRecord_warehouseId_idx" ON "BreakdownRecord"("warehouseId");

-- CreateIndex
CREATE INDEX "BreakdownRecord_productionSiteId_idx" ON "BreakdownRecord"("productionSiteId");

-- CreateIndex
CREATE INDEX "BreakdownRecord_machineId_idx" ON "BreakdownRecord"("machineId");

-- CreateIndex
CREATE INDEX "BreakdownRecord_equipmentId_idx" ON "BreakdownRecord"("equipmentId");

-- CreateIndex
CREATE INDEX "BreakdownRecord_reportedById_idx" ON "BreakdownRecord"("reportedById");

-- CreateIndex
CREATE INDEX "BreakdownRecord_resolvedById_idx" ON "BreakdownRecord"("resolvedById");

-- CreateIndex
CREATE INDEX "BreakdownRecord_companyId_severity_idx" ON "BreakdownRecord"("companyId", "severity");

-- CreateIndex
CREATE INDEX "BreakdownRecord_companyId_status_idx" ON "BreakdownRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "BreakdownRecord_reportedAt_idx" ON "BreakdownRecord"("reportedAt");

-- CreateIndex
CREATE INDEX "BreakdownRecord_companyId_createdAt_idx" ON "BreakdownRecord"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "BreakdownRecord_deletedAt_idx" ON "BreakdownRecord"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BreakdownRecord_companyId_breakdownNumber_key" ON "BreakdownRecord"("companyId", "breakdownNumber");

-- CreateIndex
CREATE INDEX "SparePartUsage_companyId_idx" ON "SparePartUsage"("companyId");

-- CreateIndex
CREATE INDEX "SparePartUsage_branchId_idx" ON "SparePartUsage"("branchId");

-- CreateIndex
CREATE INDEX "SparePartUsage_warehouseId_idx" ON "SparePartUsage"("warehouseId");

-- CreateIndex
CREATE INDEX "SparePartUsage_machineId_idx" ON "SparePartUsage"("machineId");

-- CreateIndex
CREATE INDEX "SparePartUsage_equipmentId_idx" ON "SparePartUsage"("equipmentId");

-- CreateIndex
CREATE INDEX "SparePartUsage_maintenanceRecordId_idx" ON "SparePartUsage"("maintenanceRecordId");

-- CreateIndex
CREATE INDEX "SparePartUsage_breakdownRecordId_idx" ON "SparePartUsage"("breakdownRecordId");

-- CreateIndex
CREATE INDEX "SparePartUsage_productId_idx" ON "SparePartUsage"("productId");

-- CreateIndex
CREATE INDEX "SparePartUsage_issuedById_idx" ON "SparePartUsage"("issuedById");

-- CreateIndex
CREATE INDEX "SparePartUsage_usedAt_idx" ON "SparePartUsage"("usedAt");

-- CreateIndex
CREATE INDEX "SparePartUsage_companyId_createdAt_idx" ON "SparePartUsage"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "SparePartUsage_deletedAt_idx" ON "SparePartUsage"("deletedAt");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_companyId_idx" ON "TechnicianAssignment"("companyId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_branchId_idx" ON "TechnicianAssignment"("branchId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_machineId_idx" ON "TechnicianAssignment"("machineId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_equipmentId_idx" ON "TechnicianAssignment"("equipmentId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_scheduleId_idx" ON "TechnicianAssignment"("scheduleId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_maintenanceRecordId_idx" ON "TechnicianAssignment"("maintenanceRecordId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_breakdownRecordId_idx" ON "TechnicianAssignment"("breakdownRecordId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_technicianId_idx" ON "TechnicianAssignment"("technicianId");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_companyId_status_idx" ON "TechnicianAssignment"("companyId", "status");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_assignedAt_idx" ON "TechnicianAssignment"("assignedAt");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_dueDate_idx" ON "TechnicianAssignment"("dueDate");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_companyId_createdAt_idx" ON "TechnicianAssignment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "TechnicianAssignment_deletedAt_idx" ON "TechnicianAssignment"("deletedAt");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_companyId_idx" ON "MachineDowntimeRecord"("companyId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_branchId_idx" ON "MachineDowntimeRecord"("branchId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_farmId_idx" ON "MachineDowntimeRecord"("farmId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_warehouseId_idx" ON "MachineDowntimeRecord"("warehouseId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_productionSiteId_idx" ON "MachineDowntimeRecord"("productionSiteId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_machineId_idx" ON "MachineDowntimeRecord"("machineId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_equipmentId_idx" ON "MachineDowntimeRecord"("equipmentId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_breakdownRecordId_idx" ON "MachineDowntimeRecord"("breakdownRecordId");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_companyId_status_idx" ON "MachineDowntimeRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_startAt_idx" ON "MachineDowntimeRecord"("startAt");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_endAt_idx" ON "MachineDowntimeRecord"("endAt");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_companyId_createdAt_idx" ON "MachineDowntimeRecord"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "MachineDowntimeRecord_deletedAt_idx" ON "MachineDowntimeRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "MaintenanceCost_companyId_idx" ON "MaintenanceCost"("companyId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_branchId_idx" ON "MaintenanceCost"("branchId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_farmId_idx" ON "MaintenanceCost"("farmId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_warehouseId_idx" ON "MaintenanceCost"("warehouseId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_productionSiteId_idx" ON "MaintenanceCost"("productionSiteId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_machineId_idx" ON "MaintenanceCost"("machineId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_equipmentId_idx" ON "MaintenanceCost"("equipmentId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_maintenanceRecordId_idx" ON "MaintenanceCost"("maintenanceRecordId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_breakdownRecordId_idx" ON "MaintenanceCost"("breakdownRecordId");

-- CreateIndex
CREATE INDEX "MaintenanceCost_companyId_costType_idx" ON "MaintenanceCost"("companyId", "costType");

-- CreateIndex
CREATE INDEX "MaintenanceCost_companyId_status_idx" ON "MaintenanceCost"("companyId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceCost_costDate_idx" ON "MaintenanceCost"("costDate");

-- CreateIndex
CREATE INDEX "MaintenanceCost_companyId_createdAt_idx" ON "MaintenanceCost"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceCost_deletedAt_idx" ON "MaintenanceCost"("deletedAt");

-- CreateIndex
CREATE INDEX "Account_companyId_idx" ON "Account"("companyId");

-- CreateIndex
CREATE INDEX "Account_companyId_type_idx" ON "Account"("companyId", "type");

-- CreateIndex
CREATE INDEX "Account_deletedAt_idx" ON "Account"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_companyId_code_key" ON "Account"("companyId", "code");

-- CreateIndex
CREATE INDEX "ExpenseCategory_companyId_idx" ON "ExpenseCategory"("companyId");

-- CreateIndex
CREATE INDEX "ExpenseCategory_deletedAt_idx" ON "ExpenseCategory"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_companyId_code_key" ON "ExpenseCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_isActive_idx" ON "BankAccount"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "BankAccount_deletedAt_idx" ON "BankAccount"("deletedAt");

-- CreateIndex
CREATE INDEX "Expense_companyId_idx" ON "Expense"("companyId");

-- CreateIndex
CREATE INDEX "Expense_companyId_status_idx" ON "Expense"("companyId", "status");

-- CreateIndex
CREATE INDEX "Expense_companyId_expenseDate_idx" ON "Expense"("companyId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_submittedById_idx" ON "Expense"("submittedById");

-- CreateIndex
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_companyId_reference_key" ON "Expense"("companyId", "reference");

-- CreateIndex
CREATE INDEX "Revenue_companyId_idx" ON "Revenue"("companyId");

-- CreateIndex
CREATE INDEX "Revenue_companyId_revenueDate_idx" ON "Revenue"("companyId", "revenueDate");

-- CreateIndex
CREATE INDEX "Revenue_companyId_source_idx" ON "Revenue"("companyId", "source");

-- CreateIndex
CREATE INDEX "Revenue_deletedAt_idx" ON "Revenue"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Revenue_companyId_reference_key" ON "Revenue"("companyId", "reference");

-- CreateIndex
CREATE INDEX "SupplierPayment_companyId_idx" ON "SupplierPayment"("companyId");

-- CreateIndex
CREATE INDEX "SupplierPayment_companyId_paymentDate_idx" ON "SupplierPayment"("companyId", "paymentDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_deletedAt_idx" ON "SupplierPayment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_companyId_reference_key" ON "SupplierPayment"("companyId", "reference");

-- CreateIndex
CREATE INDEX "CustomerPayment_companyId_idx" ON "CustomerPayment"("companyId");

-- CreateIndex
CREATE INDEX "CustomerPayment_companyId_paymentDate_idx" ON "CustomerPayment"("companyId", "paymentDate");

-- CreateIndex
CREATE INDEX "CustomerPayment_deletedAt_idx" ON "CustomerPayment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_companyId_reference_key" ON "CustomerPayment"("companyId", "reference");

-- CreateIndex
CREATE INDEX "PayrollRecord_companyId_idx" ON "PayrollRecord"("companyId");

-- CreateIndex
CREATE INDEX "PayrollRecord_companyId_period_idx" ON "PayrollRecord"("companyId", "period");

-- CreateIndex
CREATE INDEX "PayrollRecord_companyId_status_idx" ON "PayrollRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "PayrollRecord_deletedAt_idx" ON "PayrollRecord"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRecord_companyId_reference_key" ON "PayrollRecord"("companyId", "reference");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_companyId_idx" ON "PettyCashTransaction"("companyId");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_companyId_transactionDate_idx" ON "PettyCashTransaction"("companyId", "transactionDate");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_companyId_type_idx" ON "PettyCashTransaction"("companyId", "type");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_deletedAt_idx" ON "PettyCashTransaction"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashTransaction_companyId_reference_key" ON "PettyCashTransaction"("companyId", "reference");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_idx" ON "JournalEntry"("companyId");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_entryDate_idx" ON "JournalEntry"("companyId", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_companyId_status_idx" ON "JournalEntry"("companyId", "status");

-- CreateIndex
CREATE INDEX "JournalEntry_deletedAt_idx" ON "JournalEntry"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_companyId_reference_key" ON "JournalEntry"("companyId", "reference");

-- CreateIndex
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");

-- CreateIndex
CREATE INDEX "ProfitLossReport_companyId_idx" ON "ProfitLossReport"("companyId");

-- CreateIndex
CREATE INDEX "ProfitLossReport_companyId_periodStart_periodEnd_idx" ON "ProfitLossReport"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ProfitLossReport_deletedAt_idx" ON "ProfitLossReport"("deletedAt");

-- CreateIndex
CREATE INDEX "CashFlowReport_companyId_idx" ON "CashFlowReport"("companyId");

-- CreateIndex
CREATE INDEX "CashFlowReport_companyId_periodStart_periodEnd_idx" ON "CashFlowReport"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "CashFlowReport_deletedAt_idx" ON "CashFlowReport"("deletedAt");

-- CreateIndex
CREATE INDEX "ProductProfitability_companyId_idx" ON "ProductProfitability"("companyId");

-- CreateIndex
CREATE INDEX "ProductProfitability_companyId_periodStart_periodEnd_idx" ON "ProductProfitability"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ProductProfitability_deletedAt_idx" ON "ProductProfitability"("deletedAt");

-- CreateIndex
CREATE INDEX "BatchProfitability_companyId_idx" ON "BatchProfitability"("companyId");

-- CreateIndex
CREATE INDEX "BatchProfitability_companyId_batchType_idx" ON "BatchProfitability"("companyId", "batchType");

-- CreateIndex
CREATE INDEX "BatchProfitability_companyId_periodStart_periodEnd_idx" ON "BatchProfitability"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "BatchProfitability_deletedAt_idx" ON "BatchProfitability"("deletedAt");

-- CreateIndex
CREATE INDEX "SupplierCategory_companyId_idx" ON "SupplierCategory"("companyId");

-- CreateIndex
CREATE INDEX "SupplierCategory_deletedAt_idx" ON "SupplierCategory"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCategory_companyId_code_key" ON "SupplierCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

-- CreateIndex
CREATE INDEX "Supplier_companyId_status_idx" ON "Supplier"("companyId", "status");

-- CreateIndex
CREATE INDEX "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_code_key" ON "Supplier"("companyId", "code");

-- CreateIndex
CREATE INDEX "PurchaseRequest_companyId_idx" ON "PurchaseRequest"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_companyId_status_idx" ON "PurchaseRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requestedById_idx" ON "PurchaseRequest"("requestedById");

-- CreateIndex
CREATE INDEX "PurchaseRequest_deletedAt_idx" ON "PurchaseRequest"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_companyId_reference_key" ON "PurchaseRequest"("companyId", "reference");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_purchaseRequestId_idx" ON "PurchaseRequestItem"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_idx" ON "PurchaseOrder"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_companyId_status_idx" ON "PurchaseOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_deletedAt_idx" ON "PurchaseOrder"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_companyId_reference_key" ON "PurchaseOrder"("companyId", "reference");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceivedNote_companyId_idx" ON "GoodsReceivedNote"("companyId");

-- CreateIndex
CREATE INDEX "GoodsReceivedNote_companyId_status_idx" ON "GoodsReceivedNote"("companyId", "status");

-- CreateIndex
CREATE INDEX "GoodsReceivedNote_purchaseOrderId_idx" ON "GoodsReceivedNote"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceivedNote_supplierId_idx" ON "GoodsReceivedNote"("supplierId");

-- CreateIndex
CREATE INDEX "GoodsReceivedNote_deletedAt_idx" ON "GoodsReceivedNote"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceivedNote_companyId_reference_key" ON "GoodsReceivedNote"("companyId", "reference");

-- CreateIndex
CREATE INDEX "GoodsReceivedItem_grnId_idx" ON "GoodsReceivedItem"("grnId");

-- CreateIndex
CREATE INDEX "GoodsReceivedItem_purchaseOrderItemId_idx" ON "GoodsReceivedItem"("purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_companyId_idx" ON "SupplierInvoice"("companyId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_companyId_status_idx" ON "SupplierInvoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "SupplierInvoice_supplierId_idx" ON "SupplierInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierInvoice_deletedAt_idx" ON "SupplierInvoice"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierInvoice_companyId_reference_key" ON "SupplierInvoice"("companyId", "reference");

-- CreateIndex
CREATE INDEX "ProcurementPayment_companyId_idx" ON "ProcurementPayment"("companyId");

-- CreateIndex
CREATE INDEX "ProcurementPayment_supplierId_idx" ON "ProcurementPayment"("supplierId");

-- CreateIndex
CREATE INDEX "ProcurementPayment_companyId_paymentDate_idx" ON "ProcurementPayment"("companyId", "paymentDate");

-- CreateIndex
CREATE INDEX "ProcurementPayment_deletedAt_idx" ON "ProcurementPayment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementPayment_companyId_reference_key" ON "ProcurementPayment"("companyId", "reference");

-- CreateIndex
CREATE INDEX "SupplierPerformanceRecord_companyId_idx" ON "SupplierPerformanceRecord"("companyId");

-- CreateIndex
CREATE INDEX "SupplierPerformanceRecord_supplierId_idx" ON "SupplierPerformanceRecord"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPerformanceRecord_deletedAt_idx" ON "SupplierPerformanceRecord"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPerformanceRecord_companyId_supplierId_period_key" ON "SupplierPerformanceRecord"("companyId", "supplierId", "period");

-- CreateIndex
CREATE INDEX "PurchaseApproval_companyId_idx" ON "PurchaseApproval"("companyId");

-- CreateIndex
CREATE INDEX "PurchaseApproval_purchaseOrderId_idx" ON "PurchaseApproval"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseApproval_purchaseRequestId_idx" ON "PurchaseApproval"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseApproval_approverId_idx" ON "PurchaseApproval"("approverId");

-- CreateIndex
CREATE INDEX "PurchaseApproval_companyId_status_idx" ON "PurchaseApproval"("companyId", "status");

-- CreateIndex
CREATE INDEX "SupplierPriceHistory_companyId_idx" ON "SupplierPriceHistory"("companyId");

-- CreateIndex
CREATE INDEX "SupplierPriceHistory_supplierId_idx" ON "SupplierPriceHistory"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPriceHistory_companyId_supplierId_productName_idx" ON "SupplierPriceHistory"("companyId", "supplierId", "productName");

-- CreateIndex
CREATE INDEX "EmployeeRole_companyId_idx" ON "EmployeeRole"("companyId");

-- CreateIndex
CREATE INDEX "EmployeeRole_deletedAt_idx" ON "EmployeeRole"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRole_companyId_code_key" ON "EmployeeRole"("companyId", "code");

-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "Employee_companyId_status_idx" ON "Employee"("companyId", "status");

-- CreateIndex
CREATE INDEX "Employee_companyId_employeeRoleId_idx" ON "Employee"("companyId", "employeeRoleId");

-- CreateIndex
CREATE INDEX "Employee_branchId_idx" ON "Employee"("branchId");

-- CreateIndex
CREATE INDEX "Employee_farmId_idx" ON "Employee"("farmId");

-- CreateIndex
CREATE INDEX "Employee_warehouseId_idx" ON "Employee"("warehouseId");

-- CreateIndex
CREATE INDEX "Employee_productionSiteId_idx" ON "Employee"("productionSiteId");

-- CreateIndex
CREATE INDEX "Employee_deletedAt_idx" ON "Employee"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_code_key" ON "Employee"("companyId", "code");

-- CreateIndex
CREATE INDEX "AttendanceRecord_companyId_idx" ON "AttendanceRecord"("companyId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_companyId_date_idx" ON "AttendanceRecord"("companyId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_employeeId_idx" ON "AttendanceRecord"("employeeId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_companyId_status_idx" ON "AttendanceRecord"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_companyId_employeeId_date_key" ON "AttendanceRecord"("companyId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "Shift_companyId_idx" ON "Shift"("companyId");

-- CreateIndex
CREATE INDEX "Shift_companyId_isActive_idx" ON "Shift"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "Shift_deletedAt_idx" ON "Shift"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_companyId_code_key" ON "Shift"("companyId", "code");

-- CreateIndex
CREATE INDEX "Task_companyId_idx" ON "Task"("companyId");

-- CreateIndex
CREATE INDEX "Task_companyId_status_idx" ON "Task"("companyId", "status");

-- CreateIndex
CREATE INDEX "Task_companyId_priority_idx" ON "Task"("companyId", "priority");

-- CreateIndex
CREATE INDEX "Task_companyId_dueDate_idx" ON "Task"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_branchId_idx" ON "Task"("branchId");

-- CreateIndex
CREATE INDEX "Task_deletedAt_idx" ON "Task"("deletedAt");

-- CreateIndex
CREATE INDEX "TaskAssignment_companyId_idx" ON "TaskAssignment"("companyId");

-- CreateIndex
CREATE INDEX "TaskAssignment_taskId_idx" ON "TaskAssignment"("taskId");

-- CreateIndex
CREATE INDEX "TaskAssignment_employeeId_idx" ON "TaskAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "TaskAssignment_companyId_status_idx" ON "TaskAssignment"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignment_taskId_employeeId_key" ON "TaskAssignment"("taskId", "employeeId");

-- CreateIndex
CREATE INDEX "TrainingRecord_companyId_idx" ON "TrainingRecord"("companyId");

-- CreateIndex
CREATE INDEX "TrainingRecord_employeeId_idx" ON "TrainingRecord"("employeeId");

-- CreateIndex
CREATE INDEX "TrainingRecord_companyId_trainingDate_idx" ON "TrainingRecord"("companyId", "trainingDate");

-- CreateIndex
CREATE INDEX "TrainingRecord_deletedAt_idx" ON "TrainingRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "HRPerformanceRecord_companyId_idx" ON "HRPerformanceRecord"("companyId");

-- CreateIndex
CREATE INDEX "HRPerformanceRecord_employeeId_idx" ON "HRPerformanceRecord"("employeeId");

-- CreateIndex
CREATE INDEX "HRPerformanceRecord_companyId_period_idx" ON "HRPerformanceRecord"("companyId", "period");

-- CreateIndex
CREATE INDEX "HRPerformanceRecord_companyId_status_idx" ON "HRPerformanceRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "HRPerformanceRecord_deletedAt_idx" ON "HRPerformanceRecord"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HRPerformanceRecord_companyId_employeeId_period_key" ON "HRPerformanceRecord"("companyId", "employeeId", "period");

-- CreateIndex
CREATE INDEX "DepartmentAssignment_companyId_idx" ON "DepartmentAssignment"("companyId");

-- CreateIndex
CREATE INDEX "DepartmentAssignment_employeeId_idx" ON "DepartmentAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "DepartmentAssignment_branchId_idx" ON "DepartmentAssignment"("branchId");

-- CreateIndex
CREATE INDEX "DepartmentAssignment_farmId_idx" ON "DepartmentAssignment"("farmId");

-- CreateIndex
CREATE INDEX "DepartmentAssignment_warehouseId_idx" ON "DepartmentAssignment"("warehouseId");

-- CreateIndex
CREATE INDEX "DepartmentAssignment_productionSiteId_idx" ON "DepartmentAssignment"("productionSiteId");

-- CreateIndex
CREATE INDEX "DepartmentAssignment_companyId_startDate_idx" ON "DepartmentAssignment"("companyId", "startDate");

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakdownRecord" ADD CONSTRAINT "BreakdownRecord_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_maintenanceRecordId_fkey" FOREIGN KEY ("maintenanceRecordId") REFERENCES "MaintenanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_breakdownRecordId_fkey" FOREIGN KEY ("breakdownRecordId") REFERENCES "BreakdownRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SparePartUsage" ADD CONSTRAINT "SparePartUsage_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_maintenanceRecordId_fkey" FOREIGN KEY ("maintenanceRecordId") REFERENCES "MaintenanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_breakdownRecordId_fkey" FOREIGN KEY ("breakdownRecordId") REFERENCES "BreakdownRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianAssignment" ADD CONSTRAINT "TechnicianAssignment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineDowntimeRecord" ADD CONSTRAINT "MachineDowntimeRecord_breakdownRecordId_fkey" FOREIGN KEY ("breakdownRecordId") REFERENCES "BreakdownRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_maintenanceRecordId_fkey" FOREIGN KEY ("maintenanceRecordId") REFERENCES "MaintenanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCost" ADD CONSTRAINT "MaintenanceCost_breakdownRecordId_fkey" FOREIGN KEY ("breakdownRecordId") REFERENCES "BreakdownRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitLossReport" ADD CONSTRAINT "ProfitLossReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowReport" ADD CONSTRAINT "CashFlowReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProfitability" ADD CONSTRAINT "ProductProfitability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchProfitability" ADD CONSTRAINT "BatchProfitability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCategory" ADD CONSTRAINT "SupplierCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupplierCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedNote" ADD CONSTRAINT "GoodsReceivedNote_qualityPassedById_fkey" FOREIGN KEY ("qualityPassedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedItem" ADD CONSTRAINT "GoodsReceivedItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceivedNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivedItem" ADD CONSTRAINT "GoodsReceivedItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPayment" ADD CONSTRAINT "ProcurementPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPayment" ADD CONSTRAINT "ProcurementPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPayment" ADD CONSTRAINT "ProcurementPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPerformanceRecord" ADD CONSTRAINT "SupplierPerformanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPerformanceRecord" ADD CONSTRAINT "SupplierPerformanceRecord_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseApproval" ADD CONSTRAINT "PurchaseApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseApproval" ADD CONSTRAINT "PurchaseApproval_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseApproval" ADD CONSTRAINT "PurchaseApproval_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseApproval" ADD CONSTRAINT "PurchaseApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPriceHistory" ADD CONSTRAINT "SupplierPriceHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRole" ADD CONSTRAINT "EmployeeRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_employeeRoleId_fkey" FOREIGN KEY ("employeeRoleId") REFERENCES "EmployeeRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRPerformanceRecord" ADD CONSTRAINT "HRPerformanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRPerformanceRecord" ADD CONSTRAINT "HRPerformanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRPerformanceRecord" ADD CONSTRAINT "HRPerformanceRecord_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAssignment" ADD CONSTRAINT "DepartmentAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAssignment" ADD CONSTRAINT "DepartmentAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAssignment" ADD CONSTRAINT "DepartmentAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAssignment" ADD CONSTRAINT "DepartmentAssignment_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAssignment" ADD CONSTRAINT "DepartmentAssignment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAssignment" ADD CONSTRAINT "DepartmentAssignment_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;


