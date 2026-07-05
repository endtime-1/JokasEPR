import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
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

type RequestContext = { ipAddress?: string; userAgent?: string };

function nextRef(prefix: string, count: number) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

function num(v: unknown) {
  return Number(v ?? 0);
}

@Injectable()
export class HRService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async dashboard(user: AuthenticatedUser) {
    const cid = user.companyId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalEmployees,
      activeEmployees,
      onLeave,
      todayPresent,
      todayAbsent,
      todayTotalAttendance,
      openTasks,
      urgentTasks,
      pendingPayroll,
      openLeaveRequests,
      recentLeaveRequests,
      recentEmployees,
      recentTasks,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { companyId: cid, deletedAt: null } }),
      this.prisma.employee.count({ where: { companyId: cid, deletedAt: null, status: "ACTIVE" } }),
      this.prisma.employee.count({ where: { companyId: cid, deletedAt: null, status: "ON_LEAVE" } }),
      this.prisma.attendanceRecord.count({ where: { companyId: cid, date: { gte: today }, status: "PRESENT" } }),
      this.prisma.attendanceRecord.count({ where: { companyId: cid, date: { gte: today }, status: "ABSENT" } }),
      this.prisma.attendanceRecord.count({ where: { companyId: cid, date: { gte: today } } }),
      this.prisma.task.count({ where: { companyId: cid, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      this.prisma.task.count({ where: { companyId: cid, deletedAt: null, status: "OPEN", priority: "URGENT" } }),
      this.prisma.payrollRecord.count({ where: { companyId: cid, deletedAt: null, status: "DRAFT" } }),
      this.prisma.leaveRequest.count({ where: { companyId: cid, deletedAt: null, status: "PENDING" } }),
      this.prisma.leaveRequest.findMany({ where: { companyId: cid, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
      this.prisma.employee.findMany({ where: { companyId: cid, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 8, include: { employeeRole: { select: { name: true } }, branch: { select: { name: true } } } }),
      this.prisma.task.findMany({ where: { companyId: cid, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 8, include: { assignments: { include: { employee: { select: { fullName: true } } } } } }),
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
  }

  // â”€â”€â”€ Options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ Employee Roles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listEmployeeRoles(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.employeeRole.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.search ? { OR: [{ name: { contains: query.search } }, { code: { contains: query.search } }] } : {}),
      },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: "asc" },
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

  // â”€â”€â”€ Employees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listEmployees(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.employee.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.search ? { OR: [{ fullName: { contains: query.search } }, { code: { contains: query.search } }, { phone: { contains: query.search } }] } : {}),
      },
      include: {
        employeeRole: { select: { name: true, code: true } },
        branch: { select: { name: true } },
        farm: { select: { name: true } },
      },
      orderBy: { fullName: "asc" },
    });
    return { data: rows };
  }

  async getMyEmployee(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
      include: {
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
    });
    if (!emp) throw new NotFoundException("No employee record linked to your account");
    await this.prisma.employee.update({ where: { id: emp.id }, data: { phone: dto.phone, updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: emp.id, action: "UPDATE", ...ctx });
    return this.getMyEmployee(user);
  }

  async getEmployee(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.employee.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: {
        employeeRole: true,
        branch: { select: { name: true } },
        farm: { select: { name: true } },
        warehouse: { select: { name: true } },
        productionSite: { select: { name: true } },
        attendanceRecords: { orderBy: { date: "desc" }, take: 30 },
        taskAssignments: { where: { status: { notIn: ["COMPLETED", "REJECTED"] } }, include: { task: { select: { title: true, priority: true, dueDate: true } } } },
        payrollRecords: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 6 },
        trainingRecords: { where: { deletedAt: null }, orderBy: { trainingDate: "desc" }, take: 10 },
        performanceRecords: { where: { deletedAt: null }, orderBy: { period: "desc" }, take: 6 },
        departmentAssignments: { orderBy: { startDate: "desc" } },
      },
    });
    if (!row) throw new NotFoundException("Employee not found");
    return { data: row };
  }

  async createEmployee(user: AuthenticatedUser, dto: CreateEmployeeDto, ctx: RequestContext) {
    const exists = await this.prisma.employee.findUnique({ where: { companyId_code: { companyId: user.companyId, code: dto.code } } });
    if (exists) throw new BadRequestException(`Employee code "${dto.code}" already exists`);

    const fullName = `${dto.firstName} ${dto.lastName}`;
    const row = await this.prisma.employee.create({
      data: {
        companyId: user.companyId,
        createdById: user.id,
        ...dto,
        fullName,
        startDate: new Date(dto.startDate),
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        basicSalary: dto.basicSalary,
      },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async updateEmployee(user: AuthenticatedUser, id: string, dto: UpdateEmployeeDto, ctx: RequestContext) {
    const row = await this.prisma.employee.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Employee not found");

    const fullName = dto.firstName || dto.lastName
      ? `${dto.firstName ?? row.firstName} ${dto.lastName ?? row.lastName}`
      : undefined;

    const updated = await this.prisma.employee.update({
      where: { id },
      data: { updatedById: user.id, ...dto, ...(fullName ? { fullName } : {}), dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "Employee", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â”€â”€â”€ Attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      include: { employee: { select: { fullName: true, code: true } }, shift: { select: { name: true, startTime: true, endTime: true } } },
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
    });

    const data = {
      companyId: user.companyId,
      employeeId: employee.id,
      date,
      checkInTime: dto.checkInTime ? new Date(dto.checkInTime) : new Date(),
      status: dto.status ?? "PRESENT",
      notes: dto.notes,
      recordedById: user.id,
    };

    const row = existing
      ? await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data: data as never })
      : await this.prisma.attendanceRecord.create({ data: data as never });

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "AttendanceRecord", entityId: row.id, action: existing ? "UPDATE" : "CREATE", ...ctx });
    return { data: row };
  }

  async recordAttendance(user: AuthenticatedUser, dto: RecordAttendanceDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null } });
    if (!employee) throw new NotFoundException("Employee not found");

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { companyId_employeeId_date: { companyId: user.companyId, employeeId: dto.employeeId, date } },
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
      notes: dto.notes,
      recordedById: user.id,
    };

    const row = existing
      ? await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data: data as never })
      : await this.prisma.attendanceRecord.create({ data: data as never });

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
      });
      results.push(row);
    }

    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "AttendanceRecord", entityId: "bulk", action: "CREATE", ...ctx });
    return { data: results };
  }

  // â”€â”€â”€ Shifts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listShifts(user: AuthenticatedUser) {
    const rows = await this.prisma.shift.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
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

  // â”€â”€â”€ Tasks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.search ? { OR: [{ title: { contains: query.search } }, { taskType: { contains: query.search } }] } : {}),
      },
      include: {
        branch: { select: { name: true } },
        farm: { select: { name: true } },
        assignments: { include: { employee: { select: { fullName: true, code: true } } } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
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
      include: { assignments: true },
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

  // â”€â”€â”€ Payroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getMyPayslips(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
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
    });
    return { data: rows };
  }

  async createPayrollRecord(user: AuthenticatedUser, dto: CreatePayrollRecordDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null } });
    if (!employee) throw new NotFoundException("Employee not found");

    const allowances = dto.allowances ?? 0;
    const deductions = dto.deductions ?? 0;
    const taxDeduction = dto.taxDeduction ?? 0;
    const ssnit = dto.ssnit ?? 0;
    const grossPay = num(dto.basicSalary) + allowances - deductions;
    const netPay = grossPay - taxDeduction - ssnit;

    const count = await this.prisma.payrollRecord.count({ where: { companyId: user.companyId } });
    const reference = nextRef("PAY", count);

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

    const updated = await this.prisma.payrollRecord.update({ where: { id }, data: { status: "APPROVED", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: id, action: "APPROVE", ...ctx });
    return { data: updated };
  }

  async markPayrollPaid(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const row = await this.prisma.payrollRecord.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Payroll record not found");
    if (row.status !== "APPROVED") throw new BadRequestException("Only APPROVED records can be marked as paid");

    const updated = await this.prisma.payrollRecord.update({ where: { id }, data: { status: "PAID", paymentDate: row.paymentDate ?? new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "PayrollRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â”€â”€â”€ Training â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listTraining(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.trainingRecord.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.status ? { outcome: query.status as never } : {}),
        ...(query.search ? { title: { contains: query.search } } : {}),
      },
      include: { employee: { select: { fullName: true, code: true } } },
      orderBy: { trainingDate: "desc" },
    });
    return { data: rows };
  }

  async createTrainingRecord(user: AuthenticatedUser, dto: CreateTrainingRecordDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null } });
    if (!employee) throw new NotFoundException("Employee not found");

    const row = await this.prisma.trainingRecord.create({
      data: { companyId: user.companyId, createdById: user.id, ...dto, trainingDate: new Date(dto.trainingDate) },
    });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "TrainingRecord", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  // â”€â”€â”€ Performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    });
    return { data: rows };
  }

  async createPerformanceRecord(user: AuthenticatedUser, dto: CreatePerformanceRecordDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null } });
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

    const updated = await this.prisma.hRPerformanceRecord.update({ where: { id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "HRPerformanceRecord", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  // â”€â”€â”€ Department Assignments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listDepartmentAssignments(user: AuthenticatedUser, query: HRQueryDto) {
    const rows = await this.prisma.departmentAssignment.findMany({
      where: {
        companyId: user.companyId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      include: { employee: { select: { fullName: true, code: true } }, branch: { select: { name: true } }, farm: { select: { name: true } } },
      orderBy: { startDate: "desc" },
    });
    return { data: rows };
  }

  async createDepartmentAssignment(user: AuthenticatedUser, dto: CreateDepartmentAssignmentDto, ctx: RequestContext) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId, companyId: user.companyId, deletedAt: null } });
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

  // â”€â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        where: { companyId: cid },
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
    });

    const count = await this.prisma.leaveRequest.count({ where: { companyId: user.companyId } });
    const reference = nextRef("LVR", count);

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
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeaveRequest", entityId: row.id, action: "CREATE", ...ctx });
    return { data: row };
  }

  async myLeaveRequests(user: AuthenticatedUser) {
    const emp = await this.prisma.employee.findFirst({
      where: { companyId: user.companyId, email: user.email, deletedAt: null },
    });

    const where = emp
      ? { companyId: user.companyId, employeeId: emp.id, deletedAt: null }
      : { companyId: user.companyId, employeeName: user.fullName, deletedAt: null };

    const rows = await this.prisma.leaveRequest.findMany({
      where,
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
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeaveRequest", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }

  async cancelLeaveRequest(user: AuthenticatedUser, id: string, ctx: RequestContext) {
    const emp = await this.prisma.employee.findFirst({ where: { companyId: user.companyId, email: user.email, deletedAt: null } });
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, companyId: user.companyId, deletedAt: null } });
    if (!row) throw new NotFoundException("Leave request not found");
    if (emp && row.employeeId !== emp.id) throw new ForbiddenException("Cannot cancel another employee's leave request");
    if (row.status !== "PENDING") throw new BadRequestException("Only PENDING requests can be cancelled");

    const updated = await this.prisma.leaveRequest.update({ where: { id }, data: { status: "CANCELLED", updatedById: user.id } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, entityType: "LeaveRequest", entityId: id, action: "UPDATE", ...ctx });
    return { data: updated };
  }
}

