import { Body, Controller, Get, Headers, Ip, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import {
  CreateBreakdownDto,
  CreateDowntimeDto,
  CreateEquipmentDto,
  CreateMachineDto,
  CreateMaintenanceCostDto,
  CreateMaintenanceRecordDto,
  CreateMaintenanceScheduleDto,
  CreateSparePartUsageDto,
  CreateTechnicianAssignmentDto,
  MaintenanceQueryDto,
  UpdateBreakdownStatusDto
} from "./dto/maintenance.dto";
import { MaintenanceService } from "./maintenance.service";

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("maintenance")
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.dashboard(user, query);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.maintenanceService.options(user);
  }

  @Get("machines")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  machines(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listMachines(user, query);
  }

  @Post("machines")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createMachine(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMachineDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createMachine(user, dto, { ipAddress, userAgent });
  }

  @Get("machines/:id")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  machine(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.maintenanceService.getMachine(user, id);
  }

  @Get("equipment")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  equipment(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listEquipment(user, query);
  }

  @Post("equipment")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createEquipment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEquipmentDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createEquipment(user, dto, { ipAddress, userAgent });
  }

  @Get("schedules")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  schedules(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listSchedules(user, query);
  }

  @Post("schedules")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createSchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMaintenanceScheduleDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createSchedule(user, dto, { ipAddress, userAgent });
  }

  @Get("records")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  records(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listRecords(user, query);
  }

  @Post("records")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createRecord(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMaintenanceRecordDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createRecord(user, dto, { ipAddress, userAgent });
  }

  @Get("breakdowns")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  breakdowns(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listBreakdowns(user, query);
  }

  @Post("breakdowns")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createBreakdown(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBreakdownDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createBreakdown(user, dto, { ipAddress, userAgent });
  }

  @Patch("breakdowns/:id/status")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  updateBreakdown(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateBreakdownStatusDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.updateBreakdown(user, id, dto, { ipAddress, userAgent });
  }

  @Get("spare-parts")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  spareParts(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listSpareParts(user, query);
  }

  @Post("spare-parts")
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createSparePart(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSparePartUsageDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createSparePartUsage(user, dto, { ipAddress, userAgent });
  }

  @Get("assignments")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  assignments(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listAssignments(user, query);
  }

  @Post("assignments")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createAssignment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTechnicianAssignmentDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createAssignment(user, dto, { ipAddress, userAgent });
  }

  @Get("downtime")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_READ)
  downtime(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listDowntime(user, query);
  }

  @Post("downtime")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createDowntime(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDowntimeDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createDowntime(user, dto, { ipAddress, userAgent });
  }

  @Get("costs")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  costs(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto) {
    return this.maintenanceService.listCosts(user, query);
  }

  @Post("costs")
  @RequirePermissions(PERMISSIONS.FINANCE_MANAGE)
  createCost(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMaintenanceCostDto, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    return this.maintenanceService.createCost(user, dto, { ipAddress, userAgent });
  }

  @Get("reports/costs.csv")
  @RequirePermissions(PERMISSIONS.FINANCE_READ)
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: MaintenanceQueryDto, @Res() response: Response, @Ip() ipAddress: string, @Headers("user-agent") userAgent?: string) {
    const csv = await this.maintenanceService.reportCsv(user, query, { ipAddress, userAgent });
    response.setHeader("content-type", "text/csv");
    response.setHeader("content-disposition", "attachment; filename=maintenance-costs.csv");
    response.send(csv);
  }
}

