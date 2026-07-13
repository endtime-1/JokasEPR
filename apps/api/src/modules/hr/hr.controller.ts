import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { mkdirSync } from "fs";
import { join } from "path";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { PERMISSIONS, AuthenticatedUser } from "@jokas/shared";
import { HRService } from "./hr.service";
import {
  AssignTaskDto,
  BulkAttendanceDto,
  CheckInSelfDto,
  CreateDepartmentAssignmentDto,
  CreateEmployeeDto,
  CreateEmployeeRoleDto,
  CreateLeaveRequestDto,
  CreatePayrollRecordDto,
  CreatePerformanceRecordDto,
  CreateShiftDto,
  CreateTaskDto,
  CreateTrainingRecordDto,
  HRQueryDto,
  RecordAttendanceDto,
  ReviewLeaveRequestDto,
  UpdateAssignmentStatusDto,
  UpdateEmployeeDto,
  UpdateTaskStatusDto,
} from "./dto/hr.dto";
import { Request } from "express";

function ctx(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers["user-agent"] };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("hr")
export class HRController {
  constructor(private readonly svc: HRService) {}

  // ─── Dashboard & Options ───────────────────────────────────────────────────

  @Get("dashboard")
  @RequirePermissions(PERMISSIONS.HR_READ)
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.dashboard(user);
  }

  @Get("options")
  @RequirePermissions(PERMISSIONS.HR_READ)
  options(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.options(user);
  }

  // ─── Employee Roles ────────────────────────────────────────────────────────

  @Get("employee-roles")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listEmployeeRoles(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listEmployeeRoles(user, query);
  }

  @Post("employee-roles")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createEmployeeRole(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeRoleDto, @Req() req: Request) {
    return this.svc.createEmployeeRole(user, dto, ctx(req));
  }

  // ─── Employees ─────────────────────────────────────────────────────────────

  @Get("employees")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listEmployees(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listEmployees(user, query);
  }

  @Get("employees/me")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  getMyEmployee(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getMyEmployee(user);
  }

  @Patch("employees/me")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  updateMyEmployee(@CurrentUser() user: AuthenticatedUser, @Body() dto: { phone?: string }, @Req() req: Request) {
    return this.svc.updateMyEmployee(user, dto, ctx(req));
  }

  @Get("employees/:id")
  @RequirePermissions(PERMISSIONS.HR_READ)
  getEmployee(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.getEmployee(user, id);
  }

  @Post("employees")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createEmployee(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto, @Req() req: Request) {
    return this.svc.createEmployee(user, dto, ctx(req));
  }

  @Put("employees/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateEmployee(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateEmployeeDto, @Req() req: Request) {
    return this.svc.updateEmployee(user, id, dto, ctx(req));
  }

  @Post("employees/:id/photo")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  @UseInterceptors(
    FileInterceptor("photo", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), "uploads", "employees");
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${(req as any).params.id}-${Date.now()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) cb(null, true);
        else cb(new BadRequestException("Only image files are allowed"), false);
      },
    })
  )
  async uploadEmployeePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.svc.uploadEmployeePhoto(user, id, file.filename);
  }

  // ─── Attendance ────────────────────────────────────────────────────────────

  @Get("attendance")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listAttendance(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listAttendance(user, query);
  }

  @Post("attendance/me")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  checkInSelf(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckInSelfDto, @Req() req: Request) {
    return this.svc.checkInSelf(user, dto, ctx(req));
  }

  @Post("attendance")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  recordAttendance(@CurrentUser() user: AuthenticatedUser, @Body() dto: RecordAttendanceDto, @Req() req: Request) {
    return this.svc.recordAttendance(user, dto, ctx(req));
  }

  @Post("attendance/bulk")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  bulkRecordAttendance(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkAttendanceDto, @Req() req: Request) {
    return this.svc.bulkRecordAttendance(user, dto, ctx(req));
  }

  // ─── Shifts ────────────────────────────────────────────────────────────────

  @Get("shifts")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listShifts(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listShifts(user);
  }

  @Post("shifts")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createShift(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShiftDto, @Req() req: Request) {
    return this.svc.createShift(user, dto, ctx(req));
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  @Get("tasks")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listTasks(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listTasks(user, query);
  }

  @Get("tasks/my")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  myTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.myTasks(user);
  }

  @Get("tasks/:id")
  @RequirePermissions(PERMISSIONS.HR_READ)
  getTask(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.getTask(user, id);
  }

  @Post("tasks")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createTask(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto, @Req() req: Request) {
    return this.svc.createTask(user, dto, ctx(req));
  }

  @Patch("tasks/:id/status")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateTaskStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateTaskStatusDto, @Req() req: Request) {
    return this.svc.updateTaskStatus(user, id, dto, ctx(req));
  }

  @Post("tasks/assign")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  assignTask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssignTaskDto, @Req() req: Request) {
    return this.svc.assignTask(user, dto, ctx(req));
  }

  @Patch("assignments/:id/status")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateAssignmentStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateAssignmentStatusDto, @Req() req: Request) {
    return this.svc.updateAssignmentStatus(user, id, dto, ctx(req));
  }

  // ─── Payroll ────────────────────────────────────────────────────────────────

  @Get("payroll/me")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  getMyPayslips(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getMyPayslips(user);
  }

  @Get("payroll")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listPayroll(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listPayroll(user, query);
  }

  @Post("payroll")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createPayroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollRecordDto, @Req() req: Request) {
    return this.svc.createPayrollRecord(user, dto, ctx(req));
  }

  @Patch("payroll/:id/approve")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  approvePayroll(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.approvePayroll(user, id, ctx(req));
  }

  @Patch("payroll/:id/mark-paid")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  markPayrollPaid(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.markPayrollPaid(user, id, ctx(req));
  }

  // ─── Training ───────────────────────────────────────────────────────────────

  @Get("training")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listTraining(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listTraining(user, query);
  }

  @Post("training")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createTraining(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTrainingRecordDto, @Req() req: Request) {
    return this.svc.createTrainingRecord(user, dto, ctx(req));
  }

  // ─── Performance ────────────────────────────────────────────────────────────

  @Get("performance")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listPerformance(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listPerformance(user, query);
  }

  @Post("performance")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createPerformance(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePerformanceRecordDto, @Req() req: Request) {
    return this.svc.createPerformanceRecord(user, dto, ctx(req));
  }

  @Patch("performance/:id/acknowledge")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  acknowledgePerformance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.acknowledgePerformance(user, id, ctx(req));
  }

  // ─── Department Assignments ─────────────────────────────────────────────────

  @Get("department-assignments")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listDepartmentAssignments(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listDepartmentAssignments(user, query);
  }

  @Post("department-assignments")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createDepartmentAssignment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepartmentAssignmentDto, @Req() req: Request) {
    return this.svc.createDepartmentAssignment(user, dto, ctx(req));
  }

  // ─── Reports ────────────────────────────────────────────────────────────────

  @Get("reports/productivity")
  @RequirePermissions(PERMISSIONS.HR_READ)
  productivityReport(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.productivityReport(user, query);
  }

  // ─── Leave Requests ─────────────────────────────────────────────────────────

  @Get("leave-requests/my")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  myLeaveRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.myLeaveRequests(user);
  }

  @Get("leave-requests")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listLeaveRequests(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listLeaveRequests(user, query);
  }

  @Post("leave-requests")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  submitLeaveRequest(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveRequestDto, @Req() req: Request) {
    return this.svc.submitLeaveRequest(user, dto, ctx(req));
  }

  @Patch("leave-requests/:id/review")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  reviewLeaveRequest(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReviewLeaveRequestDto, @Req() req: Request) {
    return this.svc.reviewLeaveRequest(user, id, dto, ctx(req));
  }

  @Delete("leave-requests/:id")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  cancelLeaveRequest(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.cancelLeaveRequest(user, id, ctx(req));
  }
}
