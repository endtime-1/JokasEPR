import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { Request, Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { mkdirSync } from "fs";
import { validateAndCleanImageUpload } from "../../common/utils/validate-image-magic";
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
  CheckOutSelfDto,
  ComputePayrollDto,
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
  CreateEmployeeDocumentDto,
  CreateLeavePolicyDto,
  CreatePublicHolidayDto,
  InitializeLeaveBalanceDto,
  RecordAttendanceDto,
  ReviewLeaveRequestDto,
  ReviewPerformanceDto,
  UpdateAssignmentStatusDto,
  UpdateEmployeeDto,
  UpdateEmployeeRoleDto,
  UpdateLeavePolicyDto,
  UpdateShiftDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
  BulkPayrollRunDto,
  PayrollPrefillQueryDto,
  CreateDisciplinaryDto,
  CreateGrievanceDto,
  ResolveGrievanceDto,
  CreateTrainingCourseDto,
  UpdateTrainingCourseDto,
  CreateSalaryBandDto,
  UpdateSalaryBandDto,
  CreateJobPostingDto,
  UpdateJobPostingDto,
  CreateJobApplicationDto,
  UpdateApplicationStatusDto,
  CreateOnboardingItemDto,
  CreatePeerReviewDto,
  CreateApprovalChainDto,
  UpdateApprovalChainDto,
  ComplianceReportQueryDto,
} from "./dto/hr.dto";

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

  @Put("employee-roles/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateEmployeeRole(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateEmployeeRoleDto, @Req() req: Request) {
    return this.svc.updateEmployeeRole(user, id, dto, ctx(req));
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

  @Delete("employees/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteEmployee(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteEmployee(user, id, ctx(req));
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
        filename: (_req, file, cb) => {
          // Preserve the original extension so UploadsController can serve it.
          // Magic bytes validation below still confirms the actual file type.
          const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `emp-${Date.now()}-${Math.random().toString(36).slice(2)}${ALLOWED.has(ext) ? ext : ".jpg"}`);
        },
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
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
    if (!validateAndCleanImageUpload(file.path)) {
      throw new BadRequestException("Invalid image file. Upload a JPEG, PNG, WebP, or GIF.");
    }
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

  @Post("attendance/checkout")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  checkoutSelf(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckOutSelfDto, @Req() req: Request) {
    return this.svc.checkoutSelf(user, dto, ctx(req));
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

  @Put("shifts/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateShift(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateShiftDto, @Req() req: Request) {
    return this.svc.updateShift(user, id, dto, ctx(req));
  }

  @Delete("shifts/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deactivateShift(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deactivateShift(user, id, ctx(req));
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

  @Put("tasks/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateTask(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateTaskDto, @Req() req: Request) {
    return this.svc.updateTask(user, id, dto, ctx(req));
  }

  @Delete("tasks/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteTask(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteTask(user, id, ctx(req));
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

  @Get("payroll/compute")
  @RequirePermissions(PERMISSIONS.HR_READ)
  computePayrollEstimate(@CurrentUser() user: AuthenticatedUser, @Query() dto: ComputePayrollDto) {
    return this.svc.computePayrollEstimate(user, dto);
  }

  @Get("payroll/prefill")
  @RequirePermissions(PERMISSIONS.HR_READ)
  prefillPayroll(@CurrentUser() user: AuthenticatedUser, @Query() query: PayrollPrefillQueryDto) {
    return this.svc.prefillPayroll(user, query.employeeId, query.period);
  }

  @Post("payroll/bulk-run")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  bulkPayrollRun(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkPayrollRunDto, @Req() req: Request) {
    return this.svc.bulkPayrollRun(user, dto, ctx(req));
  }

  @Get("payroll/bank-export")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  bankExportCsv(@CurrentUser() user: AuthenticatedUser, @Query("period") period: string, @Res() res: Response) {
    return this.svc.bankExportCsv(user, period, res);
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

  @Post("payroll/bulk-email")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  bulkEmailPayslips(@CurrentUser() user: AuthenticatedUser, @Body("period") period: string, @Req() req: Request) {
    return this.svc.bulkEmailPayslips(user, period, ctx(req));
  }

  @Get("payroll/:id/payslip")
  @RequirePermissions(PERMISSIONS.HR_READ)
  streamPayslip(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Res() res: Response) {
    return this.svc.streamPayslipPdf(user, id, res);
  }

  @Post("payroll/:id/email-payslip")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  emailPayslip(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.emailPayslip(user, id, ctx(req));
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

  @Patch("performance/:id/submit")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  submitPerformance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.submitPerformance(user, id, ctx(req));
  }

  @Patch("performance/:id/review")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  reviewPerformance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ReviewPerformanceDto, @Req() req: Request) {
    return this.svc.reviewPerformance(user, id, dto, ctx(req));
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

  @Get("reports/headcount")
  @RequirePermissions(PERMISSIONS.HR_READ)
  reportHeadcount(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.reportHeadcount(user, query);
  }

  @Get("reports/leave-summary")
  @RequirePermissions(PERMISSIONS.HR_READ)
  reportLeaveSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.reportLeaveSummary(user, query);
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

  // ─── HR-A: Leave Policies ───────────────────────────────────────────────────

  @Get("leave-policies")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listLeavePolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listLeavePolicies(user);
  }

  @Post("leave-policies")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createLeavePolicy(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeavePolicyDto, @Req() req: Request) {
    return this.svc.createLeavePolicy(user, dto, ctx(req));
  }

  @Put("leave-policies/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateLeavePolicy(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateLeavePolicyDto, @Req() req: Request) {
    return this.svc.updateLeavePolicy(user, id, dto, ctx(req));
  }

  @Delete("leave-policies/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteLeavePolicy(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteLeavePolicy(user, id, ctx(req));
  }

  // ─── HR-A: Leave Balance ────────────────────────────────────────────────────

  @Get("leave-balance/me")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  myLeaveBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.myLeaveBalance(user);
  }

  @Get("leave-balance")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listLeaveBalances(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listLeaveBalances(user, query);
  }

  @Post("leave-balance/initialize")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  initializeLeaveBalances(@CurrentUser() user: AuthenticatedUser, @Body() dto: InitializeLeaveBalanceDto, @Req() req: Request) {
    return this.svc.initializeLeaveBalances(user, dto, ctx(req));
  }

  // ─── HR-A: Public Holidays ──────────────────────────────────────────────────

  @Get("public-holidays")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listPublicHolidays(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listPublicHolidays(user, query);
  }

  @Post("public-holidays/seed-ghana")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  seedGhanaHolidays(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.svc.seedGhanaHolidays(user, ctx(req));
  }

  @Post("public-holidays")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createPublicHoliday(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePublicHolidayDto, @Req() req: Request) {
    return this.svc.createPublicHoliday(user, dto, ctx(req));
  }

  @Delete("public-holidays/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deletePublicHoliday(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deletePublicHoliday(user, id, ctx(req));
  }

  // ─── HR-A: Employee Documents ───────────────────────────────────────────────

  @Get("employees/:id/documents")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listEmployeeDocuments(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.svc.listEmployeeDocuments(user, id);
  }

  @Post("employees/:id/documents")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  @UseInterceptors(
    FileInterceptor("document", {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dest = join(process.cwd(), "uploads", "documents");
          mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
        if (allowed.includes(extname(file.originalname).toLowerCase()) || file.mimetype === "application/pdf" || file.mimetype.startsWith("image/")) {
          cb(null, true);
        } else {
          cb(new BadRequestException("Only images and PDF files are allowed") as never, false);
        }
      },
    }),
  )
  uploadEmployeeDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CreateEmployeeDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.svc.uploadEmployeeDocument(user, id, dto, file.filename, ctx(req));
  }

  @Delete("employees/:id/documents/:docId")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteEmployeeDocument(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Param("docId") docId: string, @Req() req: Request) {
    return this.svc.deleteEmployeeDocument(user, id, docId, ctx(req));
  }

  // ─── HR-D: Disciplinary ──────────────────────────────────────────────────────

  @Get("disciplinary")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listDisciplinary(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listDisciplinary(user, query);
  }

  @Post("disciplinary")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createDisciplinary(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDisciplinaryDto, @Req() req: Request) {
    return this.svc.createDisciplinaryRecord(user, dto, ctx(req));
  }

  @Patch("disciplinary/:id/acknowledge")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  acknowledgeDisciplinary(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.acknowledgeDisciplinary(user, id, ctx(req));
  }

  @Delete("disciplinary/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteDisciplinary(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteDisciplinaryRecord(user, id, ctx(req));
  }

  // ─── HR-D: Grievances ────────────────────────────────────────────────────────

  @Get("grievances")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listGrievances(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listGrievances(user, query);
  }

  @Post("grievances")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  submitGrievance(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGrievanceDto, @Req() req: Request) {
    return this.svc.submitGrievance(user, dto, ctx(req));
  }

  @Patch("grievances/:id/resolve")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  resolveGrievance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: ResolveGrievanceDto, @Req() req: Request) {
    return this.svc.resolveGrievance(user, id, dto, ctx(req));
  }

  @Patch("grievances/:id/close")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  closeGrievance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.closeGrievance(user, id, ctx(req));
  }

  @Delete("grievances/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteGrievance(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteGrievance(user, id, ctx(req));
  }

  // ─── HR-F: Org Chart ─────────────────────────────────────────────────────────

  @Get("org-chart")
  @RequirePermissions(PERMISSIONS.HR_READ)
  getOrgChart(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getOrgChart(user);
  }

  // ─── HR-F: Training Courses ───────────────────────────────────────────────────

  @Get("training-courses")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listTrainingCourses(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listTrainingCourses(user);
  }

  @Post("training-courses")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createTrainingCourse(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTrainingCourseDto, @Req() req: Request) {
    return this.svc.createTrainingCourse(user, dto, ctx(req));
  }

  @Put("training-courses/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateTrainingCourse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateTrainingCourseDto, @Req() req: Request) {
    return this.svc.updateTrainingCourse(user, id, dto, ctx(req));
  }

  @Delete("training-courses/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteTrainingCourse(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteTrainingCourse(user, id, ctx(req));
  }

  // ─── HR-G: Salary Bands ───────────────────────────────────────────────────────

  @Get("salary-bands")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listSalaryBands(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listSalaryBands(user);
  }

  @Post("salary-bands")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createSalaryBand(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSalaryBandDto, @Req() req: Request) {
    return this.svc.createSalaryBand(user, dto, ctx(req));
  }

  @Put("salary-bands/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateSalaryBand(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateSalaryBandDto, @Req() req: Request) {
    return this.svc.updateSalaryBand(user, id, dto, ctx(req));
  }

  @Delete("salary-bands/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteSalaryBand(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteSalaryBand(user, id, ctx(req));
  }

  // ─── HR-G: Job Postings ───────────────────────────────────────────────────────

  @Get("job-postings")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listJobPostings(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listJobPostings(user, query);
  }

  @Post("job-postings")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createJobPosting(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateJobPostingDto, @Req() req: Request) {
    return this.svc.createJobPosting(user, dto, ctx(req));
  }

  @Put("job-postings/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateJobPosting(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateJobPostingDto, @Req() req: Request) {
    return this.svc.updateJobPosting(user, id, dto, ctx(req));
  }

  @Patch("job-postings/:id/close")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  closeJobPosting(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.closeJobPosting(user, id, ctx(req));
  }

  @Delete("job-postings/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteJobPosting(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteJobPosting(user, id, ctx(req));
  }

  // ─── HR-G: Applications ───────────────────────────────────────────────────────

  @Get("applications")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listApplications(@CurrentUser() user: AuthenticatedUser, @Query() query: HRQueryDto) {
    return this.svc.listApplications(user, query);
  }

  @Post("job-postings/:id/applications")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createApplication(@CurrentUser() user: AuthenticatedUser, @Param("id") jobPostingId: string, @Body() dto: CreateJobApplicationDto, @Req() req: Request) {
    return this.svc.createApplication(user, jobPostingId, dto, ctx(req));
  }

  @Patch("applications/:id/status")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateApplicationStatus(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateApplicationStatusDto, @Req() req: Request) {
    return this.svc.updateApplicationStatus(user, id, dto, ctx(req));
  }

  @Post("applications/:id/hire")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  hireApplicant(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.hireApplicant(user, id, ctx(req));
  }

  // ─── HR-G: Onboarding ─────────────────────────────────────────────────────────

  @Get("employees/:id/onboarding")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listOnboarding(@CurrentUser() user: AuthenticatedUser, @Param("id") employeeId: string) {
    return this.svc.listOnboarding(user, employeeId);
  }

  @Post("employees/:id/onboarding")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createOnboardingItem(@CurrentUser() user: AuthenticatedUser, @Param("id") employeeId: string, @Body() dto: CreateOnboardingItemDto, @Req() req: Request) {
    return this.svc.createOnboardingItem(user, employeeId, dto, ctx(req));
  }

  @Post("employees/:id/onboarding/template")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  applyOnboardingTemplate(@CurrentUser() user: AuthenticatedUser, @Param("id") employeeId: string, @Req() req: Request) {
    return this.svc.applyOnboardingTemplate(user, employeeId, ctx(req));
  }

  @Patch("onboarding/:id/complete")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  completeOnboardingItem(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.completeOnboardingItem(user, id, ctx(req));
  }

  @Delete("onboarding/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  deleteOnboardingItem(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.deleteOnboardingItem(user, id, ctx(req));
  }

  // ─── HR-H: 360 Peer Reviews ───────────────────────────────────────────────────

  @Get("performance/:id/peer-reviews")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listPeerReviews(@CurrentUser() user: AuthenticatedUser, @Param("id") performanceId: string) {
    return this.svc.listPeerReviews(user, performanceId);
  }

  @Post("performance/:id/peer-reviews")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  createPeerReview(@CurrentUser() user: AuthenticatedUser, @Param("id") performanceId: string, @Body() dto: CreatePeerReviewDto, @Req() req: Request) {
    return this.svc.createPeerReview(user, performanceId, dto, ctx(req));
  }

  @Patch("peer-reviews/:id/submit")
  @RequirePermissions(PERMISSIONS.PLATFORM_READ)
  submitPeerReview(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Req() req: Request) {
    return this.svc.submitPeerReview(user, id, ctx(req));
  }

  // ─── HR-H: Approval Chains ────────────────────────────────────────────────────

  @Get("approval-chains")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listApprovalChains(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listApprovalChains(user);
  }

  @Post("approval-chains")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  upsertApprovalChain(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateApprovalChainDto, @Req() req: Request) {
    return this.svc.upsertApprovalChain(user, dto, ctx(req));
  }

  @Put("approval-chains/:id")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  updateApprovalChain(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateApprovalChainDto, @Req() req: Request) {
    return this.svc.updateApprovalChain(user, id, dto, ctx(req));
  }

  // ─── HR-H: Compliance Reports ─────────────────────────────────────────────────

  @Get("compliance/reports")
  @RequirePermissions(PERMISSIONS.HR_READ)
  listComplianceReports(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listComplianceReports(user);
  }

  @Post("compliance/ssnit")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  generateSsnitReport(@CurrentUser() user: AuthenticatedUser, @Body() dto: ComplianceReportQueryDto, @Req() req: Request) {
    return this.svc.generateSsnitReport(user, dto, ctx(req));
  }

  @Post("compliance/paye")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  generatePayeReport(@CurrentUser() user: AuthenticatedUser, @Body() dto: ComplianceReportQueryDto, @Req() req: Request) {
    return this.svc.generatePayeReport(user, dto, ctx(req));
  }

  @Post("compliance/headcount")
  @RequirePermissions(PERMISSIONS.HR_MANAGE)
  generateHeadcountReport(@CurrentUser() user: AuthenticatedUser, @Body() dto: ComplianceReportQueryDto, @Req() req: Request) {
    return this.svc.generateHeadcountReport(user, dto, ctx(req));
  }
}
