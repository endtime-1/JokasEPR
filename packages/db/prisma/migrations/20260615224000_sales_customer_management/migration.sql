-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'PENDING_STOCK_APPROVAL', 'APPROVED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'POSTED');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('PENDING_RELEASE', 'RELEASED', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomerGroup" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerGroupId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCreditLimit" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "creditLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CustomerCreditLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "customerGroupId" UUID,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'PENDING_STOCK_APPROVAL',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "salespersonId" UUID,
    "stockApprovedById" UUID,
    "stockApprovedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "salesOrderId" UUID,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balanceDue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "invoiceId" UUID,
    "paymentNumber" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(18,4) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED',
    "reference" TEXT,
    "receivedById" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "invoiceId" UUID,
    "paymentId" UUID,
    "receiptNumber" TEXT NOT NULL,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(18,4) NOT NULL,
    "issuedById" UUID,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "salesOrderId" UUID,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SalesReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerStatement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "invoiceId" UUID,
    "paymentId" UUID,
    "salesReturnId" UUID,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryType" TEXT NOT NULL,
    "debit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCommission" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "salespersonId" UUID NOT NULL,
    "commissionRate" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "SalesCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "deliveryNumber" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'PENDING_RELEASE',
    "releasedById" UUID,
    "deliveredAt" TIMESTAMP(3),
    "recipientName" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGroup_companyId_code_key" ON "CustomerGroup"("companyId", "code");
CREATE INDEX "CustomerGroup_companyId_idx" ON "CustomerGroup"("companyId");
CREATE INDEX "CustomerGroup_branchId_idx" ON "CustomerGroup"("branchId");
CREATE INDEX "CustomerGroup_companyId_status_idx" ON "CustomerGroup"("companyId", "status");
CREATE INDEX "CustomerGroup_companyId_createdAt_idx" ON "CustomerGroup"("companyId", "createdAt");
CREATE INDEX "CustomerGroup_deletedAt_idx" ON "CustomerGroup"("deletedAt");

CREATE UNIQUE INDEX "Customer_companyId_code_key" ON "Customer"("companyId", "code");
CREATE INDEX "Customer_companyId_idx" ON "Customer"("companyId");
CREATE INDEX "Customer_branchId_idx" ON "Customer"("branchId");
CREATE INDEX "Customer_customerGroupId_idx" ON "Customer"("customerGroupId");
CREATE INDEX "Customer_companyId_status_idx" ON "Customer"("companyId", "status");
CREATE INDEX "Customer_companyId_createdAt_idx" ON "Customer"("companyId", "createdAt");
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

CREATE UNIQUE INDEX "CustomerCreditLimit_companyId_customerId_key" ON "CustomerCreditLimit"("companyId", "customerId");
CREATE INDEX "CustomerCreditLimit_companyId_idx" ON "CustomerCreditLimit"("companyId");
CREATE INDEX "CustomerCreditLimit_branchId_idx" ON "CustomerCreditLimit"("branchId");
CREATE INDEX "CustomerCreditLimit_customerId_idx" ON "CustomerCreditLimit"("customerId");
CREATE INDEX "CustomerCreditLimit_companyId_status_idx" ON "CustomerCreditLimit"("companyId", "status");
CREATE INDEX "CustomerCreditLimit_companyId_createdAt_idx" ON "CustomerCreditLimit"("companyId", "createdAt");
CREATE INDEX "CustomerCreditLimit_deletedAt_idx" ON "CustomerCreditLimit"("deletedAt");

CREATE INDEX "PriceList_companyId_idx" ON "PriceList"("companyId");
CREATE INDEX "PriceList_branchId_idx" ON "PriceList"("branchId");
CREATE INDEX "PriceList_customerGroupId_idx" ON "PriceList"("customerGroupId");
CREATE INDEX "PriceList_productId_idx" ON "PriceList"("productId");
CREATE INDEX "PriceList_companyId_status_idx" ON "PriceList"("companyId", "status");
CREATE INDEX "PriceList_validFrom_idx" ON "PriceList"("validFrom");
CREATE INDEX "PriceList_validTo_idx" ON "PriceList"("validTo");
CREATE INDEX "PriceList_deletedAt_idx" ON "PriceList"("deletedAt");

