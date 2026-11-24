import { Controller, Get, Headers, Ip, Query, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, Matches } from "class-validator";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../../common/guards/permissions.guard";
import { EggAnalysisService } from "./egg-analysis.service";

export class EggAnalysisQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "from must be a date like 2026-11-24" }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "to must be a date like 2026-11-24" }) to?: string;
}

/** The egg analysis: from the farm's production records to the head office, sales and adjustments. Read-only. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("egg-analysis")
export class EggAnalysisController {
  constructor(private readonly service: EggAnalysisService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async analysis(@CurrentUser() user: AuthenticatedUser, @Query() query: EggAnalysisQueryDto) {
    return { data: await this.service.analysis(user, query) };
  }

  @Get("export.xlsx")
  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async excel(@CurrentUser() user: AuthenticatedUser, @Query() query: EggAnalysisQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const { buffer, filename } = await this.service.workbook(user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("content-disposition", `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`);
    response.setHeader("cache-control", "no-store");
    response.send(buffer);
  }
}
