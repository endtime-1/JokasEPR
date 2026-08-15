import { IsArray, IsBoolean, IsEnum, IsOptional, IsUUID, ValidateNested } from "class-validator";
import { Transform, Type } from "class-transformer";

// C-BACK (2026-08-15): this had drifted out of sync with the Prisma schema's
// own NotificationType enum, which already had DOCUMENT_EXPIRY_ALERT and 6
// other values this one was missing — existing call sites worked around the
// gap with `as never` casts instead of the enum, which is exactly how the
// gap went unnoticed. Synced to match the schema exactly.
export enum NotificationType {
  LOW_STOCK_ALERT = "LOW_STOCK_ALERT",
  EXPIRY_ALERT = "EXPIRY_ALERT",
  VACCINATION_REMINDER = "VACCINATION_REMINDER",
  MEDICATION_REMINDER = "MEDICATION_REMINDER",
  PRODUCTION_ORDER_COMPLETED = "PRODUCTION_ORDER_COMPLETED",
  PURCHASE_APPROVAL_NEEDED = "PURCHASE_APPROVAL_NEEDED",
  CUSTOMER_PAYMENT_OVERDUE = "CUSTOMER_PAYMENT_OVERDUE",
  SUPPLIER_PAYMENT_DUE = "SUPPLIER_PAYMENT_DUE",
  MACHINE_MAINTENANCE_DUE = "MACHINE_MAINTENANCE_DUE",
  AI_RISK_ALERT = "AI_RISK_ALERT",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  QUALITY_BATCH_REJECTED = "QUALITY_BATCH_REJECTED",
  STOCK_TRANSFER_REQUEST = "STOCK_TRANSFER_REQUEST",
  LEAVE_REQUEST_SUBMITTED = "LEAVE_REQUEST_SUBMITTED",
  LEAVE_APPROVED = "LEAVE_APPROVED",
  LEAVE_REJECTED = "LEAVE_REJECTED",
  PAYROLL_APPROVED = "PAYROLL_APPROVED",
  PAYROLL_PAID = "PAYROLL_PAID",
  DOCUMENT_EXPIRY_ALERT = "DOCUMENT_EXPIRY_ALERT",
  DISCIPLINARY_ISSUED = "DISCIPLINARY_ISSUED",
  GRIEVANCE_UPDATED = "GRIEVANCE_UPDATED"
}

export class NotificationQueryDto {
  @IsOptional()
  @IsEnum(["UNREAD", "READ"])
  status?: "UNREAD" | "READ";

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  offset?: number;
}

// M5: this class previously declared `preferences` with no validation
// decorators at all. Under the global pipe's forbidNonWhitelisted:true,
// class-validator treats an undecorated property as unknown and rejects
// the whole request with a 400 — so no real client could ever successfully
// update preferences.
export class NotificationPreferenceItemDto {
  @IsEnum(NotificationType)
  notificationType!: NotificationType;

  @IsBoolean()
  inApp!: boolean;

  @IsBoolean()
  email!: boolean;

  @IsBoolean()
  sms!: boolean;

  @IsBoolean()
  whatsapp!: boolean;
}

export class UpdatePreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}

export class UpdateNotificationConfigDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  emailFromAddress?: string;

  @IsOptional()
  emailFromName?: string;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;
}

export type SendNotificationPayload = {
  companyId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};
