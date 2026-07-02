-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'UNPAID');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId"     UUID NOT NULL,
    "employeeId"    UUID,
    "employeeName"  VARCHAR(160) NOT NULL,
    "employeeCode"  VARCHAR(30),
    "reference"     VARCHAR(30) NOT NULL,
    "leaveType"     "LeaveType" NOT NULL,
    "startDate"     TIMESTAMP(3) NOT NULL,
    "endDate"       TIMESTAMP(3) NOT NULL,
    "daysRequested" INTEGER NOT NULL,
    "reason"        VARCHAR(500),
    "status"        "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById"  UUID,
    "reviewNote"    VARCHAR(500),
    "reviewedAt"    TIMESTAMP(3),
    "createdById"   UUID,
    "updatedById"   UUID,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "deletedAt"     TIMESTAMP(3),

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_companyId_reference_key" ON "LeaveRequest"("companyId", "reference");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_idx" ON "LeaveRequest"("companyId");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_status_idx" ON "LeaveRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_employeeId_idx" ON "LeaveRequest"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_deletedAt_idx" ON "LeaveRequest"("deletedAt");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