CREATE UNIQUE INDEX "SalesOrder_companyId_orderNumber_key" ON "SalesOrder"("companyId", "orderNumber");
CREATE INDEX "SalesOrder_companyId_idx" ON "SalesOrder"("companyId");
CREATE INDEX "SalesOrder_branchId_idx" ON "SalesOrder"("branchId");
CREATE INDEX "SalesOrder_customerId_idx" ON "SalesOrder"("customerId");
CREATE INDEX "SalesOrder_warehouseId_idx" ON "SalesOrder"("warehouseId");
CREATE INDEX "SalesOrder_salespersonId_idx" ON "SalesOrder"("salespersonId");
CREATE INDEX "SalesOrder_companyId_status_idx" ON "SalesOrder"("companyId", "status");
CREATE INDEX "SalesOrder_orderDate_idx" ON "SalesOrder"("orderDate");
CREATE INDEX "SalesOrder_companyId_createdAt_idx" ON "SalesOrder"("companyId", "createdAt");
CREATE INDEX "SalesOrder_deletedAt_idx" ON "SalesOrder"("deletedAt");

CREATE INDEX "SalesOrderItem_companyId_idx" ON "SalesOrderItem"("companyId");
CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON "SalesOrderItem"("salesOrderId");
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");
CREATE INDEX "SalesOrderItem_createdAt_idx" ON "SalesOrderItem"("createdAt");

CREATE UNIQUE INDEX "Invoice_companyId_invoiceNumber_key" ON "Invoice"("companyId", "invoiceNumber");
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");
CREATE INDEX "Invoice_branchId_idx" ON "Invoice"("branchId");
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
CREATE INDEX "Invoice_salesOrderId_idx" ON "Invoice"("salesOrderId");
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");
CREATE INDEX "Invoice_companyId_createdAt_idx" ON "Invoice"("companyId", "createdAt");
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");

CREATE UNIQUE INDEX "Payment_companyId_paymentNumber_key" ON "Payment"("companyId", "paymentNumber");
CREATE INDEX "Payment_companyId_idx" ON "Payment"("companyId");
CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
CREATE INDEX "Payment_companyId_status_idx" ON "Payment"("companyId", "status");
CREATE INDEX "Payment_paymentDate_idx" ON "Payment"("paymentDate");
CREATE INDEX "Payment_companyId_createdAt_idx" ON "Payment"("companyId", "createdAt");
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");

CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");
CREATE UNIQUE INDEX "Receipt_companyId_receiptNumber_key" ON "Receipt"("companyId", "receiptNumber");
CREATE INDEX "Receipt_companyId_idx" ON "Receipt"("companyId");
CREATE INDEX "Receipt_branchId_idx" ON "Receipt"("branchId");
CREATE INDEX "Receipt_customerId_idx" ON "Receipt"("customerId");
CREATE INDEX "Receipt_invoiceId_idx" ON "Receipt"("invoiceId");
CREATE INDEX "Receipt_receiptDate_idx" ON "Receipt"("receiptDate");
CREATE INDEX "Receipt_companyId_createdAt_idx" ON "Receipt"("companyId", "createdAt");
CREATE INDEX "Receipt_deletedAt_idx" ON "Receipt"("deletedAt");

CREATE INDEX "SalesReturn_companyId_idx" ON "SalesReturn"("companyId");
CREATE INDEX "SalesReturn_branchId_idx" ON "SalesReturn"("branchId");
CREATE INDEX "SalesReturn_customerId_idx" ON "SalesReturn"("customerId");
CREATE INDEX "SalesReturn_salesOrderId_idx" ON "SalesReturn"("salesOrderId");
CREATE INDEX "SalesReturn_productId_idx" ON "SalesReturn"("productId");
CREATE INDEX "SalesReturn_warehouseId_idx" ON "SalesReturn"("warehouseId");
CREATE INDEX "SalesReturn_companyId_status_idx" ON "SalesReturn"("companyId", "status");
CREATE INDEX "SalesReturn_companyId_createdAt_idx" ON "SalesReturn"("companyId", "createdAt");
CREATE INDEX "SalesReturn_deletedAt_idx" ON "SalesReturn"("deletedAt");

