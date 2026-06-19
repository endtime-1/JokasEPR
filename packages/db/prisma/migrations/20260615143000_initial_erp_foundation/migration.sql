-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FarmType" AS ENUM ('POULTRY', 'CROP', 'MIXED');

-- CreateEnum
CREATE TYPE "ProductionSiteType" AS ENUM ('FEED_PRODUCTION', 'SOYA_PROCESSING', 'MIXED');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('GENERAL', 'COLD_STORAGE', 'FARM_STORE', 'FEED_STORE', 'SOYA_STORE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "RoleLevel" AS ENUM ('SUPER_ADMIN', 'CEO', 'MANAGER', 'OFFICER', 'WORKER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('RAW_MATERIAL', 'FINISHED_GOOD', 'SEMI_FINISHED', 'CONSUMABLE', 'SERVICE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "InventoryItemStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "StockBatchStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING_BALANCE', 'PURCHASE_RECEIPT', 'PRODUCTION_INPUT', 'PRODUCTION_OUTPUT', 'SALE_DISPATCH', 'TRANSFER', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'WASTE', 'RETURN_IN', 'RETURN_OUT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'FAILED_LOGIN', 'LOGOUT', 'TOKEN_REFRESH', 'ACTIVATE', 'DEACTIVATE', 'ASSIGN_ROLE', 'ASSIGN_ACCESS', 'CHANGE_PERMISSION', 'TRANSFER', 'EXPORT', 'IMPORT', 'APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "BusinessUnit" AS ENUM ('POULTRY', 'FEED_MILL', 'SOYA_PROCESSING', 'INVENTORY', 'SALES', 'FINANCE', 'PROCUREMENT', 'MAINTENANCE', 'AI_DECISION_SUPPORT');

-- CreateEnum
CREATE TYPE "DashboardMetricKey" AS ENUM ('TOTAL_BIRDS', 'ACTIVE_FLOCK_BATCHES', 'EGG_PRODUCTION', 'MORTALITY', 'FEED_CONSUMED', 'FEED_PRODUCED', 'SOYA_BEANS_PROCESSED', 'SOYA_OIL_PRODUCED', 'SOYA_CAKE_PRODUCED', 'CURRENT_INVENTORY_VALUE', 'SALES', 'OUTSTANDING_CUSTOMER_DEBT', 'SUPPLIER_DEBT', 'LOW_STOCK_ALERTS', 'PENDING_PRODUCTION_ORDERS', 'PENDING_PURCHASE_APPROVALS', 'MACHINE_MAINTENANCE_ALERTS', 'AI_ALERTS', 'GROSS_PROFIT', 'FARM_PERFORMANCE_INDEX', 'BRANCH_PERFORMANCE_INDEX');

-- CreateEnum
CREATE TYPE "DashboardAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DashboardAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BirdType" AS ENUM ('LAYERS', 'BROILERS', 'COCKERELS', 'BREEDERS', 'CHICKS');

-- CreateEnum
CREATE TYPE "FlockBatchStatus" AS ENUM ('PLANNED', 'ACTIVE', 'TRANSFERRED', 'CLOSED', 'SOLD', 'CULLED');

-- CreateEnum
CREATE TYPE "PoultryRecordStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PoultryTransferStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoultryCostType" AS ENUM ('CHICK_PURCHASE', 'FEED', 'MEDICATION', 'VACCINATION', 'LABOR', 'UTILITIES', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PoultryHealthSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FeedType" AS ENUM ('CHICK_MASH', 'GROWER_MASH', 'LAYER_MASH', 'BROILER_STARTER', 'BROILER_FINISHER', 'BREEDER_FEED', 'CONCENTRATE', 'CUSTOM_FEED');

-- CreateEnum
CREATE TYPE "FeedFormulaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeedProductionOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedProductionBatchStatus" AS ENUM ('PLANNED', 'PRODUCED', 'QUALITY_HOLD', 'APPROVED', 'REJECTED', 'POSTED');

-- CreateEnum
CREATE TYPE "FeedQualityCheckStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'APPROVED');

-- CreateEnum
CREATE TYPE "FeedTransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SoyaQualityStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "SoyaProcessingBatchStatus" AS ENUM ('PLANNED', 'PROCESSING', 'COMPLETED', 'QUALITY_HOLD', 'APPROVED', 'REJECTED', 'POSTED');

-- CreateEnum
CREATE TYPE "SoyaOutputType" AS ENUM ('OIL', 'CAKE');

-- CreateEnum
CREATE TYPE "SoyaTransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SoyaSaleStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockWorkflowStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockAdjustmentType" AS ENUM ('COUNT_CORRECTION', 'DAMAGE', 'EXPIRY', 'WASTE', 'WRITE_OFF', 'FOUND_STOCK');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryValuationMethod" AS ENUM ('FIFO', 'WEIGHTED_AVERAGE');

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "FarmType" NOT NULL DEFAULT 'POULTRY',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionSite" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "ProductionSiteType" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoultryHouse" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PoultryHouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "productionSiteId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL DEFAULT 'GENERAL',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "departmentId" UUID,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" "RoleLevel" NOT NULL DEFAULT 'OFFICER',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "UserBranchAccess" (
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateTable
CREATE TABLE "UserFarmAccess" (
    "userId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFarmAccess_pkey" PRIMARY KEY ("userId","farmId")
);

-- CreateTable
CREATE TABLE "UserWarehouseAccess" (
    "userId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWarehouseAccess_pkey" PRIMARY KEY ("userId","warehouseId")
);

-- CreateTable
CREATE TABLE "UserProductionSiteAccess" (
    "userId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProductionSiteAccess_pkey" PRIMARY KEY ("userId","productionSiteId")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "categoryId" UUID,
    "uomId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'FINISHED_GOOD',
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID NOT NULL,
    "productionSiteId" UUID,
    "productId" UUID NOT NULL,
    "uomId" UUID NOT NULL,
    "status" "InventoryItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "reorderLevel" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "quantityOnHand" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID,
    "warehouseId" UUID NOT NULL,
    "productionSiteId" UUID,
    "productId" UUID NOT NULL,
    "inventoryItemId" UUID,
    "uomId" UUID NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "status" "StockBatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "quantityReceived" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "quantityRemaining" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,4),
    "manufactureDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "inventoryItemId" UUID,
    "stockBatchId" UUID,
    "fromWarehouseId" UUID,
    "toWarehouseId" UUID,
    "fromFarmId" UUID,
    "toFarmId" UUID,
    "fromProductionSiteId" UUID,
    "toProductionSiteId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "uomId" UUID NOT NULL,
    "movementType" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseLocation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productionSiteId" UUID,
    "parentId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WarehouseLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productionSiteId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "adjustmentNumber" TEXT NOT NULL,
    "adjustmentType" "StockAdjustmentType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "reason" TEXT NOT NULL,
    "status" "StockWorkflowStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "movementId" UUID,
    "requestedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "stockBatchId" UUID,
    "transferNumber" TEXT NOT NULL,
    "fromWarehouseId" UUID NOT NULL,
    "toWarehouseId" UUID NOT NULL,
    "fromProductionSiteId" UUID,
    "toProductionSiteId" UUID,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "barcode" TEXT,
    "status" "StockWorkflowStatus" NOT NULL DEFAULT 'COMPLETED',
    "requestedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReorderLevel" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productionSiteId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "minimumQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "maximumQuantity" DECIMAL(18,4),
    "reorderQuantity" DECIMAL(18,4),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockReorderLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockExpiryAlert" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productionSiteId" UUID,
    "inventoryItemId" UUID,
    "stockBatchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "daysToExpiry" INTEGER NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockExpiryAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryValuation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productionSiteId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "valuationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantityOnHand" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalValue" DECIMAL(18,4) NOT NULL,
    "method" "InventoryValuationMethod" NOT NULL DEFAULT 'FIFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InventoryValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "farmId" UUID,
    "productionSiteId" UUID,
    "inventoryItemId" UUID NOT NULL,
    "stockBatchId" UUID,
    "productId" UUID NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "requestedById" UUID,
    "purpose" TEXT,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockApproval" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "approvalNumber" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "StockWorkflowStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlockBatch" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birdType" "BirdType" NOT NULL,
    "openingBirdCount" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expectedCloseDate" TIMESTAMP(3),
    "actualCloseDate" TIMESTAMP(3),
    "status" "FlockBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FlockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPoultryRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "openingBirdCount" INTEGER,
    "mortalityCount" INTEGER NOT NULL DEFAULT 0,
    "culledCount" INTEGER NOT NULL DEFAULT 0,
    "feedConsumedKg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalEggs" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DailyPoultryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MortalityRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "birdCount" INTEGER NOT NULL,
    "isCulling" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "notes" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MortalityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedConsumptionRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "feedProductId" UUID,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "quantityKg" DECIMAL(18,4) NOT NULL,
    "costAmount" DECIMAL(18,4),
    "notes" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedConsumptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EggProductionRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "goodEggs" INTEGER NOT NULL DEFAULT 0,
    "crackedEggs" INTEGER NOT NULL DEFAULT 0,
    "dirtyEggs" INTEGER NOT NULL DEFAULT 0,
    "brokenEggs" INTEGER NOT NULL DEFAULT 0,
    "rejectedEggs" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EggProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BirdWeightRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "averageWeightKg" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BirdWeightRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "route" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "withdrawalUntil" TIMESTAMP(3),
    "notes" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MedicationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccinationRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "vaccinationDate" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VaccinationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoultryTransferRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "fromFarmId" UUID NOT NULL,
    "fromPoultryHouseId" UUID NOT NULL,
    "toFarmId" UUID NOT NULL,
    "toPoultryHouseId" UUID NOT NULL,
    "birdCount" INTEGER NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "status" "PoultryTransferStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PoultryTransferRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoultryHealthObservation" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "observationDate" TIMESTAMP(3) NOT NULL,
    "severity" "PoultryHealthSeverity" NOT NULL DEFAULT 'LOW',
    "observation" TEXT NOT NULL,
    "vetVisitDate" TIMESTAMP(3),
    "veterinarianName" TEXT,
    "recommendation" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PoultryHealthObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoultryCostRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "farmId" UUID NOT NULL,
    "poultryHouseId" UUID NOT NULL,
    "flockBatchId" UUID NOT NULL,
    "costDate" TIMESTAMP(3) NOT NULL,
    "costType" "PoultryCostType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "description" TEXT,
    "status" "PoultryRecordStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PoultryCostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedFormula" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "finishedProductId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feedType" "FeedType" NOT NULL,
    "targetBatchKg" DECIMAL(18,4) NOT NULL DEFAULT 100,
    "status" "FeedFormulaStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionNo" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedFormula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedFormulaIngredient" (
    "id" UUID NOT NULL,
    "formulaId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantityKg" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedFormulaIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedFormulaVersion" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "formulaId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "status" "FeedFormulaStatus" NOT NULL DEFAULT 'ACTIVE',
    "ingredientSnapshot" JSONB NOT NULL,
    "costPer100Kg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "costPer50KgBag" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedFormulaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedProductionOrder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "formulaId" UUID NOT NULL,
    "formulaVersionId" UUID,
    "finishedProductId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "plannedQuantityKg" DECIMAL(18,4) NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "status" "FeedProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedProductionBatch" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "finishedProductId" UUID NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "producedQuantityKg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "wastageKg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "productionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FeedProductionBatchStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedRawMaterialUsage" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "rawMaterialId" UUID NOT NULL,
    "quantityKg" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "wastageKg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedRawMaterialUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedQualityCheck" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "moisturePercent" DECIMAL(18,4),
    "proteinPercent" DECIMAL(18,4),
    "textureNotes" TEXT,
    "status" "FeedQualityCheckStatus" NOT NULL DEFAULT 'PENDING',
    "checkedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedQualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinishedFeedStock" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityKg" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "bag50KgCount" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinishedFeedStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPackagingRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "packageSizeKg" DECIMAL(18,4) NOT NULL DEFAULT 50,
    "packageCount" INTEGER NOT NULL,
    "labelPrinted" BOOLEAN NOT NULL DEFAULT false,
    "packagedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedPackagingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedProductionCost" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "rawMaterialCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expectedSalesValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedProductionCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedInternalTransfer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "fromWarehouseId" UUID NOT NULL,
    "toFarmId" UUID,
    "toPoultryHouseId" UUID,
    "quantityKg" DECIMAL(18,4) NOT NULL,
    "status" "FeedTransferStatus" NOT NULL DEFAULT 'PENDING',
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FeedInternalTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaBeanIntake" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "quantityKg" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "moisturePercent" DECIMAL(18,4),
    "qualityStatus" "SoyaQualityStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaBeanIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaProcessingBatch" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "intakeId" UUID,
    "beanProductId" UUID NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "beansUsedKg" DECIMAL(18,4) NOT NULL,
    "processingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SoyaProcessingBatchStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaProcessingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaOilOutput" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityLitres" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaOilOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaCakeOutput" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityKg" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaCakeOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaWasteRecord" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "quantityKg" DECIMAL(18,4) NOT NULL,
    "reason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaWasteRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaQualityCheck" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "moisturePercent" DECIMAL(18,4),
    "oilPurityPercent" DECIMAL(18,4),
    "cakeProteinPercent" DECIMAL(18,4),
    "status" "SoyaQualityStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "checkedById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaQualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaProductionCost" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "rawBeanCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expectedOilSalesValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expectedCakeSalesValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaProductionCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaInternalTransfer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "outputType" "SoyaOutputType" NOT NULL,
    "fromWarehouseId" UUID NOT NULL,
    "toWarehouseId" UUID NOT NULL,
    "toProductionSiteId" UUID,
    "quantity" DECIMAL(18,4) NOT NULL,
    "status" "SoyaTransferStatus" NOT NULL DEFAULT 'PENDING',
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaInternalTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoyaSalesLink" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionSiteId" UUID NOT NULL,
    "productionBatchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "outputType" "SoyaOutputType" NOT NULL,
    "customerName" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "status" "SoyaSaleStatus" NOT NULL DEFAULT 'POSTED',
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SoyaSalesLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardMetricSnapshot" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "productId" UUID,
    "productCategoryId" UUID,
    "businessUnit" "BusinessUnit" NOT NULL,
    "metricKey" "DashboardMetricKey" NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "value" DECIMAL(18,4) NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DashboardMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardAlert" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "businessUnit" "BusinessUnit" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "DashboardAlertSeverity" NOT NULL DEFAULT 'INFO',
    "status" "DashboardAlertStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DashboardAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "actorUserId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "farmId" UUID,
    "warehouseId" UUID,
    "productionSiteId" UUID,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RolePermissions" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_RolePermissions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Company_status_idx" ON "Company"("status");

-- CreateIndex
CREATE INDEX "Company_createdAt_idx" ON "Company"("createdAt");

-- CreateIndex
CREATE INDEX "Company_deletedAt_idx" ON "Company"("deletedAt");

-- CreateIndex
CREATE INDEX "Branch_companyId_idx" ON "Branch"("companyId");

-- CreateIndex
CREATE INDEX "Branch_companyId_status_idx" ON "Branch"("companyId", "status");

-- CreateIndex
CREATE INDEX "Branch_companyId_createdAt_idx" ON "Branch"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Branch_deletedAt_idx" ON "Branch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE INDEX "Farm_companyId_idx" ON "Farm"("companyId");

-- CreateIndex
CREATE INDEX "Farm_branchId_idx" ON "Farm"("branchId");

-- CreateIndex
CREATE INDEX "Farm_companyId_branchId_idx" ON "Farm"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Farm_companyId_status_idx" ON "Farm"("companyId", "status");

-- CreateIndex
CREATE INDEX "Farm_companyId_createdAt_idx" ON "Farm"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Farm_deletedAt_idx" ON "Farm"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Farm_companyId_code_key" ON "Farm"("companyId", "code");

-- CreateIndex
CREATE INDEX "ProductionSite_companyId_idx" ON "ProductionSite"("companyId");

-- CreateIndex
CREATE INDEX "ProductionSite_branchId_idx" ON "ProductionSite"("branchId");

-- CreateIndex
CREATE INDEX "ProductionSite_companyId_branchId_idx" ON "ProductionSite"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "ProductionSite_companyId_type_idx" ON "ProductionSite"("companyId", "type");

-- CreateIndex
CREATE INDEX "ProductionSite_companyId_status_idx" ON "ProductionSite"("companyId", "status");

-- CreateIndex
CREATE INDEX "ProductionSite_companyId_createdAt_idx" ON "ProductionSite"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionSite_deletedAt_idx" ON "ProductionSite"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionSite_companyId_code_key" ON "ProductionSite"("companyId", "code");

-- CreateIndex
CREATE INDEX "PoultryHouse_companyId_idx" ON "PoultryHouse"("companyId");

-- CreateIndex
CREATE INDEX "PoultryHouse_branchId_idx" ON "PoultryHouse"("branchId");

-- CreateIndex
CREATE INDEX "PoultryHouse_farmId_idx" ON "PoultryHouse"("farmId");

-- CreateIndex
CREATE INDEX "PoultryHouse_companyId_status_idx" ON "PoultryHouse"("companyId", "status");

-- CreateIndex
CREATE INDEX "PoultryHouse_companyId_createdAt_idx" ON "PoultryHouse"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "PoultryHouse_deletedAt_idx" ON "PoultryHouse"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PoultryHouse_companyId_farmId_code_key" ON "PoultryHouse"("companyId", "farmId", "code");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_idx" ON "Warehouse"("companyId");

-- CreateIndex
CREATE INDEX "Warehouse_branchId_idx" ON "Warehouse"("branchId");

-- CreateIndex
CREATE INDEX "Warehouse_farmId_idx" ON "Warehouse"("farmId");

-- CreateIndex
CREATE INDEX "Warehouse_productionSiteId_idx" ON "Warehouse"("productionSiteId");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_branchId_idx" ON "Warehouse"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_status_idx" ON "Warehouse"("companyId", "status");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_createdAt_idx" ON "Warehouse"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Warehouse_deletedAt_idx" ON "Warehouse"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_code_key" ON "Warehouse"("companyId", "code");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_branchId_idx" ON "Department"("branchId");

-- CreateIndex
CREATE INDEX "Department_companyId_status_idx" ON "Department"("companyId", "status");

-- CreateIndex
CREATE INDEX "Department_companyId_createdAt_idx" ON "Department"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_code_key" ON "Department"("companyId", "code");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- CreateIndex
CREATE INDEX "User_farmId_idx" ON "User"("farmId");

-- CreateIndex
CREATE INDEX "User_warehouseId_idx" ON "User"("warehouseId");

-- CreateIndex
CREATE INDEX "User_productionSiteId_idx" ON "User"("productionSiteId");

-- CreateIndex
CREATE INDEX "User_companyId_status_idx" ON "User"("companyId", "status");

-- CreateIndex
CREATE INDEX "User_companyId_createdAt_idx" ON "User"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User"("companyId", "email");

-- CreateIndex
CREATE INDEX "Role_companyId_idx" ON "Role"("companyId");

-- CreateIndex
CREATE INDEX "Role_companyId_level_idx" ON "Role"("companyId", "level");

-- CreateIndex
CREATE INDEX "Role_companyId_status_idx" ON "Role"("companyId", "status");

-- CreateIndex
CREATE INDEX "Role_companyId_createdAt_idx" ON "Role"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Role_deletedAt_idx" ON "Role"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_companyId_name_key" ON "Role"("companyId", "name");

-- CreateIndex
CREATE INDEX "Permission_companyId_idx" ON "Permission"("companyId");

-- CreateIndex
CREATE INDEX "Permission_companyId_module_idx" ON "Permission"("companyId", "module");

-- CreateIndex
CREATE INDEX "Permission_companyId_status_idx" ON "Permission"("companyId", "status");

-- CreateIndex
CREATE INDEX "Permission_companyId_createdAt_idx" ON "Permission"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_companyId_key_key" ON "Permission"("companyId", "key");

-- CreateIndex
CREATE INDEX "UserRole_companyId_idx" ON "UserRole"("companyId");

-- CreateIndex
CREATE INDEX "UserRole_createdAt_idx" ON "UserRole"("createdAt");

-- CreateIndex
CREATE INDEX "UserBranchAccess_companyId_idx" ON "UserBranchAccess"("companyId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_branchId_idx" ON "UserBranchAccess"("branchId");

-- CreateIndex
CREATE INDEX "UserBranchAccess_createdAt_idx" ON "UserBranchAccess"("createdAt");

-- CreateIndex
CREATE INDEX "UserFarmAccess_companyId_idx" ON "UserFarmAccess"("companyId");

-- CreateIndex
CREATE INDEX "UserFarmAccess_farmId_idx" ON "UserFarmAccess"("farmId");

-- CreateIndex
CREATE INDEX "UserFarmAccess_createdAt_idx" ON "UserFarmAccess"("createdAt");

-- CreateIndex
CREATE INDEX "UserWarehouseAccess_companyId_idx" ON "UserWarehouseAccess"("companyId");

-- CreateIndex
CREATE INDEX "UserWarehouseAccess_warehouseId_idx" ON "UserWarehouseAccess"("warehouseId");

-- CreateIndex
CREATE INDEX "UserWarehouseAccess_createdAt_idx" ON "UserWarehouseAccess"("createdAt");

-- CreateIndex
CREATE INDEX "UserProductionSiteAccess_companyId_idx" ON "UserProductionSiteAccess"("companyId");

-- CreateIndex
CREATE INDEX "UserProductionSiteAccess_productionSiteId_idx" ON "UserProductionSiteAccess"("productionSiteId");

-- CreateIndex
CREATE INDEX "UserProductionSiteAccess_createdAt_idx" ON "UserProductionSiteAccess"("createdAt");

-- CreateIndex
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

-- CreateIndex
CREATE INDEX "Product_branchId_idx" ON "Product"("branchId");

-- CreateIndex
CREATE INDEX "Product_companyId_categoryId_idx" ON "Product"("companyId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_companyId_type_idx" ON "Product"("companyId", "type");

-- CreateIndex
CREATE INDEX "Product_companyId_status_idx" ON "Product"("companyId", "status");

-- CreateIndex
CREATE INDEX "Product_companyId_createdAt_idx" ON "Product"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");

-- CreateIndex
CREATE INDEX "ProductCategory_companyId_idx" ON "ProductCategory"("companyId");

-- CreateIndex
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

-- CreateIndex
CREATE INDEX "ProductCategory_companyId_status_idx" ON "ProductCategory"("companyId", "status");

-- CreateIndex
CREATE INDEX "ProductCategory_companyId_createdAt_idx" ON "ProductCategory"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductCategory_deletedAt_idx" ON "ProductCategory"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_companyId_code_key" ON "ProductCategory"("companyId", "code");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_companyId_idx" ON "UnitOfMeasure"("companyId");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_companyId_status_idx" ON "UnitOfMeasure"("companyId", "status");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_companyId_createdAt_idx" ON "UnitOfMeasure"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "UnitOfMeasure_deletedAt_idx" ON "UnitOfMeasure"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_companyId_code_key" ON "UnitOfMeasure"("companyId", "code");

-- CreateIndex
CREATE INDEX "InventoryItem_companyId_idx" ON "InventoryItem"("companyId");

-- CreateIndex
CREATE INDEX "InventoryItem_branchId_idx" ON "InventoryItem"("branchId");

-- CreateIndex
CREATE INDEX "InventoryItem_farmId_idx" ON "InventoryItem"("farmId");

-- CreateIndex
CREATE INDEX "InventoryItem_warehouseId_idx" ON "InventoryItem"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryItem_productionSiteId_idx" ON "InventoryItem"("productionSiteId");

-- CreateIndex
CREATE INDEX "InventoryItem_companyId_status_idx" ON "InventoryItem"("companyId", "status");

-- CreateIndex
CREATE INDEX "InventoryItem_companyId_createdAt_idx" ON "InventoryItem"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryItem_deletedAt_idx" ON "InventoryItem"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_companyId_warehouseId_productId_key" ON "InventoryItem"("companyId", "warehouseId", "productId");

-- CreateIndex
CREATE INDEX "StockBatch_companyId_idx" ON "StockBatch"("companyId");

-- CreateIndex
CREATE INDEX "StockBatch_branchId_idx" ON "StockBatch"("branchId");

-- CreateIndex
CREATE INDEX "StockBatch_farmId_idx" ON "StockBatch"("farmId");

-- CreateIndex
CREATE INDEX "StockBatch_warehouseId_idx" ON "StockBatch"("warehouseId");

-- CreateIndex
CREATE INDEX "StockBatch_productionSiteId_idx" ON "StockBatch"("productionSiteId");

-- CreateIndex
CREATE INDEX "StockBatch_companyId_status_idx" ON "StockBatch"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockBatch_companyId_createdAt_idx" ON "StockBatch"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "StockBatch_deletedAt_idx" ON "StockBatch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_companyId_batchNumber_productId_key" ON "StockBatch"("companyId", "batchNumber", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_idx" ON "StockMovement"("companyId");

-- CreateIndex
CREATE INDEX "StockMovement_branchId_idx" ON "StockMovement"("branchId");

-- CreateIndex
CREATE INDEX "StockMovement_farmId_idx" ON "StockMovement"("farmId");

-- CreateIndex
CREATE INDEX "StockMovement_warehouseId_idx" ON "StockMovement"("warehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_productionSiteId_idx" ON "StockMovement"("productionSiteId");

-- CreateIndex
CREATE INDEX "StockMovement_fromWarehouseId_idx" ON "StockMovement"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_toWarehouseId_idx" ON "StockMovement"("toWarehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_fromFarmId_idx" ON "StockMovement"("fromFarmId");

-- CreateIndex
CREATE INDEX "StockMovement_toFarmId_idx" ON "StockMovement"("toFarmId");

-- CreateIndex
CREATE INDEX "StockMovement_fromProductionSiteId_idx" ON "StockMovement"("fromProductionSiteId");

-- CreateIndex
CREATE INDEX "StockMovement_toProductionSiteId_idx" ON "StockMovement"("toProductionSiteId");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_movementType_idx" ON "StockMovement"("companyId", "movementType");

-- CreateIndex
CREATE INDEX "StockMovement_companyId_createdAt_idx" ON "StockMovement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_movementDate_idx" ON "StockMovement"("movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockMovement_deletedAt_idx" ON "StockMovement"("deletedAt");

-- CreateIndex
CREATE INDEX "WarehouseLocation_companyId_idx" ON "WarehouseLocation"("companyId");

-- CreateIndex
CREATE INDEX "WarehouseLocation_branchId_idx" ON "WarehouseLocation"("branchId");

-- CreateIndex
CREATE INDEX "WarehouseLocation_warehouseId_idx" ON "WarehouseLocation"("warehouseId");

-- CreateIndex
CREATE INDEX "WarehouseLocation_productionSiteId_idx" ON "WarehouseLocation"("productionSiteId");

-- CreateIndex
CREATE INDEX "WarehouseLocation_parentId_idx" ON "WarehouseLocation"("parentId");

-- CreateIndex
CREATE INDEX "WarehouseLocation_barcode_idx" ON "WarehouseLocation"("barcode");

-- CreateIndex
CREATE INDEX "WarehouseLocation_companyId_status_idx" ON "WarehouseLocation"("companyId", "status");

-- CreateIndex
CREATE INDEX "WarehouseLocation_deletedAt_idx" ON "WarehouseLocation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseLocation_companyId_warehouseId_code_key" ON "WarehouseLocation"("companyId", "warehouseId", "code");

-- CreateIndex
CREATE INDEX "StockAdjustment_companyId_idx" ON "StockAdjustment"("companyId");

-- CreateIndex
CREATE INDEX "StockAdjustment_branchId_idx" ON "StockAdjustment"("branchId");

-- CreateIndex
CREATE INDEX "StockAdjustment_warehouseId_idx" ON "StockAdjustment"("warehouseId");

-- CreateIndex
CREATE INDEX "StockAdjustment_productionSiteId_idx" ON "StockAdjustment"("productionSiteId");

-- CreateIndex
CREATE INDEX "StockAdjustment_inventoryItemId_idx" ON "StockAdjustment"("inventoryItemId");

-- CreateIndex
CREATE INDEX "StockAdjustment_productId_idx" ON "StockAdjustment"("productId");

-- CreateIndex
CREATE INDEX "StockAdjustment_companyId_status_idx" ON "StockAdjustment"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockAdjustment_companyId_adjustmentType_idx" ON "StockAdjustment"("companyId", "adjustmentType");

-- CreateIndex
CREATE INDEX "StockAdjustment_createdAt_idx" ON "StockAdjustment"("createdAt");

-- CreateIndex
CREATE INDEX "StockAdjustment_deletedAt_idx" ON "StockAdjustment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_companyId_adjustmentNumber_key" ON "StockAdjustment"("companyId", "adjustmentNumber");

-- CreateIndex
CREATE INDEX "StockTransfer_companyId_idx" ON "StockTransfer"("companyId");

-- CreateIndex
CREATE INDEX "StockTransfer_branchId_idx" ON "StockTransfer"("branchId");

-- CreateIndex
CREATE INDEX "StockTransfer_productId_idx" ON "StockTransfer"("productId");

-- CreateIndex
CREATE INDEX "StockTransfer_stockBatchId_idx" ON "StockTransfer"("stockBatchId");

-- CreateIndex
CREATE INDEX "StockTransfer_fromWarehouseId_idx" ON "StockTransfer"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "StockTransfer_toWarehouseId_idx" ON "StockTransfer"("toWarehouseId");

-- CreateIndex
CREATE INDEX "StockTransfer_fromProductionSiteId_idx" ON "StockTransfer"("fromProductionSiteId");

-- CreateIndex
CREATE INDEX "StockTransfer_toProductionSiteId_idx" ON "StockTransfer"("toProductionSiteId");

-- CreateIndex
CREATE INDEX "StockTransfer_companyId_status_idx" ON "StockTransfer"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockTransfer_transferDate_idx" ON "StockTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "StockTransfer_deletedAt_idx" ON "StockTransfer"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_companyId_transferNumber_key" ON "StockTransfer"("companyId", "transferNumber");

-- CreateIndex
CREATE INDEX "StockReorderLevel_companyId_idx" ON "StockReorderLevel"("companyId");

-- CreateIndex
CREATE INDEX "StockReorderLevel_branchId_idx" ON "StockReorderLevel"("branchId");

-- CreateIndex
CREATE INDEX "StockReorderLevel_warehouseId_idx" ON "StockReorderLevel"("warehouseId");

-- CreateIndex
CREATE INDEX "StockReorderLevel_productionSiteId_idx" ON "StockReorderLevel"("productionSiteId");

-- CreateIndex
CREATE INDEX "StockReorderLevel_inventoryItemId_idx" ON "StockReorderLevel"("inventoryItemId");

-- CreateIndex
CREATE INDEX "StockReorderLevel_productId_idx" ON "StockReorderLevel"("productId");

-- CreateIndex
CREATE INDEX "StockReorderLevel_companyId_status_idx" ON "StockReorderLevel"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockReorderLevel_deletedAt_idx" ON "StockReorderLevel"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockReorderLevel_companyId_warehouseId_productId_key" ON "StockReorderLevel"("companyId", "warehouseId", "productId");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_companyId_idx" ON "StockExpiryAlert"("companyId");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_branchId_idx" ON "StockExpiryAlert"("branchId");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_warehouseId_idx" ON "StockExpiryAlert"("warehouseId");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_productionSiteId_idx" ON "StockExpiryAlert"("productionSiteId");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_inventoryItemId_idx" ON "StockExpiryAlert"("inventoryItemId");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_productId_idx" ON "StockExpiryAlert"("productId");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_expiryDate_idx" ON "StockExpiryAlert"("expiryDate");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_companyId_status_idx" ON "StockExpiryAlert"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockExpiryAlert_deletedAt_idx" ON "StockExpiryAlert"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockExpiryAlert_companyId_stockBatchId_key" ON "StockExpiryAlert"("companyId", "stockBatchId");

-- CreateIndex
CREATE INDEX "InventoryValuation_companyId_idx" ON "InventoryValuation"("companyId");

-- CreateIndex
CREATE INDEX "InventoryValuation_branchId_idx" ON "InventoryValuation"("branchId");

-- CreateIndex
CREATE INDEX "InventoryValuation_warehouseId_idx" ON "InventoryValuation"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryValuation_productionSiteId_idx" ON "InventoryValuation"("productionSiteId");

-- CreateIndex
CREATE INDEX "InventoryValuation_inventoryItemId_idx" ON "InventoryValuation"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryValuation_productId_idx" ON "InventoryValuation"("productId");

-- CreateIndex
CREATE INDEX "InventoryValuation_valuationDate_idx" ON "InventoryValuation"("valuationDate");

-- CreateIndex
CREATE INDEX "InventoryValuation_deletedAt_idx" ON "InventoryValuation"("deletedAt");

-- CreateIndex
CREATE INDEX "StockReservation_companyId_idx" ON "StockReservation"("companyId");

-- CreateIndex
CREATE INDEX "StockReservation_branchId_idx" ON "StockReservation"("branchId");

-- CreateIndex
CREATE INDEX "StockReservation_warehouseId_idx" ON "StockReservation"("warehouseId");

-- CreateIndex
CREATE INDEX "StockReservation_farmId_idx" ON "StockReservation"("farmId");

-- CreateIndex
CREATE INDEX "StockReservation_productionSiteId_idx" ON "StockReservation"("productionSiteId");

-- CreateIndex
CREATE INDEX "StockReservation_inventoryItemId_idx" ON "StockReservation"("inventoryItemId");

-- CreateIndex
CREATE INDEX "StockReservation_stockBatchId_idx" ON "StockReservation"("stockBatchId");

-- CreateIndex
CREATE INDEX "StockReservation_productId_idx" ON "StockReservation"("productId");

-- CreateIndex
CREATE INDEX "StockReservation_companyId_status_idx" ON "StockReservation"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_expiresAt_idx" ON "StockReservation"("expiresAt");

-- CreateIndex
CREATE INDEX "StockReservation_deletedAt_idx" ON "StockReservation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_companyId_reservationNumber_key" ON "StockReservation"("companyId", "reservationNumber");

-- CreateIndex
CREATE INDEX "StockApproval_companyId_idx" ON "StockApproval"("companyId");

-- CreateIndex
CREATE INDEX "StockApproval_branchId_idx" ON "StockApproval"("branchId");

-- CreateIndex
CREATE INDEX "StockApproval_companyId_status_idx" ON "StockApproval"("companyId", "status");

-- CreateIndex
CREATE INDEX "StockApproval_entityType_entityId_idx" ON "StockApproval"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "StockApproval_createdAt_idx" ON "StockApproval"("createdAt");

-- CreateIndex
CREATE INDEX "StockApproval_deletedAt_idx" ON "StockApproval"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockApproval_companyId_approvalNumber_key" ON "StockApproval"("companyId", "approvalNumber");

-- CreateIndex
CREATE INDEX "FlockBatch_companyId_idx" ON "FlockBatch"("companyId");

-- CreateIndex
CREATE INDEX "FlockBatch_branchId_idx" ON "FlockBatch"("branchId");

-- CreateIndex
CREATE INDEX "FlockBatch_farmId_idx" ON "FlockBatch"("farmId");

-- CreateIndex
CREATE INDEX "FlockBatch_poultryHouseId_idx" ON "FlockBatch"("poultryHouseId");

-- CreateIndex
CREATE INDEX "FlockBatch_companyId_birdType_idx" ON "FlockBatch"("companyId", "birdType");

-- CreateIndex
CREATE INDEX "FlockBatch_companyId_status_idx" ON "FlockBatch"("companyId", "status");

-- CreateIndex
CREATE INDEX "FlockBatch_companyId_startDate_idx" ON "FlockBatch"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "FlockBatch_deletedAt_idx" ON "FlockBatch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlockBatch_companyId_code_key" ON "FlockBatch"("companyId", "code");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_companyId_idx" ON "DailyPoultryRecord"("companyId");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_branchId_idx" ON "DailyPoultryRecord"("branchId");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_farmId_idx" ON "DailyPoultryRecord"("farmId");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_poultryHouseId_idx" ON "DailyPoultryRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_flockBatchId_idx" ON "DailyPoultryRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_companyId_status_idx" ON "DailyPoultryRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_companyId_recordDate_idx" ON "DailyPoultryRecord"("companyId", "recordDate");

-- CreateIndex
CREATE INDEX "DailyPoultryRecord_deletedAt_idx" ON "DailyPoultryRecord"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPoultryRecord_companyId_flockBatchId_recordDate_key" ON "DailyPoultryRecord"("companyId", "flockBatchId", "recordDate");

-- CreateIndex
CREATE INDEX "MortalityRecord_companyId_idx" ON "MortalityRecord"("companyId");

-- CreateIndex
CREATE INDEX "MortalityRecord_branchId_idx" ON "MortalityRecord"("branchId");

-- CreateIndex
CREATE INDEX "MortalityRecord_farmId_idx" ON "MortalityRecord"("farmId");

-- CreateIndex
CREATE INDEX "MortalityRecord_poultryHouseId_idx" ON "MortalityRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "MortalityRecord_flockBatchId_idx" ON "MortalityRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "MortalityRecord_companyId_status_idx" ON "MortalityRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "MortalityRecord_companyId_recordDate_idx" ON "MortalityRecord"("companyId", "recordDate");

-- CreateIndex
CREATE INDEX "MortalityRecord_deletedAt_idx" ON "MortalityRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_companyId_idx" ON "FeedConsumptionRecord"("companyId");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_branchId_idx" ON "FeedConsumptionRecord"("branchId");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_farmId_idx" ON "FeedConsumptionRecord"("farmId");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_poultryHouseId_idx" ON "FeedConsumptionRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_flockBatchId_idx" ON "FeedConsumptionRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_feedProductId_idx" ON "FeedConsumptionRecord"("feedProductId");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_companyId_status_idx" ON "FeedConsumptionRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_companyId_recordDate_idx" ON "FeedConsumptionRecord"("companyId", "recordDate");

-- CreateIndex
CREATE INDEX "FeedConsumptionRecord_deletedAt_idx" ON "FeedConsumptionRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "EggProductionRecord_companyId_idx" ON "EggProductionRecord"("companyId");

-- CreateIndex
CREATE INDEX "EggProductionRecord_branchId_idx" ON "EggProductionRecord"("branchId");

-- CreateIndex
CREATE INDEX "EggProductionRecord_farmId_idx" ON "EggProductionRecord"("farmId");

-- CreateIndex
CREATE INDEX "EggProductionRecord_poultryHouseId_idx" ON "EggProductionRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "EggProductionRecord_flockBatchId_idx" ON "EggProductionRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "EggProductionRecord_companyId_status_idx" ON "EggProductionRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "EggProductionRecord_companyId_recordDate_idx" ON "EggProductionRecord"("companyId", "recordDate");

-- CreateIndex
CREATE INDEX "EggProductionRecord_deletedAt_idx" ON "EggProductionRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_companyId_idx" ON "BirdWeightRecord"("companyId");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_branchId_idx" ON "BirdWeightRecord"("branchId");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_farmId_idx" ON "BirdWeightRecord"("farmId");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_poultryHouseId_idx" ON "BirdWeightRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_flockBatchId_idx" ON "BirdWeightRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_companyId_status_idx" ON "BirdWeightRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_companyId_recordDate_idx" ON "BirdWeightRecord"("companyId", "recordDate");

-- CreateIndex
CREATE INDEX "BirdWeightRecord_deletedAt_idx" ON "BirdWeightRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "MedicationRecord_companyId_idx" ON "MedicationRecord"("companyId");

-- CreateIndex
CREATE INDEX "MedicationRecord_branchId_idx" ON "MedicationRecord"("branchId");

-- CreateIndex
CREATE INDEX "MedicationRecord_farmId_idx" ON "MedicationRecord"("farmId");

-- CreateIndex
CREATE INDEX "MedicationRecord_poultryHouseId_idx" ON "MedicationRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "MedicationRecord_flockBatchId_idx" ON "MedicationRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "MedicationRecord_companyId_status_idx" ON "MedicationRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "MedicationRecord_companyId_startDate_idx" ON "MedicationRecord"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "MedicationRecord_deletedAt_idx" ON "MedicationRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "VaccinationRecord_companyId_idx" ON "VaccinationRecord"("companyId");

-- CreateIndex
CREATE INDEX "VaccinationRecord_branchId_idx" ON "VaccinationRecord"("branchId");

-- CreateIndex
CREATE INDEX "VaccinationRecord_farmId_idx" ON "VaccinationRecord"("farmId");

-- CreateIndex
CREATE INDEX "VaccinationRecord_poultryHouseId_idx" ON "VaccinationRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "VaccinationRecord_flockBatchId_idx" ON "VaccinationRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "VaccinationRecord_companyId_status_idx" ON "VaccinationRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "VaccinationRecord_companyId_vaccinationDate_idx" ON "VaccinationRecord"("companyId", "vaccinationDate");

-- CreateIndex
CREATE INDEX "VaccinationRecord_deletedAt_idx" ON "VaccinationRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_companyId_idx" ON "PoultryTransferRecord"("companyId");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_branchId_idx" ON "PoultryTransferRecord"("branchId");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_flockBatchId_idx" ON "PoultryTransferRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_fromFarmId_idx" ON "PoultryTransferRecord"("fromFarmId");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_toFarmId_idx" ON "PoultryTransferRecord"("toFarmId");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_fromPoultryHouseId_idx" ON "PoultryTransferRecord"("fromPoultryHouseId");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_toPoultryHouseId_idx" ON "PoultryTransferRecord"("toPoultryHouseId");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_companyId_status_idx" ON "PoultryTransferRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_companyId_transferDate_idx" ON "PoultryTransferRecord"("companyId", "transferDate");

-- CreateIndex
CREATE INDEX "PoultryTransferRecord_deletedAt_idx" ON "PoultryTransferRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_companyId_idx" ON "PoultryHealthObservation"("companyId");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_branchId_idx" ON "PoultryHealthObservation"("branchId");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_farmId_idx" ON "PoultryHealthObservation"("farmId");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_poultryHouseId_idx" ON "PoultryHealthObservation"("poultryHouseId");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_flockBatchId_idx" ON "PoultryHealthObservation"("flockBatchId");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_companyId_severity_idx" ON "PoultryHealthObservation"("companyId", "severity");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_companyId_status_idx" ON "PoultryHealthObservation"("companyId", "status");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_companyId_observationDate_idx" ON "PoultryHealthObservation"("companyId", "observationDate");

-- CreateIndex
CREATE INDEX "PoultryHealthObservation_deletedAt_idx" ON "PoultryHealthObservation"("deletedAt");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_companyId_idx" ON "PoultryCostRecord"("companyId");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_branchId_idx" ON "PoultryCostRecord"("branchId");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_farmId_idx" ON "PoultryCostRecord"("farmId");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_poultryHouseId_idx" ON "PoultryCostRecord"("poultryHouseId");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_flockBatchId_idx" ON "PoultryCostRecord"("flockBatchId");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_companyId_costType_idx" ON "PoultryCostRecord"("companyId", "costType");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_companyId_status_idx" ON "PoultryCostRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_companyId_costDate_idx" ON "PoultryCostRecord"("companyId", "costDate");

-- CreateIndex
CREATE INDEX "PoultryCostRecord_deletedAt_idx" ON "PoultryCostRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedFormula_companyId_idx" ON "FeedFormula"("companyId");

-- CreateIndex
CREATE INDEX "FeedFormula_branchId_idx" ON "FeedFormula"("branchId");

-- CreateIndex
CREATE INDEX "FeedFormula_finishedProductId_idx" ON "FeedFormula"("finishedProductId");

-- CreateIndex
CREATE INDEX "FeedFormula_companyId_feedType_idx" ON "FeedFormula"("companyId", "feedType");

-- CreateIndex
CREATE INDEX "FeedFormula_companyId_status_idx" ON "FeedFormula"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeedFormula_deletedAt_idx" ON "FeedFormula"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedFormula_companyId_code_key" ON "FeedFormula"("companyId", "code");

-- CreateIndex
CREATE INDEX "FeedFormulaIngredient_companyId_idx" ON "FeedFormulaIngredient"("companyId");

-- CreateIndex
CREATE INDEX "FeedFormulaIngredient_formulaId_idx" ON "FeedFormulaIngredient"("formulaId");

-- CreateIndex
CREATE INDEX "FeedFormulaIngredient_ingredientId_idx" ON "FeedFormulaIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "FeedFormulaIngredient_deletedAt_idx" ON "FeedFormulaIngredient"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedFormulaVersion_companyId_idx" ON "FeedFormulaVersion"("companyId");

-- CreateIndex
CREATE INDEX "FeedFormulaVersion_formulaId_idx" ON "FeedFormulaVersion"("formulaId");

-- CreateIndex
CREATE INDEX "FeedFormulaVersion_companyId_status_idx" ON "FeedFormulaVersion"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeedFormulaVersion_createdAt_idx" ON "FeedFormulaVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedFormulaVersion_formulaId_versionNo_key" ON "FeedFormulaVersion"("formulaId", "versionNo");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_companyId_idx" ON "FeedProductionOrder"("companyId");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_branchId_idx" ON "FeedProductionOrder"("branchId");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_productionSiteId_idx" ON "FeedProductionOrder"("productionSiteId");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_formulaId_idx" ON "FeedProductionOrder"("formulaId");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_finishedProductId_idx" ON "FeedProductionOrder"("finishedProductId");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_companyId_status_idx" ON "FeedProductionOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_scheduledDate_idx" ON "FeedProductionOrder"("scheduledDate");

-- CreateIndex
CREATE INDEX "FeedProductionOrder_deletedAt_idx" ON "FeedProductionOrder"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedProductionOrder_companyId_orderNumber_key" ON "FeedProductionOrder"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_companyId_idx" ON "FeedProductionBatch"("companyId");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_branchId_idx" ON "FeedProductionBatch"("branchId");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_productionSiteId_idx" ON "FeedProductionBatch"("productionSiteId");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_productionOrderId_idx" ON "FeedProductionBatch"("productionOrderId");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_finishedProductId_idx" ON "FeedProductionBatch"("finishedProductId");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_companyId_status_idx" ON "FeedProductionBatch"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_productionDate_idx" ON "FeedProductionBatch"("productionDate");

-- CreateIndex
CREATE INDEX "FeedProductionBatch_deletedAt_idx" ON "FeedProductionBatch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedProductionBatch_companyId_batchNumber_key" ON "FeedProductionBatch"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "FeedRawMaterialUsage_companyId_idx" ON "FeedRawMaterialUsage"("companyId");

-- CreateIndex
CREATE INDEX "FeedRawMaterialUsage_branchId_idx" ON "FeedRawMaterialUsage"("branchId");

-- CreateIndex
CREATE INDEX "FeedRawMaterialUsage_productionSiteId_idx" ON "FeedRawMaterialUsage"("productionSiteId");

-- CreateIndex
CREATE INDEX "FeedRawMaterialUsage_productionBatchId_idx" ON "FeedRawMaterialUsage"("productionBatchId");

-- CreateIndex
CREATE INDEX "FeedRawMaterialUsage_rawMaterialId_idx" ON "FeedRawMaterialUsage"("rawMaterialId");

-- CreateIndex
CREATE INDEX "FeedRawMaterialUsage_deletedAt_idx" ON "FeedRawMaterialUsage"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedQualityCheck_companyId_idx" ON "FeedQualityCheck"("companyId");

-- CreateIndex
CREATE INDEX "FeedQualityCheck_branchId_idx" ON "FeedQualityCheck"("branchId");

-- CreateIndex
CREATE INDEX "FeedQualityCheck_productionSiteId_idx" ON "FeedQualityCheck"("productionSiteId");

-- CreateIndex
CREATE INDEX "FeedQualityCheck_productionBatchId_idx" ON "FeedQualityCheck"("productionBatchId");

-- CreateIndex
CREATE INDEX "FeedQualityCheck_companyId_status_idx" ON "FeedQualityCheck"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeedQualityCheck_checkedAt_idx" ON "FeedQualityCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "FeedQualityCheck_deletedAt_idx" ON "FeedQualityCheck"("deletedAt");

-- CreateIndex
CREATE INDEX "FinishedFeedStock_companyId_idx" ON "FinishedFeedStock"("companyId");

-- CreateIndex
CREATE INDEX "FinishedFeedStock_branchId_idx" ON "FinishedFeedStock"("branchId");

-- CreateIndex
CREATE INDEX "FinishedFeedStock_productionSiteId_idx" ON "FinishedFeedStock"("productionSiteId");

-- CreateIndex
CREATE INDEX "FinishedFeedStock_warehouseId_idx" ON "FinishedFeedStock"("warehouseId");

-- CreateIndex
CREATE INDEX "FinishedFeedStock_productionBatchId_idx" ON "FinishedFeedStock"("productionBatchId");

-- CreateIndex
CREATE INDEX "FinishedFeedStock_productId_idx" ON "FinishedFeedStock"("productId");

-- CreateIndex
CREATE INDEX "FinishedFeedStock_deletedAt_idx" ON "FinishedFeedStock"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedPackagingRecord_companyId_idx" ON "FeedPackagingRecord"("companyId");

-- CreateIndex
CREATE INDEX "FeedPackagingRecord_branchId_idx" ON "FeedPackagingRecord"("branchId");

-- CreateIndex
CREATE INDEX "FeedPackagingRecord_productionSiteId_idx" ON "FeedPackagingRecord"("productionSiteId");

-- CreateIndex
CREATE INDEX "FeedPackagingRecord_productionBatchId_idx" ON "FeedPackagingRecord"("productionBatchId");

-- CreateIndex
CREATE INDEX "FeedPackagingRecord_packagedAt_idx" ON "FeedPackagingRecord"("packagedAt");

-- CreateIndex
CREATE INDEX "FeedPackagingRecord_deletedAt_idx" ON "FeedPackagingRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedProductionCost_companyId_idx" ON "FeedProductionCost"("companyId");

-- CreateIndex
CREATE INDEX "FeedProductionCost_branchId_idx" ON "FeedProductionCost"("branchId");

-- CreateIndex
CREATE INDEX "FeedProductionCost_productionSiteId_idx" ON "FeedProductionCost"("productionSiteId");

-- CreateIndex
CREATE INDEX "FeedProductionCost_productionBatchId_idx" ON "FeedProductionCost"("productionBatchId");

-- CreateIndex
CREATE INDEX "FeedProductionCost_createdAt_idx" ON "FeedProductionCost"("createdAt");

-- CreateIndex
CREATE INDEX "FeedProductionCost_deletedAt_idx" ON "FeedProductionCost"("deletedAt");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_companyId_idx" ON "FeedInternalTransfer"("companyId");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_branchId_idx" ON "FeedInternalTransfer"("branchId");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_productionBatchId_idx" ON "FeedInternalTransfer"("productionBatchId");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_productId_idx" ON "FeedInternalTransfer"("productId");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_fromWarehouseId_idx" ON "FeedInternalTransfer"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_toFarmId_idx" ON "FeedInternalTransfer"("toFarmId");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_toPoultryHouseId_idx" ON "FeedInternalTransfer"("toPoultryHouseId");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_companyId_status_idx" ON "FeedInternalTransfer"("companyId", "status");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_transferDate_idx" ON "FeedInternalTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "FeedInternalTransfer_deletedAt_idx" ON "FeedInternalTransfer"("deletedAt");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_companyId_idx" ON "SoyaBeanIntake"("companyId");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_branchId_idx" ON "SoyaBeanIntake"("branchId");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_productionSiteId_idx" ON "SoyaBeanIntake"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_warehouseId_idx" ON "SoyaBeanIntake"("warehouseId");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_productId_idx" ON "SoyaBeanIntake"("productId");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_companyId_qualityStatus_idx" ON "SoyaBeanIntake"("companyId", "qualityStatus");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_receivedAt_idx" ON "SoyaBeanIntake"("receivedAt");

-- CreateIndex
CREATE INDEX "SoyaBeanIntake_deletedAt_idx" ON "SoyaBeanIntake"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SoyaBeanIntake_companyId_receiptNumber_key" ON "SoyaBeanIntake"("companyId", "receiptNumber");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_companyId_idx" ON "SoyaProcessingBatch"("companyId");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_branchId_idx" ON "SoyaProcessingBatch"("branchId");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_productionSiteId_idx" ON "SoyaProcessingBatch"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_intakeId_idx" ON "SoyaProcessingBatch"("intakeId");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_beanProductId_idx" ON "SoyaProcessingBatch"("beanProductId");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_companyId_status_idx" ON "SoyaProcessingBatch"("companyId", "status");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_processingDate_idx" ON "SoyaProcessingBatch"("processingDate");

-- CreateIndex
CREATE INDEX "SoyaProcessingBatch_deletedAt_idx" ON "SoyaProcessingBatch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SoyaProcessingBatch_companyId_batchNumber_key" ON "SoyaProcessingBatch"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_companyId_idx" ON "SoyaOilOutput"("companyId");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_branchId_idx" ON "SoyaOilOutput"("branchId");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_productionSiteId_idx" ON "SoyaOilOutput"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_productionBatchId_idx" ON "SoyaOilOutput"("productionBatchId");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_warehouseId_idx" ON "SoyaOilOutput"("warehouseId");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_productId_idx" ON "SoyaOilOutput"("productId");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_createdAt_idx" ON "SoyaOilOutput"("createdAt");

-- CreateIndex
CREATE INDEX "SoyaOilOutput_deletedAt_idx" ON "SoyaOilOutput"("deletedAt");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_companyId_idx" ON "SoyaCakeOutput"("companyId");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_branchId_idx" ON "SoyaCakeOutput"("branchId");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_productionSiteId_idx" ON "SoyaCakeOutput"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_productionBatchId_idx" ON "SoyaCakeOutput"("productionBatchId");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_warehouseId_idx" ON "SoyaCakeOutput"("warehouseId");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_productId_idx" ON "SoyaCakeOutput"("productId");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_createdAt_idx" ON "SoyaCakeOutput"("createdAt");

-- CreateIndex
CREATE INDEX "SoyaCakeOutput_deletedAt_idx" ON "SoyaCakeOutput"("deletedAt");

-- CreateIndex
CREATE INDEX "SoyaWasteRecord_companyId_idx" ON "SoyaWasteRecord"("companyId");

-- CreateIndex
CREATE INDEX "SoyaWasteRecord_branchId_idx" ON "SoyaWasteRecord"("branchId");

-- CreateIndex
CREATE INDEX "SoyaWasteRecord_productionSiteId_idx" ON "SoyaWasteRecord"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaWasteRecord_productionBatchId_idx" ON "SoyaWasteRecord"("productionBatchId");

-- CreateIndex
CREATE INDEX "SoyaWasteRecord_createdAt_idx" ON "SoyaWasteRecord"("createdAt");

-- CreateIndex
CREATE INDEX "SoyaWasteRecord_deletedAt_idx" ON "SoyaWasteRecord"("deletedAt");

-- CreateIndex
CREATE INDEX "SoyaQualityCheck_companyId_idx" ON "SoyaQualityCheck"("companyId");

-- CreateIndex
CREATE INDEX "SoyaQualityCheck_branchId_idx" ON "SoyaQualityCheck"("branchId");

-- CreateIndex
CREATE INDEX "SoyaQualityCheck_productionSiteId_idx" ON "SoyaQualityCheck"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaQualityCheck_productionBatchId_idx" ON "SoyaQualityCheck"("productionBatchId");

-- CreateIndex
CREATE INDEX "SoyaQualityCheck_companyId_status_idx" ON "SoyaQualityCheck"("companyId", "status");

-- CreateIndex
CREATE INDEX "SoyaQualityCheck_checkedAt_idx" ON "SoyaQualityCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "SoyaQualityCheck_deletedAt_idx" ON "SoyaQualityCheck"("deletedAt");

-- CreateIndex
CREATE INDEX "SoyaProductionCost_companyId_idx" ON "SoyaProductionCost"("companyId");

-- CreateIndex
CREATE INDEX "SoyaProductionCost_branchId_idx" ON "SoyaProductionCost"("branchId");

-- CreateIndex
CREATE INDEX "SoyaProductionCost_productionSiteId_idx" ON "SoyaProductionCost"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaProductionCost_productionBatchId_idx" ON "SoyaProductionCost"("productionBatchId");

-- CreateIndex
CREATE INDEX "SoyaProductionCost_createdAt_idx" ON "SoyaProductionCost"("createdAt");

-- CreateIndex
CREATE INDEX "SoyaProductionCost_deletedAt_idx" ON "SoyaProductionCost"("deletedAt");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_companyId_idx" ON "SoyaInternalTransfer"("companyId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_branchId_idx" ON "SoyaInternalTransfer"("branchId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_productionSiteId_idx" ON "SoyaInternalTransfer"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_productionBatchId_idx" ON "SoyaInternalTransfer"("productionBatchId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_productId_idx" ON "SoyaInternalTransfer"("productId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_fromWarehouseId_idx" ON "SoyaInternalTransfer"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_toWarehouseId_idx" ON "SoyaInternalTransfer"("toWarehouseId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_toProductionSiteId_idx" ON "SoyaInternalTransfer"("toProductionSiteId");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_companyId_status_idx" ON "SoyaInternalTransfer"("companyId", "status");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_transferDate_idx" ON "SoyaInternalTransfer"("transferDate");

-- CreateIndex
CREATE INDEX "SoyaInternalTransfer_deletedAt_idx" ON "SoyaInternalTransfer"("deletedAt");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_companyId_idx" ON "SoyaSalesLink"("companyId");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_branchId_idx" ON "SoyaSalesLink"("branchId");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_productionSiteId_idx" ON "SoyaSalesLink"("productionSiteId");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_productionBatchId_idx" ON "SoyaSalesLink"("productionBatchId");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_productId_idx" ON "SoyaSalesLink"("productId");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_warehouseId_idx" ON "SoyaSalesLink"("warehouseId");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_companyId_status_idx" ON "SoyaSalesLink"("companyId", "status");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_saleDate_idx" ON "SoyaSalesLink"("saleDate");

-- CreateIndex
CREATE INDEX "SoyaSalesLink_deletedAt_idx" ON "SoyaSalesLink"("deletedAt");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_companyId_idx" ON "DashboardMetricSnapshot"("companyId");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_branchId_idx" ON "DashboardMetricSnapshot"("branchId");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_farmId_idx" ON "DashboardMetricSnapshot"("farmId");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_warehouseId_idx" ON "DashboardMetricSnapshot"("warehouseId");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_productionSiteId_idx" ON "DashboardMetricSnapshot"("productionSiteId");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_productId_idx" ON "DashboardMetricSnapshot"("productId");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_productCategoryId_idx" ON "DashboardMetricSnapshot"("productCategoryId");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_companyId_businessUnit_idx" ON "DashboardMetricSnapshot"("companyId", "businessUnit");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_companyId_metricKey_idx" ON "DashboardMetricSnapshot"("companyId", "metricKey");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_companyId_metricDate_idx" ON "DashboardMetricSnapshot"("companyId", "metricDate");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_companyId_metricKey_metricDate_idx" ON "DashboardMetricSnapshot"("companyId", "metricKey", "metricDate");

-- CreateIndex
CREATE INDEX "DashboardMetricSnapshot_deletedAt_idx" ON "DashboardMetricSnapshot"("deletedAt");

-- CreateIndex
CREATE INDEX "DashboardAlert_companyId_idx" ON "DashboardAlert"("companyId");

-- CreateIndex
CREATE INDEX "DashboardAlert_branchId_idx" ON "DashboardAlert"("branchId");

-- CreateIndex
CREATE INDEX "DashboardAlert_farmId_idx" ON "DashboardAlert"("farmId");

-- CreateIndex
CREATE INDEX "DashboardAlert_warehouseId_idx" ON "DashboardAlert"("warehouseId");

-- CreateIndex
CREATE INDEX "DashboardAlert_productionSiteId_idx" ON "DashboardAlert"("productionSiteId");

-- CreateIndex
CREATE INDEX "DashboardAlert_companyId_businessUnit_idx" ON "DashboardAlert"("companyId", "businessUnit");

-- CreateIndex
CREATE INDEX "DashboardAlert_companyId_severity_idx" ON "DashboardAlert"("companyId", "severity");

-- CreateIndex
CREATE INDEX "DashboardAlert_companyId_status_idx" ON "DashboardAlert"("companyId", "status");

-- CreateIndex
CREATE INDEX "DashboardAlert_companyId_occurredAt_idx" ON "DashboardAlert"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "DashboardAlert_deletedAt_idx" ON "DashboardAlert"("deletedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_companyId_idx" ON "RefreshToken"("companyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_revokedAt_idx" ON "RefreshToken"("revokedAt");

-- CreateIndex
CREATE INDEX "RefreshToken_createdAt_idx" ON "RefreshToken"("createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_branchId_idx" ON "AuditLog"("branchId");

-- CreateIndex
CREATE INDEX "AuditLog_farmId_idx" ON "AuditLog"("farmId");

-- CreateIndex
CREATE INDEX "AuditLog_warehouseId_idx" ON "AuditLog"("warehouseId");

-- CreateIndex
CREATE INDEX "AuditLog_productionSiteId_idx" ON "AuditLog"("productionSiteId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_action_idx" ON "AuditLog"("companyId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entityType_entityId_idx" ON "AuditLog"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SystemSetting_companyId_idx" ON "SystemSetting"("companyId");

-- CreateIndex
CREATE INDEX "SystemSetting_branchId_idx" ON "SystemSetting"("branchId");

-- CreateIndex
CREATE INDEX "SystemSetting_farmId_idx" ON "SystemSetting"("farmId");

-- CreateIndex
CREATE INDEX "SystemSetting_warehouseId_idx" ON "SystemSetting"("warehouseId");

-- CreateIndex
CREATE INDEX "SystemSetting_productionSiteId_idx" ON "SystemSetting"("productionSiteId");

-- CreateIndex
CREATE INDEX "SystemSetting_companyId_status_idx" ON "SystemSetting"("companyId", "status");

-- CreateIndex
CREATE INDEX "SystemSetting_companyId_createdAt_idx" ON "SystemSetting"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemSetting_deletedAt_idx" ON "SystemSetting"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_companyId_branchId_farmId_warehouseId_product_key" ON "SystemSetting"("companyId", "branchId", "farmId", "warehouseId", "productionSiteId", "key");

-- CreateIndex
CREATE INDEX "_RolePermissions_B_index" ON "_RolePermissions"("B");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSite" ADD CONSTRAINT "ProductionSite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSite" ADD CONSTRAINT "ProductionSite_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryHouse" ADD CONSTRAINT "PoultryHouse_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFarmAccess" ADD CONSTRAINT "UserFarmAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFarmAccess" ADD CONSTRAINT "UserFarmAccess_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFarmAccess" ADD CONSTRAINT "UserFarmAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWarehouseAccess" ADD CONSTRAINT "UserWarehouseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWarehouseAccess" ADD CONSTRAINT "UserWarehouseAccess_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWarehouseAccess" ADD CONSTRAINT "UserWarehouseAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProductionSiteAccess" ADD CONSTRAINT "UserProductionSiteAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProductionSiteAccess" ADD CONSTRAINT "UserProductionSiteAccess_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProductionSiteAccess" ADD CONSTRAINT "UserProductionSiteAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromFarmId_fkey" FOREIGN KEY ("fromFarmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toFarmId_fkey" FOREIGN KEY ("toFarmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_fromProductionSiteId_fkey" FOREIGN KEY ("fromProductionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toProductionSiteId_fkey" FOREIGN KEY ("toProductionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromProductionSiteId_fkey" FOREIGN KEY ("fromProductionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toProductionSiteId_fkey" FOREIGN KEY ("toProductionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReorderLevel" ADD CONSTRAINT "StockReorderLevel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReorderLevel" ADD CONSTRAINT "StockReorderLevel_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReorderLevel" ADD CONSTRAINT "StockReorderLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReorderLevel" ADD CONSTRAINT "StockReorderLevel_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReorderLevel" ADD CONSTRAINT "StockReorderLevel_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReorderLevel" ADD CONSTRAINT "StockReorderLevel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExpiryAlert" ADD CONSTRAINT "StockExpiryAlert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExpiryAlert" ADD CONSTRAINT "StockExpiryAlert_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExpiryAlert" ADD CONSTRAINT "StockExpiryAlert_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExpiryAlert" ADD CONSTRAINT "StockExpiryAlert_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExpiryAlert" ADD CONSTRAINT "StockExpiryAlert_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExpiryAlert" ADD CONSTRAINT "StockExpiryAlert_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExpiryAlert" ADD CONSTRAINT "StockExpiryAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuation" ADD CONSTRAINT "InventoryValuation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuation" ADD CONSTRAINT "InventoryValuation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuation" ADD CONSTRAINT "InventoryValuation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuation" ADD CONSTRAINT "InventoryValuation_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuation" ADD CONSTRAINT "InventoryValuation_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryValuation" ADD CONSTRAINT "InventoryValuation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_stockBatchId_fkey" FOREIGN KEY ("stockBatchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockApproval" ADD CONSTRAINT "StockApproval_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockApproval" ADD CONSTRAINT "StockApproval_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockBatch" ADD CONSTRAINT "FlockBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockBatch" ADD CONSTRAINT "FlockBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockBatch" ADD CONSTRAINT "FlockBatch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlockBatch" ADD CONSTRAINT "FlockBatch_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPoultryRecord" ADD CONSTRAINT "DailyPoultryRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPoultryRecord" ADD CONSTRAINT "DailyPoultryRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPoultryRecord" ADD CONSTRAINT "DailyPoultryRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPoultryRecord" ADD CONSTRAINT "DailyPoultryRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPoultryRecord" ADD CONSTRAINT "DailyPoultryRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortalityRecord" ADD CONSTRAINT "MortalityRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortalityRecord" ADD CONSTRAINT "MortalityRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortalityRecord" ADD CONSTRAINT "MortalityRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortalityRecord" ADD CONSTRAINT "MortalityRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortalityRecord" ADD CONSTRAINT "MortalityRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedConsumptionRecord" ADD CONSTRAINT "FeedConsumptionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedConsumptionRecord" ADD CONSTRAINT "FeedConsumptionRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedConsumptionRecord" ADD CONSTRAINT "FeedConsumptionRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedConsumptionRecord" ADD CONSTRAINT "FeedConsumptionRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedConsumptionRecord" ADD CONSTRAINT "FeedConsumptionRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedConsumptionRecord" ADD CONSTRAINT "FeedConsumptionRecord_feedProductId_fkey" FOREIGN KEY ("feedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EggProductionRecord" ADD CONSTRAINT "EggProductionRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EggProductionRecord" ADD CONSTRAINT "EggProductionRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EggProductionRecord" ADD CONSTRAINT "EggProductionRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EggProductionRecord" ADD CONSTRAINT "EggProductionRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EggProductionRecord" ADD CONSTRAINT "EggProductionRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirdWeightRecord" ADD CONSTRAINT "BirdWeightRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirdWeightRecord" ADD CONSTRAINT "BirdWeightRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirdWeightRecord" ADD CONSTRAINT "BirdWeightRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirdWeightRecord" ADD CONSTRAINT "BirdWeightRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BirdWeightRecord" ADD CONSTRAINT "BirdWeightRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRecord" ADD CONSTRAINT "MedicationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRecord" ADD CONSTRAINT "MedicationRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRecord" ADD CONSTRAINT "MedicationRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRecord" ADD CONSTRAINT "MedicationRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRecord" ADD CONSTRAINT "MedicationRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryTransferRecord" ADD CONSTRAINT "PoultryTransferRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryTransferRecord" ADD CONSTRAINT "PoultryTransferRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryTransferRecord" ADD CONSTRAINT "PoultryTransferRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryTransferRecord" ADD CONSTRAINT "PoultryTransferRecord_fromFarmId_fkey" FOREIGN KEY ("fromFarmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryTransferRecord" ADD CONSTRAINT "PoultryTransferRecord_toFarmId_fkey" FOREIGN KEY ("toFarmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryTransferRecord" ADD CONSTRAINT "PoultryTransferRecord_fromPoultryHouseId_fkey" FOREIGN KEY ("fromPoultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryTransferRecord" ADD CONSTRAINT "PoultryTransferRecord_toPoultryHouseId_fkey" FOREIGN KEY ("toPoultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryHealthObservation" ADD CONSTRAINT "PoultryHealthObservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryHealthObservation" ADD CONSTRAINT "PoultryHealthObservation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryHealthObservation" ADD CONSTRAINT "PoultryHealthObservation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryHealthObservation" ADD CONSTRAINT "PoultryHealthObservation_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryHealthObservation" ADD CONSTRAINT "PoultryHealthObservation_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryCostRecord" ADD CONSTRAINT "PoultryCostRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryCostRecord" ADD CONSTRAINT "PoultryCostRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryCostRecord" ADD CONSTRAINT "PoultryCostRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryCostRecord" ADD CONSTRAINT "PoultryCostRecord_poultryHouseId_fkey" FOREIGN KEY ("poultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoultryCostRecord" ADD CONSTRAINT "PoultryCostRecord_flockBatchId_fkey" FOREIGN KEY ("flockBatchId") REFERENCES "FlockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFormula" ADD CONSTRAINT "FeedFormula_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFormula" ADD CONSTRAINT "FeedFormula_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFormula" ADD CONSTRAINT "FeedFormula_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFormulaIngredient" ADD CONSTRAINT "FeedFormulaIngredient_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "FeedFormula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFormulaIngredient" ADD CONSTRAINT "FeedFormulaIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFormulaVersion" ADD CONSTRAINT "FeedFormulaVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedFormulaVersion" ADD CONSTRAINT "FeedFormulaVersion_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "FeedFormula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionOrder" ADD CONSTRAINT "FeedProductionOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionOrder" ADD CONSTRAINT "FeedProductionOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionOrder" ADD CONSTRAINT "FeedProductionOrder_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionOrder" ADD CONSTRAINT "FeedProductionOrder_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "FeedFormula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionOrder" ADD CONSTRAINT "FeedProductionOrder_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "FeedFormulaVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionOrder" ADD CONSTRAINT "FeedProductionOrder_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionBatch" ADD CONSTRAINT "FeedProductionBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionBatch" ADD CONSTRAINT "FeedProductionBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionBatch" ADD CONSTRAINT "FeedProductionBatch_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionBatch" ADD CONSTRAINT "FeedProductionBatch_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "FeedProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionBatch" ADD CONSTRAINT "FeedProductionBatch_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRawMaterialUsage" ADD CONSTRAINT "FeedRawMaterialUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRawMaterialUsage" ADD CONSTRAINT "FeedRawMaterialUsage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRawMaterialUsage" ADD CONSTRAINT "FeedRawMaterialUsage_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRawMaterialUsage" ADD CONSTRAINT "FeedRawMaterialUsage_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "FeedProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRawMaterialUsage" ADD CONSTRAINT "FeedRawMaterialUsage_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedQualityCheck" ADD CONSTRAINT "FeedQualityCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedQualityCheck" ADD CONSTRAINT "FeedQualityCheck_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedQualityCheck" ADD CONSTRAINT "FeedQualityCheck_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedQualityCheck" ADD CONSTRAINT "FeedQualityCheck_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "FeedProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedFeedStock" ADD CONSTRAINT "FinishedFeedStock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedFeedStock" ADD CONSTRAINT "FinishedFeedStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedFeedStock" ADD CONSTRAINT "FinishedFeedStock_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedFeedStock" ADD CONSTRAINT "FinishedFeedStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedFeedStock" ADD CONSTRAINT "FinishedFeedStock_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "FeedProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedFeedStock" ADD CONSTRAINT "FinishedFeedStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPackagingRecord" ADD CONSTRAINT "FeedPackagingRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPackagingRecord" ADD CONSTRAINT "FeedPackagingRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPackagingRecord" ADD CONSTRAINT "FeedPackagingRecord_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPackagingRecord" ADD CONSTRAINT "FeedPackagingRecord_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "FeedProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionCost" ADD CONSTRAINT "FeedProductionCost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionCost" ADD CONSTRAINT "FeedProductionCost_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionCost" ADD CONSTRAINT "FeedProductionCost_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProductionCost" ADD CONSTRAINT "FeedProductionCost_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "FeedProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedInternalTransfer" ADD CONSTRAINT "FeedInternalTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedInternalTransfer" ADD CONSTRAINT "FeedInternalTransfer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedInternalTransfer" ADD CONSTRAINT "FeedInternalTransfer_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "FeedProductionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedInternalTransfer" ADD CONSTRAINT "FeedInternalTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedInternalTransfer" ADD CONSTRAINT "FeedInternalTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedInternalTransfer" ADD CONSTRAINT "FeedInternalTransfer_toFarmId_fkey" FOREIGN KEY ("toFarmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedInternalTransfer" ADD CONSTRAINT "FeedInternalTransfer_toPoultryHouseId_fkey" FOREIGN KEY ("toPoultryHouseId") REFERENCES "PoultryHouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaBeanIntake" ADD CONSTRAINT "SoyaBeanIntake_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaBeanIntake" ADD CONSTRAINT "SoyaBeanIntake_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaBeanIntake" ADD CONSTRAINT "SoyaBeanIntake_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaBeanIntake" ADD CONSTRAINT "SoyaBeanIntake_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaBeanIntake" ADD CONSTRAINT "SoyaBeanIntake_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProcessingBatch" ADD CONSTRAINT "SoyaProcessingBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProcessingBatch" ADD CONSTRAINT "SoyaProcessingBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProcessingBatch" ADD CONSTRAINT "SoyaProcessingBatch_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProcessingBatch" ADD CONSTRAINT "SoyaProcessingBatch_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "SoyaBeanIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProcessingBatch" ADD CONSTRAINT "SoyaProcessingBatch_beanProductId_fkey" FOREIGN KEY ("beanProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaOilOutput" ADD CONSTRAINT "SoyaOilOutput_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaOilOutput" ADD CONSTRAINT "SoyaOilOutput_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaOilOutput" ADD CONSTRAINT "SoyaOilOutput_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaOilOutput" ADD CONSTRAINT "SoyaOilOutput_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "SoyaProcessingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaOilOutput" ADD CONSTRAINT "SoyaOilOutput_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaOilOutput" ADD CONSTRAINT "SoyaOilOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaCakeOutput" ADD CONSTRAINT "SoyaCakeOutput_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaCakeOutput" ADD CONSTRAINT "SoyaCakeOutput_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaCakeOutput" ADD CONSTRAINT "SoyaCakeOutput_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaCakeOutput" ADD CONSTRAINT "SoyaCakeOutput_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "SoyaProcessingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaCakeOutput" ADD CONSTRAINT "SoyaCakeOutput_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaCakeOutput" ADD CONSTRAINT "SoyaCakeOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaWasteRecord" ADD CONSTRAINT "SoyaWasteRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaWasteRecord" ADD CONSTRAINT "SoyaWasteRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaWasteRecord" ADD CONSTRAINT "SoyaWasteRecord_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaWasteRecord" ADD CONSTRAINT "SoyaWasteRecord_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "SoyaProcessingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaQualityCheck" ADD CONSTRAINT "SoyaQualityCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaQualityCheck" ADD CONSTRAINT "SoyaQualityCheck_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaQualityCheck" ADD CONSTRAINT "SoyaQualityCheck_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaQualityCheck" ADD CONSTRAINT "SoyaQualityCheck_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "SoyaProcessingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProductionCost" ADD CONSTRAINT "SoyaProductionCost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProductionCost" ADD CONSTRAINT "SoyaProductionCost_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProductionCost" ADD CONSTRAINT "SoyaProductionCost_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaProductionCost" ADD CONSTRAINT "SoyaProductionCost_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "SoyaProcessingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "SoyaProcessingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaInternalTransfer" ADD CONSTRAINT "SoyaInternalTransfer_toProductionSiteId_fkey" FOREIGN KEY ("toProductionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaSalesLink" ADD CONSTRAINT "SoyaSalesLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaSalesLink" ADD CONSTRAINT "SoyaSalesLink_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaSalesLink" ADD CONSTRAINT "SoyaSalesLink_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaSalesLink" ADD CONSTRAINT "SoyaSalesLink_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "SoyaProcessingBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaSalesLink" ADD CONSTRAINT "SoyaSalesLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoyaSalesLink" ADD CONSTRAINT "SoyaSalesLink_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetricSnapshot" ADD CONSTRAINT "DashboardMetricSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetricSnapshot" ADD CONSTRAINT "DashboardMetricSnapshot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetricSnapshot" ADD CONSTRAINT "DashboardMetricSnapshot_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetricSnapshot" ADD CONSTRAINT "DashboardMetricSnapshot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetricSnapshot" ADD CONSTRAINT "DashboardMetricSnapshot_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetricSnapshot" ADD CONSTRAINT "DashboardMetricSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardMetricSnapshot" ADD CONSTRAINT "DashboardMetricSnapshot_productCategoryId_fkey" FOREIGN KEY ("productCategoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardAlert" ADD CONSTRAINT "DashboardAlert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardAlert" ADD CONSTRAINT "DashboardAlert_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardAlert" ADD CONSTRAINT "DashboardAlert_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardAlert" ADD CONSTRAINT "DashboardAlert_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardAlert" ADD CONSTRAINT "DashboardAlert_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "ProductionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissions" ADD CONSTRAINT "_RolePermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissions" ADD CONSTRAINT "_RolePermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

