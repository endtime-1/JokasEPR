import { IsBoolean, IsEnum, IsOptional, IsUUID } from "class-validator";
import { Transform } from "class-transformer";

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

export class UpdatePreferencesDto {
  preferences!: {
    notificationType: NotificationType;
    inApp: boolean;
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
  }[];
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
