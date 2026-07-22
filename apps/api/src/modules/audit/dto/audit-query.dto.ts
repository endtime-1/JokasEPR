import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { AuditAction } from "@prisma/client";

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  take?: number = 50;

  /** @deprecated use page + take instead */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;

  /** @deprecated use page instead */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;
}
