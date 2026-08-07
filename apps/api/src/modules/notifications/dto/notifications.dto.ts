import { IsArray, IsBoolean, IsEnum, IsOptional, IsUUID, ValidateNested } from "class-validator";
import { Transform, Type } from "class-transformer";

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
  STOCK_TRANSFER_REQUEST = "STOCK_TRANSFER_REQUEST"
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