CREATE INDEX "CustomerStatement_companyId_idx" ON "CustomerStatement"("companyId");
CREATE INDEX "CustomerStatement_branchId_idx" ON "CustomerStatement"("branchId");
CREATE INDEX "CustomerStatement_customerId_idx" ON "CustomerStatement"("customerId");
CREATE INDEX "CustomerStatement_invoiceId_idx" ON "CustomerStatement"("invoiceId");
CREATE INDEX "CustomerStatement_paymentId_idx" ON "CustomerStatement"("paymentId");
CREATE INDEX "CustomerStatement_salesReturnId_idx" ON "CustomerStatement"("salesReturnId");
CREATE INDEX "CustomerStatement_entryDate_idx" ON "CustomerStatement"("entryDate");
CREATE INDEX "CustomerStatement_companyId_createdAt_idx" ON "CustomerStatement"("companyId", "createdAt");

CREATE INDEX "SalesCommission_companyId_idx" ON "SalesCommission"("companyId");
CREATE INDEX "SalesCommission_branchId_idx" ON "SalesCommission"("branchId");
CREATE INDEX "SalesCommission_salesOrderId_idx" ON "SalesCommission"("salesOrderId");
CREATE INDEX "SalesCommission_salespersonId_idx" ON "SalesCommission"("salespersonId");
CREATE INDEX "SalesCommission_companyId_status_idx" ON "SalesCommission"("companyId", "status");
CREATE INDEX "SalesCommission_companyId_createdAt_idx" ON "SalesCommission"("companyId", "createdAt");
CREATE INDEX "SalesCommission_deletedAt_idx" ON "SalesCommission"("deletedAt");

CREATE UNIQUE INDEX "DeliveryNote_companyId_deliveryNumber_key" ON "DeliveryNote"("companyId", "deliveryNumber");
CREATE INDEX "DeliveryNote_companyId_idx" ON "DeliveryNote"("companyId");
CREATE INDEX "DeliveryNote_branchId_idx" ON "DeliveryNote"("branchId");
CREATE INDEX "DeliveryNote_salesOrderId_idx" ON "DeliveryNote"("salesOrderId");
CREATE INDEX "DeliveryNote_warehouseId_idx" ON "DeliveryNote"("warehouseId");
CREATE INDEX "DeliveryNote_companyId_status_idx" ON "DeliveryNote"("companyId", "status");
CREATE INDEX "DeliveryNote_deliveryDate_idx" ON "DeliveryNote"("deliveryDate");
CREATE INDEX "DeliveryNote_companyId_createdAt_idx" ON "DeliveryNote"("companyId", "createdAt");
CREATE INDEX "DeliveryNote_deletedAt_idx" ON "DeliveryNote"("deletedAt");

-- AddForeignKey
ALTER TABLE "CustomerGroup" ADD CONSTRAINT "CustomerGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerGroup" ADD CONSTRAINT "CustomerGroup_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerCreditLimit" ADD CONSTRAINT "CustomerCreditLimit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerCreditLimit" ADD CONSTRAINT "CustomerCreditLimit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerCreditLimit" ADD CONSTRAINT "CustomerCreditLimit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PriceList" ADD CONSTRAINT "PriceList_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerStatement" ADD CONSTRAINT "CustomerStatement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerStatement" ADD CONSTRAINT "CustomerStatement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerStatement" ADD CONSTRAINT "CustomerStatement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerStatement" ADD CONSTRAINT "CustomerStatement_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerStatement" ADD CONSTRAINT "CustomerStatement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerStatement" ADD CONSTRAINT "CustomerStatement_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesCommission" ADD CONSTRAINT "SalesCommission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesCommission" ADD CONSTRAINT "SalesCommission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesCommission" ADD CONSTRAINT "SalesCommission_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

