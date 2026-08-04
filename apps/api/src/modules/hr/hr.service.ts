import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Response } from "express";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../notifications/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AssignTaskDto,
  BulkAttendanceDto,
  CheckInSelfDto,
  CheckOutSelfDto,
  ComputePayrollDto,
  CreateDepartmentAssignmentDto,
  CreateEmployeeDocumentDto,
  CreateEmployeeDto,
  CreateEmployeeRoleDto,
  CreateLeaveRequestDto,
  CreateLeavePolicyDto,
  CreatePayrollRecordDto,
  CreatePerformanceRecordDto,
  CreatePublicHolidayDto,
  CreateShiftDto,
  CreateTaskDto,
  CreateTrainingRecordDto,
  HRQueryDto,
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

type RequestContext = { ipAddress?: string; userAgent?: string };

function nextRef(prefix: string) {
  const year = new Date().getFullYear();
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${prefix}-${year}-${ts}${rand}`;
}

function num(v: unknown) {
  return Number(v ?? 0);
}

@Injectable()
export class HRService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  // â"€â"€â"€ Dashboard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async dashboard(user: AuthenticatedUser) {
    const cid = user.companyId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
    // Split 14 original queries into 3 sequential batches of ≤5 to stay within
    // Hostinger's 5-connection pool. Running all 14 in one Promise.all exhausted
    // the pool and caused the dashboard to time out.
    const [totalEmployees, activeEmployees, onLeave, todayPresent, todayAbsent] = await Promise.all([
      this.prisma.employee.count({ where: { companyId: cid, deletedAt: null } }).catch((e) => { console.error("[HR dash:totalEmployees]", e?.message); return 0; }),
      this.prisma.employee.count({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" } }).catch((e) => { console.error("[HR dash:activeEmployees]", e?.message); return 0; }),
      this.prisma.employee.count({ where: { companyId: cid, deletedAt: null, status: "ON_LEAVE" } }).catch((e) => { console.error("[HR dash:onLeave]", e?.message); return 0; }),
      this.prisma.attendanceRecord.count({ where: { companyId: cid, date: { gte: today }, status: "PRESENT" } }).catch((e) => { console.error("[HR dash:todayPresent]", e?.message); return 0; }),
      this.prisma.attendanceRecord.count({ where: { companyId: cid, date: { gte: today }, status: "ABSENT" } }).catch((e) => { console.error("[HR dash:todayAbsent]", e?.message); return 0; }),
    ]);

    const [todayTotalAttendance, openTasks, urgentTasks, pendingPayroll, openLeaveRequests] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: { companyId: cid, date: { gte: today } } }).catch((e) => { console.error("[HR dash:totalAttendance]", e?.message); return 0; }),
      this.prisma.task.count({ where: { companyId: cid, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } } }).catch((e) => { console.error("[HR dash:openTasks]", e?.message); return 0; }),
      this.prisma.task.count({ where: { companyId: cid, deletedAt: null, status: "OPEN", priority: "URGENT" } }).catch((e) => { console.error("[HR dash:urgentTasks]", e?.message); return 0; }),
      this.prisma.payrollRecord.count({ where: { companyId: cid, deletedAt: null, status: "DRAFT" } }).catch((e) => { console.error("[HR dash:pendingPayroll]", e?.message); return 0; }),
      this.prisma.leaveRequest.count({ where: { companyId: cid, deletedAt: null, status: "PENDING" } }).catch((e) => { console.error("[HR dash:openLeaveRequests]", e?.message); return 0; }),
    ]);

    const [recentLeaveRequests, recentEmployees, recentTasks] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where: { companyId: cid, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, reference: true, employeeName: true, leaveType: true, startDate: true, endDate: true, daysRequested: true, status: true, createdAt: true } }).catch((e) => { console.error("[HR dash:recentLeaveRequests]", e?.message); return []; }),
      this.prisma.employee.findMany({ where: { companyId: cid, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, code: true, fullName: true, status: true, photoUrl: true, employeeRole: { select: { name: true } }, branch: { select: { name: true } } } }).catch((e) => { console.error("[HR dash:recentEmployees]", e?.message); return []; }),
      this.prisma.task.findMany({ where: { companyId: cid, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true, priority: true, status: true, dueDate: true, assignments: { select: { id: true, employeeId: true, employee: { select: { fullName: true } } } } } }).catch((e) => { console.error("[HR dash:recentTasks]", e?.message); return []; }),
    ]);

    const attendanceRate = todayTotalAttendance > 0 ? (todayPresent / todayTotalAttendance * 100) : 0;

    return {
      data: {
        totalEmployees,
        activeEmployees,
        onLeave,
        presentToday: todayPresent,
        absentToday: todayAbsent,
        attendanceRate,
        openLeaveRequests,
        recentLeaveRequests,
        openTasks,
        urgentTasks,
        pendingPayroll,
        recentEmployees,
        recentTasks,
      },
    };
    } catch (e: any) {
      console.error("[HR dash:outer]", e?.message, e?.stack);
      throw new InternalServerErrorException(e?.message || "HR dashboard failed to load");
    }
  }

  // â"€â"€â"€ Options â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async options(user: AuthenticatedUser) {
    const cid = user.companyId;
    const [branches, farms, warehouses, productionSites, employeeRoles, shifts, employees, bankAccounts] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.productionSite.findMany({ where: { companyId: cid, deletedAt: null }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.employeeRole.findMany({ where: { companyId: cid, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.shift.findMany({ where: { companyId: cid, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true, startTime: true, endTime: true }, orderBy: { name: "asc" } }),
      this.prisma.employee.findMany({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" }, select: { id: true, code: true, fullName: true }, orderBy: { fullName: "asc" } }),
      this.prisma.bankAccount.findMany({ where: { companyId: cid, deletedAt: null, isActive: true }, select: { id: true, accountName: true, bankName: true }, orderBy: { accountName: "asc" } }),
    ]);
    return { data: { branches, farms, warehouses, productionSites, employeeRoles, shifts, employees, bankAccounts } };
  }

  // â"€â"€â"€ Employee Roles â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async listEmployeeRoles(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.employeeRole.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.search ? { OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }] } : {}),
      },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    return { data: rows };
  }

  async createEmployeeRole(user: AuthenticatedUser, dto: CreateEmployeeRoleDto, ctx: RequestContext) {
    const exists = await this.prisma.employeeRole.findUnique({ where: { companyId_code: { companyId: user.companyId, code: dto.code } } });
    if (exists) throw new BadRequestException(`Role code "${dto.code}" already exists`);

    const row = await this.prisma.employeeRole.create({ data: { companyId: user.companyId, createdById: user.id, ...dto } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "EmployeeRole", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â"€â"€â"€ Employees â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async listEmployees(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.employee.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.search ? { OR: [{ fullName: { contains: query.search } }, { code: { contains: query.search } }, { phone: { contains: query.search } }] } : {}),
      },
      select: {
        id: true,
        code: true,
        fullName: true,
        status: true,
        phone: true,
        startDate: true,
        photoUrl: true,
        email: true,
        employeeRoleId: true,
        branchId: true,
        farmId: true,
        employeeRole: { select: { name: true, code: true } },
        branch: { select: { name: true } },
        farm: { select: { name: true } },
      },
      orderBy: { fullName: "asc" },
      take: 500,
    });
    return { data: rows };
  }

  async getMyEmployee(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: {
        id: true, code: true, fullName: true, email: true, phone: true, photoUrl: true,
        employeeRole: { select: { name: true, code: true } },
        branch: { select: { id: true, name: true, code: true } },
        farm: { select: { id: true, name: true, code: true } },
      },
    });
    return {
      data: {
        id:           emp?.id ?? user.id,
        fullName:     emp?.fullName ?? user.fullName,
        email:        emp?.email ?? user.email,
        phone:        emp?.phone ?? null,
        code:         emp?.code ?? null,
        roles:        user.roles,
        branch:       emp?.branch ?? null,
        farm:         emp?.farm ?? null,
        employeeRole: emp?.employeeRole ?? null,
      },
    };
  }

  async updateMyEmployee(user: AuthenticatedUser, dto: { phone?: string }, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true },
    });
    if (!emp) throw new NotFoundException("No employee record linked to your account");
    await this.prisma.employee.update({ where: { id: emp.id }, data: { phone: dto.phone, updatedById: user.id }, select: { id: true } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: emp.id, action: "UPDATE", ...ctx });
    return this.getMyEmployee(user);
  }

  async getEmployee(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.employee.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      select: {
        id: true, companyId: true, userId: true, code: true,
        firstName: true, lastName: true, fullName: true,
        dateOfBirth: true, gender: true, phone: true, email: true,
        address: true, nationalId: true, startDate: true, endDate: true,
        status: true, employeeRoleId: true, branchId: true, farmId: true,
        warehouseId: true, productionSiteId: true, managerId: true,
        basicSalary: true, bankName: true, bankAccount: true,
        ssnitNumber: true, tinNumber: true,
        emergencyContactName: true, emergencyContactPhone: true,
        notes: true, photoUrl: true,
        createdById: true, updatedById: true, createdAt: true, updatedAt: true, deletedAt: true,
        employeeRole: { select: { id: true, code: true, name: true } },
        branch: { select: { name: true } },
        farm: { select: { name: true } },
        warehouse: { select: { name: true } },
        productionSite: { select: { name: true } },
        attendanceRecords: {
          orderBy: { date: "desc" }, take: 30,
          select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, hoursWorked: true, overtimeHours: true, notes: true, createdAt: true },
        },
        taskAssignments: {
          where: { status: { notIn: ["COMPLETED", "REJECTED"] } },
          select: { id: true, status: true, task: { select: { title: true, priority: true, dueDate: true } } },
        },
        payrollRecords: {
          where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 6,
          select: { id: true, reference: true, period: true, basicSalary: true, grossPay: true, netPay: true, status: true, paymentDate: true, createdAt: true },
        },
        trainingRecords: {
          where: { deletedAt: null }, orderBy: { trainingDate: "desc" }, take: 10,
          select: { id: true, title: true, trainingDate: true, outcome: true, certificate: true, notes: true, courseId: true, certificateExpiry: true, createdAt: true },
        },
        performanceRecords: {
          where: { deletedAt: null }, orderBy: { period: "desc" }, take: 6,
          select: { id: true, period: true, overallRating: true, status: true, reviewerId: true, createdAt: true },
        },
        departmentAssignments: {
          orderBy: { startDate: "desc" },
          select: { id: true, department: true, startDate: true, endDate: true, isPrimary: true, notes: true },
        },
      },
    });
    if (!row) throw new NotFoundException("Employee not found");
    return { data: row };
  }

  async createEmployee(user: AuthenticatedUser, dto: CreateEmployeeDto, ctx: RequestContext) {
    const exists = await this.prisma.employee.findUnique({ where: { companyId_code: { companyId: user.companyId, code: dto.code } }, select: { id: true } });
    if (exists) throw new BadRequestException(`Employee code "${dto.code}" already exists`);

    const fullName = `${dto.firstName} ${dto.lastName}`;
    const row = await this.prisma.employee.create({
      data: {
        companyId: user.companyId,
        createdById: user.id,
        ...(dto as any),
        fullName,
        startDate: new Date(dto.startDate),
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        basicSalary: dto.basicSalary,
      },
      select: { id: true, code: true, fullName: true, status: true, startDate: true, email: true, phone: true, photoUrl: true, employeeRoleId: true, branchId: true, createdAt: true },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateEmployee(user: AuthenticatedUser, id: string, dto: UpdateEmployeeDto, ctx: RequestContext) {
    const row = await this.prisma.employee.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } });
    if (!row) throw new NotFoundException("Employee not found");

    const fullName = dto.firstName || dto.lastName
      ? `${dto.firstName ?? row.firstName} ${dto.lastName ?? row.lastName}`
      : undefined;

    const updated = await this.prisma.employee.update({
      where: { id },
      data: { updatedById: user.id, ...(dto as any), ...(fullName ? { fullName } : {}), dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined },
      select: { id: true, code: true, fullName: true, firstName: true, lastName: true, phone: true, email: true, status: true, startDate: true, photoUrl: true, employeeRoleId: true, branchId: true, farmId: true, updatedAt: true },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async uploadEmployeePhoto(user: AuthenticatedUser, id: string, filename: string) {
    const row = await this.prisma.employee.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundException("Employee not found");
    const photoUrl = `/api/v1/uploads/employees/${filename}`;
    await this.prisma.employee.update({ where: { id }, data: { photoUrl }, select: { id: true } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: id, action: "UPDATE", summary: "Updated employee photo" });
    return { data: { photoUrl } };
  }

  // â"€â"€â"€ Attendance â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async listAttendance(user: AuthenticatedUser, query: HRQueryDto) {
    const where: Record<string, unknown> = { companyId: user.companyId };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.date = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const rows = await this.prisma.attendanceRecord.findMany({
      where,
      select: {
        id: true, companyId: true, employeeId: true, date: true, status: true,
        checkInTime: true, checkOutTime: true, hoursWorked: true, overtimeHours: true,
        shiftId: true, notes: true, recordedById: true, createdAt: true, updatedAt: true,
        employee: { select: { fullName: true, code: true } },
        shift: { select: { name: true, startTime: true, endTime: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return { data: rows };
  }

  async checkInSelf(user: AuthenticatedUser, dto: CheckInSelfDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException("No employee record found for your account. Contact HR to register your email.");

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { companyId_employeeId_date: { companyId: user.companyId, employeeId: employee.id, date } },
      select: { id: true },
    });

    const data = {
      companyId: user.companyId,
      employeeId: employee.id,
      date,
      checkInTime: dto.checkInTime ? new Date(dto.checkInTime) : new Date(),
      status: dto.status ?? "PRESENT",
      overtimeHours: dto.overtimeHours ?? undefined,
      geoLat: dto.geoLat ?? undefined,
      geoLon: dto.geoLon ?? undefined,
      notes: dto.notes,
      recordedById: user.id,
    };

    const row = existing
      ? await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data: data as never, select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, hoursWorked: true, overtimeHours: true, notes: true } })
      : await this.prisma.attendanceRecord.create({ data: data as never, select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, hoursWorked: true, overtimeHours: true, notes: true } });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "AttendanceRecord", entityId: row.id, action: existing ? "UPDATE" : "CREATE", ...ctx });
    return { data: row };
  }

  async recordAttendance(user: AuthenticatedUser, dto: RecordAttendanceDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { companyId_employeeId_date: { companyId: user.companyId, employeeId: dto.employeeId, date } },
      select: { id: true },
    });

    let hoursWorked: number | undefined;
    if (dto.checkInTime && dto.checkOutTime) {
      const inTime = new Date(dto.checkInTime);
      const outTime = new Date(dto.checkOutTime);
      hoursWorked = (outTime.getTime() - inTime.getTime()) / 3_600_000;
    }

    const data = {
      companyId: user.companyId,
      employeeId: dto.employeeId,
      date,
      checkInTime: dto.checkInTime ? new Date(dto.checkInTime) : undefined,
      checkOutTime: dto.checkOutTime ? new Date(dto.checkOutTime) : undefined,
      status: dto.status ?? "PRESENT",
      hoursWorked,
      shiftId: dto.shiftId,
      geoLat: dto.geoLat ?? undefined,
      geoLon: dto.geoLon ?? undefined,
      notes: dto.notes,
      recordedById: user.id,
    };

    const row = existing
      ? await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data: data as never, select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, hoursWorked: true, overtimeHours: true, notes: true } })
      : await this.prisma.attendanceRecord.create({ data: data as never, select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, hoursWorked: true, overtimeHours: true, notes: true } });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "AttendanceRecord", entityId: row.id, action: existing ? "UPDATE" : "CREATE", ...ctx });
    return { data: row };
  }

  async bulkRecordAttendance(user: AuthenticatedUser, dto: BulkAttendanceDto, ctx: RequestContext) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);
    const results: unknown[] = [];

    for (const rec of dto.records) {
      let hoursWorked: number | undefined;
      if (rec.checkInTime && rec.checkOutTime) {
        const inTime = new Date(rec.checkInTime);
        const outTime = new Date(rec.checkOutTime);
        hoursWorked = (outTime.getTime() - inTime.getTime()) / 3_600_000;
      }
      const row = await this.prisma.attendanceRecord.upsert({
        where: { companyId_employeeId_date: { companyId: user.companyId, employeeId: rec.employeeId, date } },
        create: { companyId: user.companyId, employeeId: rec.employeeId, date, status: rec.status, checkInTime: rec.checkInTime ? new Date(rec.checkInTime) : undefined, checkOutTime: rec.checkOutTime ? new Date(rec.checkOutTime) : undefined, hoursWorked, shiftId: rec.shiftId, notes: rec.notes, recordedById: user.id },
        update: { status: rec.status, checkInTime: rec.checkInTime ? new Date(rec.checkInTime) : undefined, checkOutTime: rec.checkOutTime ? new Date(rec.checkOutTime) : undefined, hoursWorked, shiftId: rec.shiftId, notes: rec.notes, recordedById: user.id },
        select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, hoursWorked: true },
      });
      results.push(row);
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "AttendanceRecord", entityId: "bulk", action: "CREATE", ...ctx });
    return { data: results };
  }

  // â"€â"€â"€ Shifts â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async listShifts(user: AuthenticatedUser) {
    const rows = await this.prisma.shift.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    return { data: rows };
  }

  async createShift(user: AuthenticatedUser, dto: CreateShiftDto, ctx: RequestContext) {
    const exists = await this.prisma.shift.findUnique({ where: { companyId_code: { companyId: user.companyId, code: dto.code } } });
    if (exists) throw new BadRequestException(`Shift code "${dto.code}" already exists`);

    const row = await this.prisma.shift.create({ data: { companyId: user.companyId, createdById: user.id, ...dto } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Shift", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â"€â"€â"€ Tasks â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async myTasks(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true },
    });

    if (!employee) return { data: [] };

    const assignments = await this.prisma.taskAssignment.findMany({
      where: { companyId: user.companyId, employeeId: employee.id, status: { not: "CANCELLED" as never } },
      include: {
        task: {
          include: {
            farm:   { select: { name: true } },
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ task: { dueDate: "asc" } }, { createdAt: "desc" }],
      take: 50,
    });

    return {
      data: assignments.map((a) => ({
        id:          a.id,
        title:       a.task.title,
        description: a.task.description,
        status:      a.status,
        priority:    a.task.priority,
        dueDate:     a.task.dueDate?.toISOString(),
        farm:        a.task.farm,
        notes:       a.notes,
      })),
    };
  }

  async listTasks(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.task.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.priority ? { priority: query.priority as never } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.search ? { OR: [{ title: { contains: query.search } }, { taskType: { contains: query.search } }] } : {}),
      },
      include: {
        branch: { select: { name: true } },
        farm: { select: { name: true } },
        assignments: { include: { employee: { select: { fullName: true, code: true } } } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    return { data: rows };
  }

  async getTask(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.task.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        branch: { select: { name: true } },
        farm: { select: { name: true } },
        productionSite: { select: { name: true } },
        assignedBy: { select: { fullName: true } },
        assignments: { include: { employee: { select: { id: true, fullName: true, code: true } }, assignedBy: { select: { fullName: true } } } },
      },
    });
    if (!row) throw new NotFoundException("Task not found");
    return { data: row };
  }

  async createTask(user: AuthenticatedUser, dto: CreateTaskDto, ctx: RequestContext) {
    const { assigneeIds, ...taskData } = dto;
    const row = await this.prisma.task.create({
      data: {
        companyId: user.companyId,
        ...taskData,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedById: user.id,
        createdById: user.id,
        ...(assigneeIds?.length
          ? {
              assignments: {
                create: assigneeIds.map((eid) => ({ companyId: user.companyId, employeeId: eid, assignedById: user.id })),
              },
            }
          : {}),
      },
      select: { id: true, companyId: true, title: true, priority: true, status: true, dueDate: true, notes: true, createdAt: true, assignments: { select: { id: true, employeeId: true, status: true } } },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Task", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateTaskStatus(user: AuthenticatedUser, id: string, dto: UpdateTaskStatusDto, ctx: RequestContext) {
    const row = await this.prisma.task.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Task not found");

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status as never,
        notes: dto.notes,
        completedAt: dto.status === "COMPLETED" ? new Date() : undefined,
        updatedById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Task", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async assignTask(user: AuthenticatedUser, dto: AssignTaskDto, ctx: RequestContext) {
    const task = await this.prisma.task.findFirst({ where: { id: dto.taskId, companyId: user.companyId, deletedAt: null } });
    if (!task) throw new NotFoundException("Task not found");

    const created = await Promise.all(
      dto.employeeIds.map((eid) =>
        this.prisma.taskAssignment.upsert({
          where: { taskId_employeeId: { taskId: dto.taskId, employeeId: eid } },
          create: { companyId: user.companyId, taskId: dto.taskId, employeeId: eid, assignedById: user.id },
          update: { status: "ASSIGNED", assignedById: user.id },
        })
      )
    );

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "TaskAssignment", entityId: dto.taskId, action: "UPDATE", ...ctx });
    return { data: created };
  }

  async updateAssignmentStatus(user: AuthenticatedUser, assignmentId: string, dto: UpdateAssignmentStatusDto, ctx: RequestContext) {
    const assignment = await this.prisma.taskAssignment.findFirst({ where: { id: assignmentId, companyId: user.companyId } });
    if (!assignment) throw new NotFoundException("Assignment not found");

    const updated = await this.prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: {
        status: dto.status as never,
        notes: dto.notes,
        completedAt: dto.status === "COMPLETED" ? new Date() : undefined,
      },
    });

    // Sync task status if all assignments are complete
    if (dto.status === "COMPLETED") {
      const allAssignments = await this.prisma.taskAssignment.findMany({ where: { taskId: assignment.taskId } });
      const allDone = allAssignments.every((a) => a.status === "COMPLETED" || a.status === "REJECTED");
      if (allDone) {
        await this.prisma.task.update({ where: { id: assignment.taskId }, data: { status: "COMPLETED", completedAt: new Date() } });
      }
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "TaskAssignment", entityId: assignmentId, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â"€â"€â"€ Payroll â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async getMyPayslips(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true },
    });
    if (!emp) return { data: [] };

    const rows = await this.prisma.payrollRecord.findMany({
      where: { companyId: user.companyId, employeeId: emp.id, deletedAt: null },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: 24,
    });
    return { data: rows };
  }

  async listPayroll(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.payrollRecord.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        employeeId: { not: null },
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.period ? { period: query.period } : {}),
      },
      include: { employee: { select: { fullName: true, code: true } }, branch: { select: { name: true } } },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return { data: rows };
  }

  async createPayrollRecord(user: AuthenticatedUser, dto: CreatePayrollRecordDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true, branchId: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    const allowances = dto.allowances ?? 0;
    const deductions = dto.deductions ?? 0;
    const overtimePay = dto.overtimePay ?? 0;
    const grossPay = num(dto.basicSalary) + allowances + overtimePay - deductions;
    const computed = this.computePaye(grossPay);
    const taxDeduction = dto.taxDeduction ?? computed.paye;
    const ssnit = dto.ssnit ?? computed.ssnit;
    const employerSsnit = dto.employerSsnit ?? computed.employerSsnit;
    const pensionTier2 = dto.pensionTier2 ?? computed.pensionTier2;
    const pensionTier3 = dto.pensionTier3 ?? 0;
    const netPay = grossPay - taxDeduction - ssnit;

    const reference = nextRef("PAY");

    const row = await this.prisma.payrollRecord.create({
      data: {
        companyId: user.companyId,
        reference,
        period: dto.period,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        employeeName: employee.fullName,
        employeeCode: employee.code,
        employeeId: dto.employeeId,
        basicSalary: dto.basicSalary,
        allowances,
        deductions,
        grossPay,
        taxDeduction,
        ssnit,
        employerSsnit,
        pensionTier2,
        pensionTier3,
        overtimePay,
        allowanceBreakdown: dto.allowanceBreakdown ?? undefined,
        netPay,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        paymentMethod: dto.paymentMethod as never,
        bankAccountId: dto.bankAccountId,
        branchId: employee.branchId,
        notes: dto.notes,
        createdById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async approvePayroll(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Payroll record not found");
    if (row.status !== "DRAFT") throw new BadRequestException("Only DRAFT records can be approved");
    if (row.createdById === user.id) throw new ForbiddenException("You cannot approve a payroll record you created. A different manager must approve it.");

    const updated = await this.prisma.payrollRecord.update({ where: { id }, data: { status: "APPROVED", updatedById: user.id } });
    void this.notifications.broadcast(user.companyId, "HR_MANAGE", { type: "PAYROLL_APPROVED" as never, title: "Payroll Approved", body: `${row.employeeName} ${row.period} payroll approved`, entityType: "PayrollRecord", entityId: id });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: id, action: "APPROVE", ...ctx });
    return { data: updated };
  }

  async markPayrollPaid(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, include: { employee: { select: { email: true } } } });
    if (!row) throw new NotFoundException("Payroll record not found");
    if (row.status !== "APPROVED") throw new BadRequestException("Only APPROVED records can be marked as paid");

    const updated = await this.prisma.payrollRecord.update({ where: { id }, data: { status: "PAID", paymentDate: row.paymentDate ?? new Date(), updatedById: user.id } });

    // Create expense in Finance
    void this.createPayrollExpense(user, row, ctx).catch(() => {/* non-fatal */});

    // Notify employee
    const empEmail = (row as any).employee?.email;
    if (empEmail) {
      const empUser = await this.prisma.user.findFirst({ where: { email: empEmail, companyId: user.companyId } });
      if (empUser) void this.notifications.send({ companyId: user.companyId, userId: empUser.id, type: "PAYROLL_PAID" as never, title: "Payslip Ready", body: `Your ${row.period} salary has been processed. Net pay: GHS ${Number(row.netPay).toFixed(2)}`, entityType: "PayrollRecord", entityId: id });
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â"€â"€â"€ Training â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async listTraining(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.trainingRecord.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { outcome: query.status as never } : {}),
        ...(query.search ? { title: { contains: query.search } } : {}),
      },
      select: {
        id: true, companyId: true, employeeId: true, title: true, description: true,
        trainer: true, durationHours: true, trainingDate: true,
        outcome: true, certificate: true, notes: true, courseId: true, certificateExpiry: true,
        createdById: true, createdAt: true, updatedAt: true, deletedAt: true,
        employee: { select: { fullName: true, code: true } },
      },
      orderBy: { trainingDate: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async createTrainingRecord(user: AuthenticatedUser, dto: CreateTrainingRecordDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    const row = await this.prisma.trainingRecord.create({
      data: {
        companyId: user.companyId, createdById: user.id,
        employeeId: dto.employeeId, title: dto.title,
        description: dto.description, trainer: dto.trainer,
        durationHours: dto.durationHours,
        outcome: dto.outcome, certificate: dto.certificate, notes: dto.notes,
        trainingDate: new Date(dto.trainingDate),
        courseId: dto.courseId ?? undefined,
        certificateExpiry: dto.certificateExpiry ? new Date(dto.certificateExpiry) : undefined,
      },
      select: { id: true, companyId: true, employeeId: true, title: true, description: true, trainer: true, durationHours: true, trainingDate: true, outcome: true, certificate: true, notes: true, courseId: true, certificateExpiry: true, createdAt: true },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "TrainingRecord", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â"€â"€â"€ Performance â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async listPerformance(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.hRPerformanceRecord.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.period ? { period: query.period } : {}),
        ...(query.status ? { status: query.status as never } : {}),
      },
      include: { employee: { select: { fullName: true, code: true } }, reviewer: { select: { fullName: true } } },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return { data: rows };
  }

  async createPerformanceRecord(user: AuthenticatedUser, dto: CreatePerformanceRecordDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    const exists = await this.prisma.hRPerformanceRecord.findUnique({
      where: { companyId_employeeId_period: { companyId: user.companyId, employeeId: dto.employeeId, period: dto.period } },
    });
    if (exists) throw new BadRequestException(`Performance record for ${dto.period} already exists for this employee`);

    const row = await this.prisma.hRPerformanceRecord.create({
      data: { companyId: user.companyId, reviewerId: user.id, createdById: user.id, ...dto },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "HRPerformanceRecord", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async acknowledgePerformance(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.hRPerformanceRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Performance record not found");
    if (row.status !== "REVIEWED") throw new BadRequestException("Only REVIEWED records can be acknowledged");

    const updated = await this.prisma.hRPerformanceRecord.update({ where: { id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "HRPerformanceRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â"€â"€â"€ Department Assignments â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async listDepartmentAssignments(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.departmentAssignment.findMany({
      where: {
        companyId: user.companyId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { employee: { select: { fullName: true, code: true } }, branch: { select: { name: true } }, farm: { select: { name: true } } },
      orderBy: { startDate: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async createDepartmentAssignment(user: AuthenticatedUser, dto: CreateDepartmentAssignmentDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    if (dto.isPrimary !== false) {
      await this.prisma.departmentAssignment.updateMany({
        where: { employeeId: dto.employeeId, companyId: user.companyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const row = await this.prisma.departmentAssignment.create({
      data: { companyId: user.companyId, createdById: user.id, ...dto, startDate: new Date(dto.startDate), endDate: dto.endDate ? new Date(dto.endDate) : undefined },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "DepartmentAssignment", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â"€â"€â"€ Reports â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  async productivityReport(user: AuthenticatedUser, query: HRQueryDto) {
    const cid = user.companyId;
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();

    const [attendanceSummary, taskSummary, employees] = await Promise.all([
      this.prisma.attendanceRecord.groupBy({
        by: ["employeeId", "status"],
        where: { companyId: cid, date: { gte: dateFrom, lte: dateTo } },
        _count: { status: true },
      }),
      this.prisma.taskAssignment.groupBy({
        by: ["employeeId", "status"],
        where: { companyId: cid, createdAt: { gte: dateFrom, lte: dateTo } },
        _count: { status: true },
      }),
      this.prisma.employee.findMany({
        where: { companyId: cid, deletedAt: null, ...(query.branchId ? { branchId: query.branchId } : {}) },
        select: { id: true, code: true, fullName: true, employeeRole: { select: { name: true } }, branch: { select: { name: true } } },
      }),
    ]);

    const report = employees.map((emp) => {
      const attendance = attendanceSummary.filter((a) => a.employeeId === emp.id);
      const tasks = taskSummary.filter((t) => t.employeeId === emp.id);
      const present = attendance.find((a) => a.status === "PRESENT")?._count.status ?? 0;
      const absent = attendance.find((a) => a.status === "ABSENT")?._count.status ?? 0;
      const late = attendance.find((a) => a.status === "LATE")?._count.status ?? 0;
      const totalAttendance = attendance.reduce((s, a) => s + a._count.status, 0);
      const completedTasks = tasks.find((t) => t.status === "COMPLETED")?._count.status ?? 0;
      const totalTasks = tasks.reduce((s, t) => s + t._count.status, 0);

      return {
        employee: emp,
        attendance: { present, absent, late, total: totalAttendance, rate: totalAttendance > 0 ? ((present + late * 0.5) / totalAttendance * 100).toFixed(1) : "0" },
        tasks: { completed: completedTasks, total: totalTasks, rate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : "0" },
      };
    });

    return { data: { period: { from: dateFrom, to: dateTo }, employees: report } };
  }

  // ─── Leave Requests ──────────────────────────────────────────────────────────

  async submitLeaveRequest(user: AuthenticatedUser, dto: CreateLeaveRequestDto, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true, fullName: true, code: true },
    });

    const reference = nextRef("LVR");

    const row = await this.prisma.leaveRequest.create({
      data: {
        companyId: user.companyId,
        reference,
        employeeId: emp?.id ?? undefined,
        employeeName: emp?.fullName ?? user.fullName,
        employeeCode: emp?.code ?? undefined,
        leaveType: dto.leaveType as never,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        daysRequested: dto.daysRequested,
        reason: dto.reason,
        createdById: user.id,
      },
    });

    // Update pending balance if we have an employee record
    if (emp) {
      await this.upsertLeaveBalance(user.companyId, emp.id, dto.leaveType, new Date().getFullYear(), { pendingDelta: dto.daysRequested });
    }

    void this.notifications.broadcast(user.companyId, "HR_MANAGE", { type: "LEAVE_REQUEST_SUBMITTED" as never, title: "New Leave Request", body: `${row.employeeName} submitted a ${row.leaveType} leave request (${row.daysRequested} days)`, entityType: "LeaveRequest", entityId: row.id });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeaveRequest", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async myLeaveRequests(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      select: { id: true },
    });

    if (!emp) return { data: [] };

    const rows = await this.prisma.leaveRequest.findMany({
      where: { companyId: user.companyId, employeeId: emp.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { employee: { select: { fullName: true, code: true } } },
    });
    return { data: rows };
  }

  async listLeaveRequests(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { employee: { select: { fullName: true, code: true } } },
    });
    return { data: rows };
  }

  async reviewLeaveRequest(user: AuthenticatedUser, id: string, dto: ReviewLeaveRequestDto, ctx: RequestContext) {
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Leave request not found");
    if (row.status !== "PENDING") throw new BadRequestException("Only PENDING requests can be reviewed");

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: dto.decision as never,
        reviewedById: user.id,
        reviewNote: dto.reviewNote,
        reviewedAt: new Date(),
        updatedById: user.id,
      },
    });

    // Adjust leave balance on approval/rejection
    if (row.employeeId) {
      const year = new Date(row.startDate).getFullYear();
      if (dto.decision === "APPROVED") {
        await this.upsertLeaveBalance(user.companyId, row.employeeId, row.leaveType as string, year, {
          pendingDelta: -row.daysRequested,
          takenDelta: row.daysRequested,
        });
      } else {
        await this.upsertLeaveBalance(user.companyId, row.employeeId, row.leaveType as string, year, {
          pendingDelta: -row.daysRequested,
        });
      }
    }

    // Notify the employee
    if (row.employeeId) {
      const emp = await this.prisma.employee.findFirst({ where: { id: row.employeeId }, select: { email: true } });
      const empUser = emp?.email ? await this.prisma.user.findFirst({ where: { email: emp.email, companyId: user.companyId } }) : null;
      if (empUser) {
        const type = dto.decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED";
        void this.notifications.send({ companyId: user.companyId, userId: empUser.id, type: type as never, title: `Leave ${dto.decision}`, body: `Your ${row.leaveType} leave request has been ${dto.decision.toLowerCase()}`, entityType: "LeaveRequest", entityId: id });
      }
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeaveRequest", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async cancelLeaveRequest(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({ where: { companyId: user.companyId, email: user.email, deletedAt: null }, select: { id: true } });
    if (!emp) throw new ForbiddenException("Cannot cancel leave — no employee record linked to your account");
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Leave request not found");
    if (row.employeeId !== emp.id) throw new ForbiddenException("Cannot cancel another employee's leave request");
    if (row.status !== "PENDING") throw new BadRequestException("Only PENDING requests can be cancelled");

    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: "CANCELLED", updatedById: user.id } });

    // Restore pending balance
    const year = new Date(row.startDate).getFullYear();
    await this.upsertLeaveBalance(user.companyId, emp.id, row.leaveType as string, year, { pendingDelta: -row.daysRequested });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeaveRequest", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // ─── Task management ─────────────────────────────────────────────────────────

  async updateTask(user: AuthenticatedUser, id: string, dto: UpdateTaskDto, ctx: RequestContext) {
    const row = await this.prisma.task.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Task not found");
    const updated = await this.prisma.task.update({
      where: { id },
      data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, updatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Task", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteTask(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.task.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Task not found");
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Task", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── Shift management ────────────────────────────────────────────────────────

  async updateShift(user: AuthenticatedUser, id: string, dto: UpdateShiftDto, ctx: RequestContext) {
    const row = await this.prisma.shift.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Shift not found");
    const updated = await this.prisma.shift.update({ where: { id }, data: { ...dto, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Shift", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deactivateShift(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.shift.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Shift not found");
    const updated = await this.prisma.shift.update({ where: { id }, data: { isActive: false, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Shift", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // ─── Employee Role management ─────────────────────────────────────────────────

  async updateEmployeeRole(user: AuthenticatedUser, id: string, dto: UpdateEmployeeRoleDto, ctx: RequestContext) {
    const row = await this.prisma.employeeRole.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Employee role not found");
    const updated = await this.prisma.employeeRole.update({ where: { id }, data: { ...dto, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "EmployeeRole", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteEmployee(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.employee.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundException("Employee not found");
    await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: "TERMINATED" as never, updatedById: user.id },
      select: { id: true },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── Performance workflow ────────────────────────────────────────────────────

  async submitPerformance(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.hRPerformanceRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Performance record not found");
    if (row.status !== "DRAFT") throw new BadRequestException("Only DRAFT records can be submitted");
    const updated = await this.prisma.hRPerformanceRecord.update({ where: { id }, data: { status: "SUBMITTED", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "HRPerformanceRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async reviewPerformance(user: AuthenticatedUser, id: string, dto: ReviewPerformanceDto, ctx: RequestContext) {
    const row = await this.prisma.hRPerformanceRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Performance record not found");
    if (row.status !== "SUBMITTED") throw new BadRequestException("Only SUBMITTED records can be reviewed");
    const updated = await this.prisma.hRPerformanceRecord.update({
      where: { id },
      data: { status: "REVIEWED", reviewerId: user.id, updatedById: user.id, ...dto },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "HRPerformanceRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // ─── Self check-out ───────────────────────────────────────────────────────────

  async checkoutSelf(user: AuthenticatedUser, dto: CheckOutSelfDto, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({ where: { companyId: user.companyId, email: user.email, deletedAt: null }, select: { id: true } });
    if (!emp) throw new ForbiddenException("No employee record linked to your account");

    const date = new Date(dto.date);
    const row = await this.prisma.attendanceRecord.findFirst({
      where: { companyId: user.companyId, employeeId: emp.id, date },
      select: { id: true, checkOutTime: true, notes: true },
    });
    if (!row) throw new NotFoundException("No check-in record found for this date");
    if (row.checkOutTime) throw new BadRequestException("Already checked out for this date");

    const updated = await this.prisma.attendanceRecord.update({
      where: { id: row.id },
      data: {
        checkOutTime: dto.checkOutTime ? new Date(dto.checkOutTime) : new Date(),
        notes: dto.notes ?? row.notes,
      },
      select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true, hoursWorked: true, notes: true },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "AttendanceRecord", entityId: row.id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // ─── Payroll estimate ────────────────────────────────────────────────────────

  private computePaye(grossMonthly: number): { paye: number; ssnit: number; employerSsnit: number; pensionTier2: number } {
    const ssnit = Math.round(grossMonthly * 0.055 * 100) / 100;
    // Employer SSNIT 13%: 8% SSNIT + 5% Tier 2 (NPRA)
    const employerSsnit = Math.round(grossMonthly * 0.08 * 100) / 100;
    const pensionTier2 = Math.round(grossMonthly * 0.05 * 100) / 100;
    const taxableMonthly = grossMonthly - ssnit;
    const annualTaxable = taxableMonthly * 12;

    // Ghana 2024 PAYE annual bands
    const bands = [
      { limit: 4380, rate: 0 },
      { limit: 1320, rate: 0.05 },
      { limit: 1560, rate: 0.1 },
      { limit: 36000, rate: 0.175 },
      { limit: 196740, rate: 0.25 },
      { limit: Infinity, rate: 0.3 },
    ];

    let annualPaye = 0;
    let remaining = annualTaxable;
    for (const band of bands) {
      if (remaining <= 0) break;
      const taxable = Math.min(remaining, band.limit);
      annualPaye += taxable * band.rate;
      remaining -= taxable;
    }

    return { paye: Math.round((annualPaye / 12) * 100) / 100, ssnit, employerSsnit, pensionTier2 };
  }

  async computePayrollEstimate(user: AuthenticatedUser, dto: ComputePayrollDto) {
    const allowances = dto.allowances ?? 0;
    const deductions = dto.deductions ?? 0;
    const grossMonthly = num(dto.basicSalary) + allowances - deductions;
    const { paye, ssnit, employerSsnit, pensionTier2 } = this.computePaye(grossMonthly);
    const netPay = Math.round((grossMonthly - paye - ssnit) * 100) / 100;
    return { data: { grossMonthly, ssnit, paye, netPay, totalDeductions: paye + ssnit, employerSsnit, pensionTier2 } };
  }

  async prefillPayroll(user: AuthenticatedUser, employeeId: string, period: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    const [year, month] = period.split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    const attendance = await this.prisma.attendanceRecord.findMany({
      where: { companyId: user.companyId, employeeId, date: { gte: periodStart, lte: periodEnd } },
      select: { id: true, status: true, hoursWorked: true, overtimeHours: true },
    });

    const daysPresent = attendance.filter(a => ["PRESENT", "LATE", "HALF_DAY"].includes(a.status)).length;
    const daysAbsent = attendance.filter(a => a.status === "ABSENT").length;
    const totalHours = attendance.reduce((s, a) => s + num(a.hoursWorked), 0);
    const overtimeHoursTotal = attendance.reduce((s, a) => s + num((a as any).overtimeHours), 0);

    const basicSalary = num(employee.basicSalary);
    const overtimePay = Math.round(overtimeHoursTotal * (basicSalary / 208) * 1.5 * 100) / 100; // 208 = 26 days × 8 h
    const grossMonthly = basicSalary + overtimePay;
    const { paye, ssnit, employerSsnit, pensionTier2 } = this.computePaye(grossMonthly);
    const netPay = Math.round((grossMonthly - paye - ssnit) * 100) / 100;

    return {
      data: {
        employeeId,
        employeeName: employee.fullName,
        employeeCode: employee.code,
        period,
        basicSalary,
        overtimePay,
        allowances: 0,
        deductions: 0,
        taxDeduction: paye,
        ssnit,
        employerSsnit,
        pensionTier2,
        netPay,
        attendanceSummary: { daysPresent, daysAbsent, totalHours: Math.round(totalHours * 100) / 100, overtimeHours: Math.round(overtimeHoursTotal * 100) / 100 },
      },
    };
  }

  async bulkPayrollRun(user: AuthenticatedUser, dto: BulkPayrollRunDto, ctx: RequestContext) {
    const where: any = { companyId: user.companyId, status: "ACTIVE", deletedAt: null };
    if (dto.branchId) where.branchId = dto.branchId;
    if (dto.employeeIds?.length) where.id = { in: dto.employeeIds };

    const employees = await this.prisma.employee.findMany({ where, select: { id: true, fullName: true, code: true, basicSalary: true, employeeRoleId: true, branchId: true } });
    const [year, month] = dto.period.split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const employee of employees) {
      try {
        const existing = await this.prisma.payrollRecord.findFirst({ where: { companyId: user.companyId, employeeId: employee.id, period: dto.period, deletedAt: null } });
        if (existing) { skipped++; continue; }

        const attendance = await this.prisma.attendanceRecord.findMany({ where: { companyId: user.companyId, employeeId: employee.id, date: { gte: periodStart, lte: periodEnd } }, select: { id: true, status: true, hoursWorked: true, overtimeHours: true } });
        const overtimeHoursTotal = attendance.reduce((s, a) => s + num((a as any).overtimeHours), 0);
        const basicSalary = num(employee.basicSalary);
        const overtimePay = Math.round(overtimeHoursTotal * (basicSalary / 208) * 1.5 * 100) / 100;
        const grossMonthly = basicSalary + overtimePay;
        const { paye, ssnit, employerSsnit, pensionTier2 } = this.computePaye(grossMonthly);
        const netPay = Math.round((grossMonthly - paye - ssnit) * 100) / 100;

        await this.prisma.payrollRecord.create({
          data: {
            companyId: user.companyId,
            reference: nextRef("PAY"),
            period: dto.period,
            periodStart: new Date(dto.periodStart),
            periodEnd: new Date(dto.periodEnd),
            employeeName: employee.fullName,
            employeeCode: employee.code,
            employeeId: employee.id,
            branchId: employee.branchId,
            basicSalary,
            allowances: 0,
            deductions: 0,
            grossPay: grossMonthly,
            taxDeduction: paye,
            ssnit,
            employerSsnit,
            pensionTier2,
            overtimePay,
            netPay,
            createdById: user.id,
          },
        });
        created++;
      } catch (e: any) {
        errors.push(`${employee.code}: ${e?.message ?? "unknown error"}`);
      }
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: "bulk", action: "CREATE", ...ctx });
    return { data: { created, skipped, errors, period: dto.period } };
  }

  // ─── HR Reports ───────────────────────────────────────────────────────────────

  async reportHeadcount(user: AuthenticatedUser, query: HRQueryDto) {
    const cid = user.companyId;
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(new Date().getFullYear(), 0, 1);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();

    const [newHires, terminations, activeCount] = await Promise.all([
      this.prisma.employee.count({
        where: { companyId: cid, deletedAt: null, startDate: { gte: dateFrom, lte: dateTo } },
      }),
      this.prisma.employee.count({
        where: { companyId: cid, deletedAt: { not: null, gte: dateFrom, lte: dateTo } },
      }),
      this.prisma.employee.count({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" as never } }),
    ]);

    return { data: { period: { from: dateFrom, to: dateTo }, newHires, terminations, activeCount, netChange: newHires - terminations } };
  }

  async reportLeaveSummary(user: AuthenticatedUser, query: HRQueryDto) {
    const cid = user.companyId;
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();

    const byType = await this.prisma.leaveRequest.groupBy({
      by: ["leaveType", "status"],
      where: { companyId: cid, deletedAt: null, startDate: { gte: dateFrom, lte: dateTo } },
      _count: { id: true },
      _sum: { daysRequested: true },
    }).catch(() => [] as any[]);

    return { data: { period: { from: dateFrom, to: dateTo }, breakdown: byType } };
  }

  // ─── HR-A: Leave Policy ───────────────────────────────────────────────────────

  async createLeavePolicy(user: AuthenticatedUser, dto: CreateLeavePolicyDto, ctx: RequestContext) {
    const policy = await this.prisma.leavePolicy.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        leaveType: dto.leaveType as never,
        daysPerYear: dto.daysPerYear,
        carryOverDays: dto.carryOverDays ?? 0,
        employeeRoleId: dto.employeeRoleId ?? undefined,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeavePolicy", entityId: policy.id, action: "CREATE", ...ctx });
    return { data: policy };
  }

  async listLeavePolicies(user: AuthenticatedUser) {
    const rows = await this.prisma.leavePolicy.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { leaveType: "asc" },
      include: { employeeRole: { select: { name: true } } },
      take: 200,
    });
    return { data: rows };
  }

  async updateLeavePolicy(user: AuthenticatedUser, id: string, dto: UpdateLeavePolicyDto, ctx: RequestContext) {
    const row = await this.prisma.leavePolicy.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Leave policy not found");
    const updated = await this.prisma.leavePolicy.update({ where: { id }, data: { ...dto, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeavePolicy", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteLeavePolicy(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.leavePolicy.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Leave policy not found");
    await this.prisma.leavePolicy.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeavePolicy", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-A: Leave Balance ──────────────────────────────────────────────────────

  private async upsertLeaveBalance(
    companyId: string,
    employeeId: string,
    leaveType: string,
    year: number,
    delta: { pendingDelta?: number; takenDelta?: number },
  ) {
    try {
      const existing = await this.prisma.leaveBalance.findUnique({
        where: { companyId_employeeId_leaveType_year: { companyId, employeeId, leaveType: leaveType as never, year } },
      });

      if (existing) {
        const newPending = Math.max(0, existing.pending + (delta.pendingDelta ?? 0));
        const newTaken = Math.max(0, existing.taken + (delta.takenDelta ?? 0));
        const newRemaining = Math.max(0, existing.entitled + existing.carryOver - newTaken - newPending);
        await this.prisma.leaveBalance.update({
          where: { id: existing.id },
          data: { pending: newPending, taken: newTaken, remaining: newRemaining },
        });
      } else {
        // Find entitlement from policy
        const policy = await this.prisma.leavePolicy.findFirst({
          where: { companyId, leaveType: leaveType as never, deletedAt: null, isActive: true },
        });
        const entitled = policy?.daysPerYear ?? 0;
        const pending = Math.max(0, delta.pendingDelta ?? 0);
        const taken = Math.max(0, delta.takenDelta ?? 0);
        const remaining = Math.max(0, entitled - taken - pending);
        await this.prisma.leaveBalance.create({
          data: { companyId, employeeId, leaveType: leaveType as never, year, entitled, taken, pending, remaining, carryOver: 0 },
        });
      }
    } catch {
      // non-fatal — balance update failure should not block leave request
    }
  }

  async listLeaveBalances(user: AuthenticatedUser, query: HRQueryDto) {
    const year = query.period ? parseInt(query.period) : new Date().getFullYear();
    const rows = await this.prisma.leaveBalance.findMany({
      where: {
        companyId: user.companyId,
        year,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      orderBy: [{ employeeId: "asc" }, { leaveType: "asc" }],
      include: { employee: { select: { fullName: true, code: true } } },
      take: 500,
    });
    return { data: rows };
  }

  async myLeaveBalance(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({ where: { companyId: user.companyId, email: user.email, deletedAt: null }, select: { id: true } });
    if (!emp) return { data: [] };
    const year = new Date().getFullYear();
    const rows = await this.prisma.leaveBalance.findMany({
      where: { companyId: user.companyId, employeeId: emp.id, year },
      orderBy: { leaveType: "asc" },
    });
    return { data: rows };
  }

  async initializeLeaveBalances(user: AuthenticatedUser, dto: InitializeLeaveBalanceDto, ctx: RequestContext) {
    const policies = await this.prisma.leavePolicy.findMany({
      where: { companyId: user.companyId, isActive: true, deletedAt: null },
    });
    if (policies.length === 0) throw new BadRequestException("No active leave policies found. Create policies first.");

    const employees = await this.prisma.employee.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        status: "ACTIVE" as never,
        ...(dto.employeeIds?.length ? { id: { in: dto.employeeIds } } : {}),
      },
      select: { id: true, employeeRoleId: true },
    });

    let created = 0;
    let skipped = 0;

    for (const emp of employees) {
      for (const policy of policies) {
        // Skip role-specific policies that don't match
        if (policy.employeeRoleId && policy.employeeRoleId !== emp.employeeRoleId) continue;

        const existing = await this.prisma.leaveBalance.findUnique({
          where: { companyId_employeeId_leaveType_year: { companyId: user.companyId, employeeId: emp.id, leaveType: policy.leaveType, year: dto.year } },
        });

        if (existing) { skipped++; continue; }

        await this.prisma.leaveBalance.create({
          data: {
            companyId: user.companyId,
            employeeId: emp.id,
            leaveType: policy.leaveType,
            year: dto.year,
            entitled: policy.daysPerYear,
            remaining: policy.daysPerYear,
            carryOver: 0,
          },
        });
        created++;
      }
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeaveBalance", entityId: "bulk", action: "CREATE", summary: `Initialized ${created} leave balances for ${dto.year}`, ...ctx });
    return { data: { created, skipped, year: dto.year } };
  }

  // ─── HR-A: Public Holidays ────────────────────────────────────────────────────

  private readonly GHANA_PUBLIC_HOLIDAYS = [
    { name: "New Year's Day", month: 1, day: 1 },
    { name: "Constitution Day", month: 1, day: 7 },
    { name: "Independence Day", month: 3, day: 6 },
    { name: "Good Friday", month: 3, day: 29 }, // approximate; adjust yearly
    { name: "Easter Monday", month: 4, day: 1 }, // approximate; adjust yearly
    { name: "May Day (Workers' Day)", month: 5, day: 1 },
    { name: "Africa Day", month: 5, day: 25 },
    { name: "Founders' Day", month: 8, day: 4 },
    { name: "Kwame Nkrumah Memorial Day", month: 9, day: 21 },
    { name: "Farmers' Day", month: 12, day: 6 }, // first Friday of December
    { name: "Christmas Day", month: 12, day: 25 },
    { name: "Boxing Day", month: 12, day: 26 },
    { name: "Eid al-Fitr (approx.)", month: 4, day: 10 }, // varies; placeholder
  ];

  async listPublicHolidays(user: AuthenticatedUser, query: HRQueryDto) {
    const year = query.period ? parseInt(query.period) : undefined;
    const rows = await this.prisma.publicHoliday.findMany({
      where: {
        companyId: user.companyId,
        ...(year ? { date: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) } } : {}),
      },
      orderBy: { date: "asc" },
    });
    return { data: rows };
  }

  async createPublicHoliday(user: AuthenticatedUser, dto: CreatePublicHolidayDto, ctx: RequestContext) {
    const holiday = await this.prisma.publicHoliday.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        date: new Date(dto.date),
        isRecurring: dto.isRecurring ?? true,
        year: dto.year ?? undefined,
        createdById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PublicHoliday", entityId: holiday.id, action: "CREATE", ...ctx });
    return { data: holiday };
  }

  async deletePublicHoliday(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.publicHoliday.findFirst({ where: { id, companyId: user.companyId } });
    if (!row) throw new NotFoundException("Public holiday not found");
    await this.prisma.publicHoliday.delete({ where: { id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PublicHoliday", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  async seedGhanaHolidays(user: AuthenticatedUser, ctx: RequestContext) {
    const year = new Date().getFullYear();
    let created = 0;
    let skipped = 0;

    for (const h of this.GHANA_PUBLIC_HOLIDAYS) {
      const date = new Date(year, h.month - 1, h.day);
      try {
        await this.prisma.publicHoliday.create({
          data: { companyId: user.companyId, name: h.name, date, isRecurring: true, createdById: user.id },
        });
        created++;
      } catch {
        // Unique constraint violation = already exists
        skipped++;
      }
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PublicHoliday", entityId: "bulk", action: "CREATE", summary: `Seeded ${created} Ghana public holidays for ${year}`, ...ctx });
    return { data: { created, skipped, year } };
  }

  // ─── HR-A: Employee Documents ─────────────────────────────────────────────────

  async listEmployeeDocuments(user: AuthenticatedUser, employeeId: string) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true } });
    if (!emp) throw new NotFoundException("Employee not found");
    const rows = await this.prisma.employeeDocument.findMany({
      where: { employeeId, companyId: user.companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return { data: rows };
  }

  async uploadEmployeeDocument(user: AuthenticatedUser, employeeId: string, dto: CreateEmployeeDocumentDto, filename: string, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true } });
    if (!emp) throw new NotFoundException("Employee not found");

    const doc = await this.prisma.employeeDocument.create({
      data: {
        companyId: user.companyId,
        employeeId,
        docType: dto.docType,
        title: dto.title,
        fileUrl: `/api/v1/uploads/documents/${filename}`,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        notes: dto.notes,
        createdById: user.id,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "EmployeeDocument", entityId: doc.id, action: "CREATE", ...ctx });
    return { data: doc };
  }

  async deleteEmployeeDocument(user: AuthenticatedUser, employeeId: string, docId: string, ctx: RequestContext) {
    const doc = await this.prisma.employeeDocument.findFirst({ where: { id: docId, employeeId, companyId: user.companyId, deletedAt: null } });
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.employeeDocument.update({ where: { id: docId }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "EmployeeDocument", entityId: docId, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-C: PDF Payslips ───────────────────────────────────────────────────────

  private async buildPayslipPdf(payrollId: string, companyId: string): Promise<{ pdf: Buffer; filename: string }> {
    const row = await this.prisma.payrollRecord.findFirst({
      where: { id: payrollId, companyId, deletedAt: null },
      include: { employee: { select: { ssnitNumber: true, tinNumber: true, bankName: true, bankAccount: true, email: true } }, company: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException("Payroll record not found");

    const PDFDocument = require("pdfkit") as typeof import("pdfkit");
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    const fmt2 = (n: any) => `GHS ${Number(n ?? 0).toFixed(2)}`;
    const company = (row as any).company?.name ?? "Jokas Farms";
    const emp = (row as any).employee ?? {};

    // Header
    doc.fontSize(20).font("Helvetica-Bold").text(company, { align: "center" });
    doc.fontSize(12).font("Helvetica").text("PAYSLIP", { align: "center" });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.5);

    // Employee info
    doc.fontSize(10).font("Helvetica-Bold").text("Employee Information", { underline: true });
    doc.font("Helvetica");
    doc.text(`Name: ${row.employeeName}   Code: ${row.employeeCode ?? "—"}`);
    doc.text(`SSNIT No: ${emp.ssnitNumber ?? "—"}   TIN: ${emp.tinNumber ?? "—"}`);
    doc.text(`Bank: ${emp.bankName ?? "—"}   Account: ${emp.bankAccount ?? "—"}`);
    doc.text(`Period: ${row.period}   Payment Method: ${(row as any).paymentMethod ?? "—"}`);
    if (row.paymentDate) doc.text(`Payment Date: ${new Date(row.paymentDate).toLocaleDateString("en-GH")}`);
    doc.moveDown(0.5);

    // Earnings table
    doc.font("Helvetica-Bold").text("Earnings", { underline: true });
    doc.font("Helvetica");
    const overtime = num((row as any).overtimePay);
    doc.text(`Basic Salary:         ${fmt2(row.basicSalary)}`);
    if (overtime > 0) doc.text(`Overtime Pay:         ${fmt2(overtime)}`);
    if (num(row.allowances) > 0) doc.text(`Allowances:           ${fmt2(row.allowances)}`);
    doc.font("Helvetica-Bold").text(`Gross Pay:            ${fmt2(row.grossPay)}`);
    doc.font("Helvetica").moveDown(0.5);

    // Deductions table
    doc.font("Helvetica-Bold").text("Deductions (Employee)", { underline: true });
    doc.font("Helvetica");
    doc.text(`Employee SSNIT (5.5%):  ${fmt2(row.ssnit)}`);
    doc.text(`PAYE Tax:               ${fmt2(row.taxDeduction)}`);
    if (num(row.deductions) > 0) doc.text(`Other Deductions:       ${fmt2(row.deductions)}`);
    doc.moveDown(0.5);

    // Net pay
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#cccccc").stroke();
    doc.moveDown(0.3);
    doc.fontSize(12).font("Helvetica-Bold").text(`NET PAY: ${fmt2(row.netPay)}`, { align: "right" });
    doc.fontSize(10).font("Helvetica").moveDown(0.5);

    // Employer contributions
    const empSsnit = num((row as any).employerSsnit);
    const tier2 = num((row as any).pensionTier2);
    if (empSsnit > 0 || tier2 > 0) {
      doc.font("Helvetica-Bold").text("Employer Contributions (for record only)", { underline: true });
      doc.font("Helvetica");
      if (empSsnit > 0) doc.text(`Employer SSNIT (8%):  ${fmt2(empSsnit)}`);
      if (tier2 > 0) doc.text(`Pension Tier 2 (5%):  ${fmt2(tier2)}`);
      doc.moveDown(0.5);
    }

    // Footer
    doc.moveDown(2);
    doc.font("Helvetica").fontSize(9).text("This is a computer-generated payslip. No signature required.", { align: "center", color: "#888888" } as any);
    doc.text(`Reference: ${row.reference}`, { align: "center" });

    doc.end();
    await new Promise<void>((res) => doc.on("end", res));
    return { pdf: Buffer.concat(chunks), filename: `payslip-${row.reference}.pdf` };
  }

  async streamPayslipPdf(user: AuthenticatedUser, id: string, res: Response) {
    const { pdf, filename } = await this.buildPayslipPdf(id, user.companyId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  }

  async emailPayslip(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, include: { employee: { select: { email: true } } } });
    if (!row) throw new NotFoundException("Payroll record not found");
    const empEmail = (row as any).employee?.email;
    if (!empEmail) throw new BadRequestException("No email address on record for this employee.");

    const { pdf, filename } = await this.buildPayslipPdf(id, user.companyId);
    const html = `<p>Dear ${row.employeeName},</p><p>Please find your payslip for ${row.period} attached.</p><p>If you have any queries, please contact HR.</p>`;
    const sent = await this.email.sendWithAttachment(empEmail, `Payslip — ${row.period}`, html, { filename, content: pdf });
    if (!sent) throw new BadRequestException("Email service not configured or send failed.");
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: id, action: "EXPORT", ...ctx });
    return { data: { sent: true, to: empEmail } };
  }

  async bulkEmailPayslips(user: AuthenticatedUser, period: string, ctx: RequestContext) {
    const rows = await this.prisma.payrollRecord.findMany({
      where: { companyId: user.companyId, period, status: { in: ["APPROVED", "PAID"] }, deletedAt: null },
      include: { employee: { select: { email: true } } },
    });

    let sent = 0;
    let failed = 0;
    await Promise.allSettled(rows.map(async (row) => {
      const empEmail = (row as any).employee?.email;
      if (!empEmail) { failed++; return; }
      try {
        const { pdf, filename } = await this.buildPayslipPdf(row.id, user.companyId);
        const html = `<p>Dear ${row.employeeName},</p><p>Please find your payslip for ${row.period} attached.</p>`;
        const ok = await this.email.sendWithAttachment(empEmail, `Payslip — ${row.period}`, html, { filename, content: pdf });
        ok ? sent++ : failed++;
      } catch { failed++; }
    }));

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: "bulk-email", action: "EXPORT", summary: `Sent ${sent}, failed ${failed} for ${period}`, ...ctx });
    return { data: { sent, failed, period } };
  }

  // ─── HR-E: Bank Export + Finance Journal ─────────────────────────────────────

  async bankExportCsv(user: AuthenticatedUser, period: string, res: Response) {
    const rows = await this.prisma.payrollRecord.findMany({
      where: { companyId: user.companyId, period, status: { in: ["APPROVED", "PAID"] as never[] }, deletedAt: null },
      include: { employee: { select: { fullName: true, code: true, bankName: true, bankAccount: true } } },
      orderBy: { createdAt: "asc" },
    });

    const header = "Employee Code,Employee Name,Bank Name,Account Number,Net Pay (GHS),Period\n";
    const lines = rows.map((r) => {
      const e = (r as any).employee ?? {};
      return `"${e.code ?? ""}","${e.fullName ?? r.employeeName}","${e.bankName ?? ""}","${e.bankAccount ?? ""}","${Number(r.netPay).toFixed(2)}","${r.period}"`;
    });
    const csv = header + lines.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-bank-export-${period}.csv"`);
    res.send(csv);
  }

  private async createPayrollExpense(user: AuthenticatedUser, payroll: any, _ctx: RequestContext) {
    let category = await this.prisma.expenseCategory.findFirst({ where: { companyId: user.companyId, name: "Payroll", deletedAt: null } });
    if (!category) {
      category = await this.prisma.expenseCategory.create({
        data: { companyId: user.companyId, name: "Payroll", code: "PAYROLL", description: "Staff salary payments", createdById: user.id },
      });
    }

    const ref = `PAY-${(payroll.reference ?? payroll.id.slice(0, 8)).slice(0, 22)}`;
    await this.prisma.expense.create({
      data: {
        companyId: user.companyId,
        categoryId: category.id,
        reference: ref,
        amount: payroll.netPay,
        description: `Payroll: ${payroll.employeeName} — ${payroll.period}`.slice(0, 240),
        expenseDate: payroll.paymentDate ?? new Date(),
        paymentMethod: "BANK_TRANSFER" as never,
        status: "APPROVED" as never,
        submittedById: user.id,
        approvedById: user.id,
        approvedAt: new Date(),
        createdById: user.id,
      },
    });
  }

  // ─── HR-D: Disciplinary Records ───────────────────────────────────────────────

  async listDisciplinary(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.disciplinaryRecord.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(query.employeeId ? { employeeId: query.employeeId } : {}), ...(query.search ? { category: { contains: query.search } } : {}) },
      include: { employee: { select: { fullName: true, code: true } } },
      orderBy: { incidentDate: "desc" },
      take: 100,
    });
    return { data: rows };
  }

  async createDisciplinaryRecord(user: AuthenticatedUser, dto: CreateDisciplinaryDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true, email: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    const row = await this.prisma.disciplinaryRecord.create({
      data: {
        companyId: user.companyId,
        employeeId: dto.employeeId,
        reference: nextRef("DSC"),
        incidentDate: new Date(dto.incidentDate),
        category: dto.category,
        description: dto.description,
        actionTaken: dto.actionTaken,
        issuedById: user.id,
        notes: dto.notes,
        createdById: user.id,
      },
    });

    // Notify the employee
    const empUser = employee.email ? await this.prisma.user.findFirst({ where: { email: employee.email, companyId: user.companyId } }) : null;
    if (empUser) void this.notifications.send({ companyId: user.companyId, userId: empUser.id, type: "DISCIPLINARY_ISSUED" as never, title: "Disciplinary Notice", body: `A disciplinary action has been recorded for you. Category: ${dto.category}`, entityType: "DisciplinaryRecord", entityId: row.id });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "DisciplinaryRecord", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async acknowledgeDisciplinary(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.disciplinaryRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Disciplinary record not found");
    const updated = await this.prisma.disciplinaryRecord.update({ where: { id }, data: { acknowledgedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "DisciplinaryRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteDisciplinaryRecord(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.disciplinaryRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Disciplinary record not found");
    await this.prisma.disciplinaryRecord.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "DisciplinaryRecord", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-D: Grievance Records ──────────────────────────────────────────────────

  async listGrievances(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.grievanceRecord.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(query.status ? { status: query.status } : {}), ...(query.employeeId ? { employeeId: query.employeeId } : {}) },
      include: { employee: { select: { fullName: true, code: true } } },
      orderBy: { submittedDate: "desc" },
      take: 100,
    });
    return { data: rows };
  }

  async submitGrievance(user: AuthenticatedUser, dto: CreateGrievanceDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true, fullName: true, code: true, basicSalary: true } });
    if (!employee) throw new NotFoundException("Employee not found");

    const row = await this.prisma.grievanceRecord.create({
      data: {
        companyId: user.companyId,
        employeeId: dto.employeeId,
        reference: nextRef("GRV"),
        submittedDate: new Date(dto.submittedDate),
        category: dto.category,
        description: dto.description,
        status: "OPEN",
        createdById: user.id,
      },
    });

    void this.notifications.broadcast(user.companyId, "HR_MANAGE", { type: "GRIEVANCE_UPDATED" as never, title: "New Grievance Submitted", body: `${employee.fullName} has submitted a grievance. Category: ${dto.category}`, entityType: "GrievanceRecord", entityId: row.id });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GrievanceRecord", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async resolveGrievance(user: AuthenticatedUser, id: string, dto: ResolveGrievanceDto, ctx: RequestContext) {
    const row = await this.prisma.grievanceRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Grievance not found");
    const updated = await this.prisma.grievanceRecord.update({ where: { id }, data: { status: "RESOLVED", resolution: dto.resolution, resolvedById: user.id, resolvedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GrievanceRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async closeGrievance(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.grievanceRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Grievance not found");
    const updated = await this.prisma.grievanceRecord.update({ where: { id }, data: { status: "CLOSED", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GrievanceRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteGrievance(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.grievanceRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Grievance not found");
    await this.prisma.grievanceRecord.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "GrievanceRecord", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-F: Org Chart ─────────────────────────────────────────────────────────

  async getOrgChart(user: AuthenticatedUser) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, status: "ACTIVE" as never, deletedAt: null },
      select: {
        id: true, fullName: true, managerId: true, photoUrl: true,
        employeeRole: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { fullName: "asc" },
      take: 500,
    });
    const data = employees.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      managerId: e.managerId,
      photoUrl: e.photoUrl,
      roleTitle: (e as any).employeeRole?.name ?? null,
      branchName: (e as any).branch?.name ?? null,
    }));
    return { data };
  }

  // ─── HR-F: Training Catalog ───────────────────────────────────────────────────

  async listTrainingCourses(user: AuthenticatedUser) {
    const rows = await this.prisma.trainingCourse.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { title: "asc" },
      take: 200,
    });
    return { data: rows };
  }

  async createTrainingCourse(user: AuthenticatedUser, dto: CreateTrainingCourseDto, ctx: RequestContext) {
    const row = await this.prisma.trainingCourse.create({
      data: { companyId: user.companyId, createdById: user.id, ...dto },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "TrainingCourse", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateTrainingCourse(user: AuthenticatedUser, id: string, dto: UpdateTrainingCourseDto, ctx: RequestContext) {
    const row = await this.prisma.trainingCourse.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Training course not found");
    const updated = await this.prisma.trainingCourse.update({ where: { id }, data: { ...dto, updatedAt: new Date() } as never });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "TrainingCourse", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteTrainingCourse(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.trainingCourse.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Training course not found");
    await this.prisma.trainingCourse.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "TrainingCourse", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-G: Salary Bands ───────────────────────────────────────────────────────

  async listSalaryBands(user: AuthenticatedUser) {
    const rows = await this.prisma.salaryBand.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: { employeeRole: { select: { name: true } } },
      orderBy: [{ grade: "asc" }, { effectiveDate: "desc" }],
      take: 200,
    });
    return { data: rows };
  }

  async createSalaryBand(user: AuthenticatedUser, dto: CreateSalaryBandDto, ctx: RequestContext) {
    const row = await this.prisma.salaryBand.create({
      data: { companyId: user.companyId, createdById: user.id, ...dto, effectiveDate: new Date(dto.effectiveDate) },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "SalaryBand", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateSalaryBand(user: AuthenticatedUser, id: string, dto: UpdateSalaryBandDto, ctx: RequestContext) {
    const row = await this.prisma.salaryBand.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Salary band not found");
    const updated = await this.prisma.salaryBand.update({ where: { id }, data: { ...dto, effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined } as never });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "SalaryBand", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteSalaryBand(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.salaryBand.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Salary band not found");
    await this.prisma.salaryBand.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "SalaryBand", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-G: Job Postings ───────────────────────────────────────────────────────

  async listJobPostings(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.jobPosting.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(query.status ? { status: query.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { data: rows };
  }

  async createJobPosting(user: AuthenticatedUser, dto: CreateJobPostingDto, ctx: RequestContext) {
    const ref = nextRef("JOB");
    const row = await this.prisma.jobPosting.create({
      data: { companyId: user.companyId, reference: ref, createdById: user.id, ...dto, closingDate: dto.closingDate ? new Date(dto.closingDate) : undefined },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "JobPosting", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateJobPosting(user: AuthenticatedUser, id: string, dto: UpdateJobPostingDto, ctx: RequestContext) {
    const row = await this.prisma.jobPosting.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Job posting not found");
    const updated = await this.prisma.jobPosting.update({ where: { id }, data: { ...dto, closingDate: dto.closingDate ? new Date(dto.closingDate) : undefined, updatedById: user.id } as never });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "JobPosting", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async closeJobPosting(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.jobPosting.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Job posting not found");
    await this.prisma.jobPosting.update({ where: { id }, data: { status: "CLOSED", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "JobPosting", entityId: id, action: "UPDATE", summary: "Closed", ...ctx });
    return { success: true };
  }

  async deleteJobPosting(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.jobPosting.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Job posting not found");
    await this.prisma.jobPosting.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "JobPosting", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-G: Applications ───────────────────────────────────────────────────────

  async listApplications(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.jobApplication.findMany({
      where: { companyId: user.companyId, deletedAt: null, ...(query.status ? { status: query.status } : {}) },
      include: { jobPosting: { select: { title: true, reference: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { data: rows };
  }

  async createApplication(user: AuthenticatedUser, jobPostingId: string, dto: CreateJobApplicationDto, ctx: RequestContext) {
    const posting = await this.prisma.jobPosting.findFirst({ where: { id: jobPostingId, companyId: user.companyId, deletedAt: null } });
    if (!posting) throw new NotFoundException("Job posting not found");
    const ref = nextRef("APP");
    const row = await this.prisma.jobApplication.create({ data: { companyId: user.companyId, jobPostingId, reference: ref, createdById: user.id, ...dto } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "JobApplication", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateApplicationStatus(user: AuthenticatedUser, id: string, dto: UpdateApplicationStatusDto, ctx: RequestContext) {
    const row = await this.prisma.jobApplication.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Application not found");
    const updated = await this.prisma.jobApplication.update({ where: { id }, data: { status: dto.status, notes: dto.notes, interviewDate: dto.interviewDate ? new Date(dto.interviewDate) : undefined, reviewedById: user.id, updatedById: user.id } as never });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "JobApplication", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async hireApplicant(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const app = await this.prisma.jobApplication.findFirst({ where: { id, companyId: user.companyId, deletedAt: null }, include: { jobPosting: true } });
    if (!app) throw new NotFoundException("Application not found");

    const code = nextRef("EMP");
    const nameParts = app.applicantName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || firstName;
    const employee = await this.prisma.employee.create({
      data: {
        companyId: user.companyId,
        code,
        firstName,
        lastName,
        fullName: app.applicantName,
        email: app.applicantEmail ?? undefined,
        phone: app.applicantPhone ?? undefined,
        startDate: new Date(),
        status: "ACTIVE",
        createdById: user.id,
      },
      select: { id: true, code: true, fullName: true, status: true, createdAt: true },
    });

    await this.prisma.jobApplication.update({ where: { id }, data: { status: "HIRED", convertedEmployeeId: employee.id, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "JobApplication", entityId: id, action: "UPDATE", summary: `Hired → Employee ${employee.code}`, ...ctx });
    return { data: { employee, application: app } };
  }

  // ─── HR-G: Onboarding ─────────────────────────────────────────────────────────

  private readonly ONBOARDING_TEMPLATE = [
    "NID collected", "SSNIT registered", "Bank account verified", "Contract signed",
    "Safety briefing", "System access granted", "Uniform issued",
    "Emergency contacts recorded", "Policy handbook acknowledged", "Meet the team",
  ];

  async listOnboarding(user: AuthenticatedUser, employeeId: string) {
    const rows = await this.prisma.onboardingChecklist.findMany({
      where: { companyId: user.companyId, employeeId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { data: rows };
  }

  async createOnboardingItem(user: AuthenticatedUser, employeeId: string, dto: CreateOnboardingItemDto, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true } });
    if (!emp) throw new NotFoundException("Employee not found");
    const row = await this.prisma.onboardingChecklist.create({
      data: { companyId: user.companyId, employeeId, createdById: user.id, ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "OnboardingChecklist", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async applyOnboardingTemplate(user: AuthenticatedUser, employeeId: string, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({ where: { id: employeeId, companyId: user.companyId, deletedAt: null }, select: { id: true } });
    if (!emp) throw new NotFoundException("Employee not found");
    const items = this.ONBOARDING_TEMPLATE.map((title, i) => ({
      id: undefined as any,
      companyId: user.companyId, employeeId, title, sortOrder: i, createdById: user.id,
    }));
    await this.prisma.onboardingChecklist.createMany({ data: items as never });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "OnboardingChecklist", entityId: employeeId, action: "CREATE", summary: "Applied template (10 items)", ...ctx });
    return { data: { created: items.length } };
  }

  async completeOnboardingItem(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.onboardingChecklist.findFirst({ where: { id, companyId: user.companyId } });
    if (!row) throw new NotFoundException("Checklist item not found");
    const updated = await this.prisma.onboardingChecklist.update({ where: { id }, data: { completedAt: new Date(), completedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "OnboardingChecklist", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async deleteOnboardingItem(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.onboardingChecklist.findFirst({ where: { id, companyId: user.companyId } });
    if (!row) throw new NotFoundException("Checklist item not found");
    await this.prisma.onboardingChecklist.delete({ where: { id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "OnboardingChecklist", entityId: id, action: "DELETE", ...ctx });
    return { success: true };
  }

  // ─── HR-H: 360 Peer Reviews ───────────────────────────────────────────────────

  async listPeerReviews(user: AuthenticatedUser, performanceId: string) {
    const rows = await this.prisma.performancePeerReview.findMany({
      where: { companyId: user.companyId, performanceId },
      orderBy: { createdAt: "asc" },
    });
    return { data: rows };
  }

  async createPeerReview(user: AuthenticatedUser, performanceId: string, dto: CreatePeerReviewDto, ctx: RequestContext) {
    const perf = await this.prisma.hRPerformanceRecord.findFirst({ where: { id: performanceId, companyId: user.companyId, deletedAt: null } });
    if (!perf) throw new NotFoundException("Performance record not found");
    const row = await this.prisma.performancePeerReview.create({
      data: { companyId: user.companyId, performanceId, ...dto },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PerformancePeerReview", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async submitPeerReview(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.performancePeerReview.findFirst({ where: { id, companyId: user.companyId } });
    if (!row) throw new NotFoundException("Peer review not found");
    const updated = await this.prisma.performancePeerReview.update({ where: { id }, data: { submittedAt: new Date() } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PerformancePeerReview", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // ─── HR-H: Approval Chains ────────────────────────────────────────────────────

  async listApprovalChains(user: AuthenticatedUser) {
    const rows = await this.prisma.approvalChain.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { entityType: "asc" },
      take: 200,
    });
    return { data: rows };
  }

  async upsertApprovalChain(user: AuthenticatedUser, dto: CreateApprovalChainDto, ctx: RequestContext) {
    const existing = await this.prisma.approvalChain.findFirst({ where: { companyId: user.companyId, entityType: dto.entityType, deletedAt: null } });
    if (existing) {
      const updated = await this.prisma.approvalChain.update({ where: { id: existing.id }, data: { steps: dto.steps as never, minAmount: dto.minAmount, isActive: dto.isActive ?? true } });
      await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ApprovalChain", entityId: existing.id, action: "UPDATE", ...ctx });
      return { data: updated };
    }
    const row = await this.prisma.approvalChain.create({ data: { companyId: user.companyId, createdById: user.id, ...dto, steps: dto.steps as never } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ApprovalChain", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateApprovalChain(user: AuthenticatedUser, id: string, dto: UpdateApprovalChainDto, ctx: RequestContext) {
    const row = await this.prisma.approvalChain.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Approval chain not found");
    const updated = await this.prisma.approvalChain.update({ where: { id }, data: { ...dto, steps: dto.steps as never } as never });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ApprovalChain", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // ─── HR-H: Compliance Reports ─────────────────────────────────────────────────

  async listComplianceReports(user: AuthenticatedUser) {
    const rows = await this.prisma.complianceReport.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { data: rows };
  }

  async generateSsnitReport(user: AuthenticatedUser, dto: ComplianceReportQueryDto, ctx: RequestContext) {
    const payrolls = await this.prisma.payrollRecord.findMany({
      where: { companyId: user.companyId, period: dto.period, status: { in: ["APPROVED", "PAID"] as never[] }, deletedAt: null },
      orderBy: { employeeName: "asc" },
    });
    const rows = payrolls.map((p) => ({
      employeeName: p.employeeName,
      employeeCode: p.employeeCode,
      period: p.period,
      grossPay: Number(p.grossPay),
      employeeSsnit: Number(p.ssnit),
      employerSsnit: Number((p as any).employerSsnit ?? 0),
      totalSsnit: Number(p.ssnit) + Number((p as any).employerSsnit ?? 0),
    }));
    const report = await this.prisma.complianceReport.create({
      data: { companyId: user.companyId, reportType: "SSNIT", period: dto.period, data: rows as never, generatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ComplianceReport", entityId: report.id, action: "CREATE", ...ctx });
    return { data: { report, rows, totalEmployees: rows.length, totalEmployeeSsnit: rows.reduce((s, r) => s + r.employeeSsnit, 0), totalEmployerSsnit: rows.reduce((s, r) => s + r.employerSsnit, 0) } };
  }

  async generatePayeReport(user: AuthenticatedUser, dto: ComplianceReportQueryDto, ctx: RequestContext) {
    const payrolls = await this.prisma.payrollRecord.findMany({
      where: { companyId: user.companyId, period: dto.period, status: { in: ["APPROVED", "PAID"] as never[] }, deletedAt: null },
      orderBy: { employeeName: "asc" },
    });
    const rows = payrolls.map((p) => ({
      employeeName: p.employeeName,
      employeeCode: p.employeeCode,
      period: p.period,
      grossPay: Number(p.grossPay),
      taxableIncome: Number(p.grossPay) - Number(p.ssnit),
      paye: Number(p.taxDeduction),
    }));
    const report = await this.prisma.complianceReport.create({
      data: { companyId: user.companyId, reportType: "PAYE", period: dto.period, data: rows as never, generatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ComplianceReport", entityId: report.id, action: "CREATE", ...ctx });
    return { data: { report, rows, totalPaye: rows.reduce((s, r) => s + r.paye, 0) } };
  }

  async generateHeadcountReport(user: AuthenticatedUser, dto: ComplianceReportQueryDto, ctx: RequestContext) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, status: "ACTIVE" as never, deletedAt: null },
      include: { employeeRole: { select: { name: true } }, branch: { select: { name: true } } },
    });
    const byRole: Record<string, number> = {};
    const byBranch: Record<string, number> = {};
    for (const e of employees) {
      const role = (e as any).employeeRole?.name ?? "No Role";
      const branch = (e as any).branch?.name ?? "No Branch";
      byRole[role] = (byRole[role] ?? 0) + 1;
      byBranch[branch] = (byBranch[branch] ?? 0) + 1;
    }
    const data = { period: dto.period, total: employees.length, byRole, byBranch };
    const report = await this.prisma.complianceReport.create({
      data: { companyId: user.companyId, reportType: "HEADCOUNT", period: dto.period, data: data as never, generatedById: user.id },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "ComplianceReport", entityId: report.id, action: "CREATE", ...ctx });
    return { data: { report, ...data } };
  }
}

