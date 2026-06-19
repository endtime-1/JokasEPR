import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

enum PurchaseRequestStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CONVERTED_TO_PO = "CONVERTED_TO_PO",
  CANCELLED = "CANCELLED",
}

enum PurchaseOrderStatus {
  DRAFT = "DRAFT",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  SENT_TO_SUPPLIER = "SENT_TO_SUPPLIER",
  PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED",
  FULLY_RECEIVED = "FULLY_RECEIVED",
  CANCELLED = "CANCELLED",
}

enum GRNStatus {
  DRAFT = "DRAFT",
  RECEIVED = "RECEIVED",
  QUALITY_HOLD = "QUALITY_HOLD",
  QUALITY_PASSED = "QUALITY_PASSED",
  QUALITY_FAILED = "QUALITY_FAILED",
  POSTED = "POSTED",
}

enum SupplierStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  BLACKLISTED = "BLACKLISTED",
  UNDER_REVIEW = "UNDER_REVIEW",
}

export class ProcurementQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}

export class CreateSupplierCategoryDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(24) code!: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateSupplierDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsString() @MaxLength(24) code!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @IsOptional() @IsInt() @Min(0) paymentTermsDays?: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsEnum(SupplierStatus) status?: SupplierStatus;
  @IsOptional() @IsInt() @Min(0) leadTimeDays?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(40) taxId?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @IsOptional() @IsInt() @Min(0) paymentTermsDays?: number;
  @IsOptional() @IsEnum(SupplierStatus) status?: SupplierStatus;
  @IsOptional() @IsInt() @Min(0) leadTimeDays?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class PurchaseRequestItemDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsString() @MaxLength(160) productName!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedUnitCost?: number;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsInt() @Min(1) sequence?: number;
}

export class CreatePurchaseRequestDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() requiredDate?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseRequestItemDto) items!: PurchaseRequestItemDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ApprovePurchaseRequestDto {
  @IsOptional() @IsString() @MaxLength(500) comments?: string;
}

export class RejectPurchaseRequestDto {
  @IsString() @MaxLength(240) reason!: string;
}

export class PurchaseOrderItemDto {
  @IsOptional() @IsUUID() productId?: string;
  @IsString() @MaxLength(160) productName!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsInt() @Min(1) sequence?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() purchaseRequestId?: string;
  @IsOptional() @IsDateString() expectedDelivery?: string;
  @IsOptional() @IsString() @MaxLength(300) deliveryAddress?: string;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsOptional() @IsInt() @Min(0) paymentTermsDays?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseOrderItemDto) items!: PurchaseOrderItemDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ApprovePurchaseOrderDto {
  @IsOptional() @IsString() @MaxLength(500) comments?: string;
}

export class RejectPurchaseOrderDto {
  @IsString() @MaxLength(240) reason!: string;
}

export class GoodsReceivedItemDto {
  @IsOptional() @IsUUID() purchaseOrderItemId?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsString() @MaxLength(160) productName!: string;
  @IsNumber() @Min(0) orderedQty!: number;
  @IsNumber() @Min(0) receivedQty!: number;
  @IsOptional() @IsNumber() @Min(0) rejectedQty?: number;
  @IsNumber() @Min(0) unitCost!: number;
  @IsOptional() @IsString() @MaxLength(10) uomCode?: string;
  @IsOptional() @IsString() @MaxLength(60) batchNumber?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(30) qualityStatus?: string;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
  @IsOptional() @IsInt() @Min(1) sequence?: number;
}

export class CreateGRNDto {
  @IsUUID() purchaseOrderId!: string;
  @IsUUID() warehouseId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsDateString() receivedDate?: string;
  @IsOptional() @IsString() @MaxLength(60) deliveryNoteRef?: string;
  @IsOptional() @IsBoolean() qualityCheckRequired?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GoodsReceivedItemDto) items!: GoodsReceivedItemDto[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class QualityPassGRNDto {
  @IsOptional() @IsString() @MaxLength(500) qualityNotes?: string;
}

export class QualityFailGRNDto {
  @IsString() @MaxLength(500) qualityNotes!: string;
}

export class CreateSupplierInvoiceDto {
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() purchaseOrderId?: string;
  @IsString() @MaxLength(60) invoiceNumber!: string;
  @IsDateString() invoiceDate!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsNumber() @Min(0) subtotal!: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreateProcurementPaymentDto {
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() paymentDate!: string;
  @IsString() paymentMethod!: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsString() @MaxLength(240) description!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePerformanceRecordDto {
  @IsUUID() supplierId!: string;
  @IsString() @MaxLength(10) period!: string;
  @IsString() rating!: string;
  @IsOptional() @IsBoolean() onTimeDelivery?: boolean;
  @IsInt() @Min(0) qualityScore!: number;
  @IsOptional() @IsInt() @Min(0) priceCompetitiveness?: number;
  @IsOptional() @IsInt() @Min(0) responsiveness?: number;
  @IsOptional() @IsInt() @Min(0) totalOrders?: number;
  @IsOptional() @IsInt() @Min(0) lateDeliveries?: number;
  @IsOptional() @IsInt() @Min(0) rejectedItems?: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePriceHistoryDto {
  @IsUUID() supplierId!: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsString() @MaxLength(160) productName!: string;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsString() @MaxLength(10) currency?: string;
  @IsDateString() effectiveDate!: string;
  @IsOptional() @IsString() @MaxLength(240) notes?: string;
}

