import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
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

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type AssetScope = {
  branchId: string;
  farmId?: string | null;
  warehouseId?: string | null;
  productionSiteId?: string | null;
  machineId?: string | null;
  equipmentId?: string | null;
};

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async dashboard(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    const today = new Date();
    const [machineCount, activeMachines, maintenanceAlerts, openBreakdowns, schedules, breakdowns, downtime, costs, assignments] = await Promise.all([
      this.prisma.machine.count({ where: this.machineWhere(user, query) }),
      this.prisma.machine.count({ where: { ...this.machineWhere(user, query), status: "ACTIVE" } }),
      this.prisma.maintenanceSchedule.count({ where: { ...this.scheduleWhere(user, query), status: { not: "COMPLETED" }, nextDueDate: { lte: today } } }),
      this.prisma.breakdownRecord.count({ where: { ...this.breakdownWhere(user, query), status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] } } }),
      this.prisma.maintenanceSchedule.findMany({ where: this.scheduleWhere(user, query), include: { machine: true, equipment: true }, orderBy: { nextDueDate: "asc" }, take: 12 }),
      this.prisma.breakdownRecord.findMany({ where: this.breakdownWhere(user, query), include: { machine: true, equipment: true }, orderBy: { reportedAt: "desc" }, take: 12 }),
      this.prisma.machineDowntimeRecord.findMany({ where: this.downtimeWhere(user, query), select: { durationHours: true, status: true } }),
      this.prisma.maintenanceCost.findMany({ where: this.costWhere(user, query), select: { amount: true, costType: true } }),
      this.prisma.technicianAssignment.findMany({ where: this.assignmentWhere(user, query), include: { technician: { select: { fullName: true, email: true } }, machine: true, equipment: true }, orderBy: { assignedAt: "desc" }, take: 12 })
    ]);

    return {
      data: {
        machineCount,
        activeMachines,
        maintenanceAlerts,
        openBreakdowns,
        downtimeHours: this.sum(downtime, "durationHours"),
        maintenanceCost: this.sum(costs, "amount"),
        schedules,
        breakdowns,
        assignments
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const [branches, farms, warehouses, productionSites, machines, equipment, spareParts, technicians] = await Promise.all([
      this.prisma.branch.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.branchIds } }) }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.farm.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } }) }, select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.warehouseIds } }) }, select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.productionSite.findMany({ where: { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.productionSiteIds } }) }, select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.machine.findMany({ where: this.machineWhere(user, {}), select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.equipment.findMany({ where: this.equipmentWhere(user, {}), select: { id: true, code: true, name: true, branchId: true, machineId: true }, orderBy: { name: "asc" } }),
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE", OR: [{ sku: { contains: "SPARE" } }, { name: { contains: "belt" } }, { name: { contains: "part" } }] }, select: { id: true, sku: true, name: true, uomId: true }, orderBy: { name: "asc" } }),
      this.prisma.user.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: "asc" } })
    ]);
    return { data: { branches, farms, warehouses, productionSites, machines, equipment, spareParts, technicians } };
  }

  async listMachines(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.machine.findMany({ where: this.machineWhere(user, query), include: { branch: true, farm: true, warehouse: true, productionSite: true }, orderBy: { createdAt: "desc" } }) };
  }

  async createMachine(user: AuthenticatedUser, dto: CreateMachineDto, context: RequestContext) {
    this.assertScopeAccess(user, dto);
    const data = await this.prisma.machine.create({ data: { companyId: user.companyId, branchId: dto.branchId, farmId: dto.farmId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, code: dto.code.toUpperCase(), name: dto.name, machineType: dto.machineType, status: dto.status ?? "ACTIVE", manufacturer: dto.manufacturer, serialNumber: dto.serialNumber, capacity: dto.capacity, location: dto.location, createdById: user.id } });
    await this.writeAudit(user, "CREATE", "Machine", data.id, `Registered machine ${data.code}`, context, data);
    return { data };
  }

  async getMachine(user: AuthenticatedUser, id: string) {
    const data = await this.prisma.machine.findFirst({ where: { ...this.machineWhere(user, {}), id }, include: { equipment: true, schedules: true, maintenanceRecords: true, breakdownRecords: true, downtimeRecords: true, costs: true } });
    if (!data) throw new NotFoundException("Machine was not found.");
    return { data };
  }

  async listEquipment(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.equipment.findMany({ where: this.equipmentWhere(user, query), include: { branch: true, farm: true, warehouse: true, productionSite: true, machine: true }, orderBy: { createdAt: "desc" } }) };
  }

  async createEquipment(user: AuthenticatedUser, dto: CreateEquipmentDto, context: RequestContext) {
    this.assertScopeAccess(user, dto);
    const data = await this.prisma.equipment.create({ data: { companyId: user.companyId, branchId: dto.branchId, farmId: dto.farmId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId, machineId: dto.machineId, code: dto.code.toUpperCase(), name: dto.name, equipmentType: dto.equipmentType, status: dto.status ?? "ACTIVE", serialNumber: dto.serialNumber, location: dto.location, createdById: user.id } });
    await this.writeAudit(user, "CREATE", "Equipment", data.id, `Registered equipment ${data.code}`, context, data);
    return { data };
  }

  async listSchedules(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.maintenanceSchedule.findMany({ where: this.scheduleWhere(user, query), include: { machine: true, equipment: true, assignments: true }, orderBy: { nextDueDate: "asc" } }) };
  }

  async createSchedule(user: AuthenticatedUser, dto: CreateMaintenanceScheduleDto, context: RequestContext) {
    const scope = await this.resolveAssetScope(user, dto.machineId, dto.equipmentId, { branchId: dto.branchId, farmId: dto.farmId, warehouseId: dto.warehouseId, productionSiteId: dto.productionSiteId });
    const scheduleNumber = await this.nextDocumentNumber(user.companyId, "MS", this.prisma.maintenanceSchedule);
    const data = await this.prisma.maintenanceSchedule.create({ data: { companyId: user.companyId, ...scope, scheduleNumber, title: dto.title, maintenanceType: dto.maintenanceType, priority: dto.priority ?? "MEDIUM", frequencyDays: dto.frequencyDays, nextDueDate: new Date(dto.nextDueDate), instructions: dto.instructions, createdById: user.id } });
    await this.writeAudit(user, "CREATE", "MaintenanceSchedule", data.id, `Created maintenance schedule ${scheduleNumber}`, context, data);
    return { data };
  }

  async listRecords(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.maintenanceRecord.findMany({ where: this.recordWhere(user, query), include: { machine: true, equipment: true, schedule: true, sparePartUsages: true, costs: true }, orderBy: { maintenanceDate: "desc" } }) };
  }

  async createRecord(user: AuthenticatedUser, dto: CreateMaintenanceRecordDto, context: RequestContext) {
    const scope = await this.resolveAssetScope(user, dto.machineId, dto.equipmentId);
    const recordNumber = await this.nextDocumentNumber(user.companyId, "MR", this.prisma.maintenanceRecord);
    const data = await this.prisma.maintenanceRecord.create({ data: { companyId: user.companyId, ...scope, scheduleId: dto.scheduleId, recordNumber, maintenanceDate: dto.maintenanceDate ? new Date(dto.maintenanceDate) : new Date(), maintenanceType: dto.maintenanceType, status: "COMPLETED", completedById: user.id, description: dto.description, findings: dto.findings, nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined, createdById: user.id } });
    if (dto.scheduleId && dto.nextDueDate) await this.prisma.maintenanceSchedule.update({ where: { id: dto.scheduleId }, data: { lastCompletedAt: data.maintenanceDate, nextDueDate: new Date(dto.nextDueDate), status: "SCHEDULED", updatedById: user.id } });
    await this.writeAudit(user, "CREATE", "MaintenanceRecord", data.id, `Recorded maintenance ${recordNumber}`, context, data);
    return { data };
  }

  async listBreakdowns(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.breakdownRecord.findMany({ where: this.breakdownWhere(user, query), include: { machine: true, equipment: true, assignments: true, downtimeRecords: true, costs: true }, orderBy: { reportedAt: "desc" } }) };
  }

  async createBreakdown(user: AuthenticatedUser, dto: CreateBreakdownDto, context: RequestContext) {
    const scope = await this.resolveAssetScope(user, dto.machineId, dto.equipmentId);
    const breakdownNumber = await this.nextDocumentNumber(user.companyId, "BD", this.prisma.breakdownRecord);
    const data = await this.prisma.breakdownRecord.create({ data: { companyId: user.companyId, ...scope, breakdownNumber, reportedAt: dto.reportedAt ? new Date(dto.reportedAt) : new Date(), severity: dto.severity ?? "MEDIUM", description: dto.description, rootCause: dto.rootCause, reportedById: user.id, createdById: user.id } });
    if (scope.machineId) await this.prisma.machine.update({ where: { id: scope.machineId }, data: { status: "BROKEN_DOWN", updatedById: user.id } });
    if (scope.equipmentId) await this.prisma.equipment.update({ where: { id: scope.equipmentId }, data: { status: "BROKEN_DOWN", updatedById: user.id } });
    await this.writeAudit(user, "CREATE", "BreakdownRecord", data.id, `Reported breakdown ${breakdownNumber}`, context, data);
    return { data };
  }

  async updateBreakdown(user: AuthenticatedUser, id: string, dto: UpdateBreakdownStatusDto, context: RequestContext) {
    const existing = await this.prisma.breakdownRecord.findFirst({ where: { ...this.breakdownWhere(user, {}), id } });
    if (!existing) throw new NotFoundException("Breakdown record was not found.");
    const data = await this.prisma.breakdownRecord.update({ where: { id }, data: { status: dto.status, resolution: dto.resolution, resolvedById: ["RESOLVED", "CLOSED"].includes(dto.status) ? user.id : existing.resolvedById, resolvedAt: ["RESOLVED", "CLOSED"].includes(dto.status) ? new Date() : existing.resolvedAt, updatedById: user.id } });
    await this.writeAudit(user, dto.status === "CANCELLED" ? "REJECT" : "UPDATE", "BreakdownRecord", id, `Updated breakdown to ${dto.status}`, context, data);
    return { data };
  }

  async createSparePartUsage(user: AuthenticatedUser, dto: CreateSparePartUsageDto, context: RequestContext) {
    this.assertWarehouseAccess(user, dto.warehouseId);
    const [item, product, warehouse] = await Promise.all([
      this.prisma.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: dto.warehouseId, productId: dto.productId, deletedAt: null } }),
      this.prisma.product.findFirst({ where: { companyId: user.companyId, id: dto.productId, deletedAt: null } }),
      this.prisma.warehouse.findFirst({ where: { companyId: user.companyId, id: dto.warehouseId, deletedAt: null } })
    ]);
    if (!item || Number(item.quantityOnHand) < dto.quantity) throw new BadRequestException("Insufficient spare part stock.");
    if (!product || !warehouse) throw new NotFoundException("Spare part or warehouse was not found.");
    const totalCost = dto.quantity * (dto.unitCost ?? 0);
    const data = await this.prisma.$transaction(async (tx) => {
      const usage = await tx.sparePartUsage.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, machineId: dto.machineId, equipmentId: dto.equipmentId, maintenanceRecordId: dto.maintenanceRecordId, breakdownRecordId: dto.breakdownRecordId, productId: product.id, quantity: dto.quantity, unitCost: dto.unitCost ?? 0, totalCost, issuedById: user.id, notes: dto.notes, createdById: user.id } });
      await this.consumeSparePartTx(tx, user, item, dto.quantity, usage.id, dto.unitCost ?? 0);
      if (totalCost > 0) {
        await tx.maintenanceCost.create({ data: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId: warehouse.id, productionSiteId: warehouse.productionSiteId, machineId: dto.machineId, equipmentId: dto.equipmentId, maintenanceRecordId: dto.maintenanceRecordId, breakdownRecordId: dto.breakdownRecordId, costType: "SPARE_PART", amount: totalCost, description: `Spare part ${product.sku}`, approvedById: user.id, approvedAt: new Date(), createdById: user.id } });
      }
      return usage;
    });
    await this.writeAudit(user, "CREATE", "SparePartUsage", data.id, `Issued spare part ${product.sku}`, context, { branchId: warehouse.branchId, warehouseId: warehouse.id });
    return { data };
  }

  async listSpareParts(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.sparePartUsage.findMany({ where: this.spareWhere(user, query), include: { product: true, warehouse: true, machine: true, equipment: true }, orderBy: { usedAt: "desc" } }) };
  }

  async createAssignment(user: AuthenticatedUser, dto: CreateTechnicianAssignmentDto, context: RequestContext) {
    const scope = await this.resolveAssetScope(user, dto.machineId, dto.equipmentId);
    const data = await this.prisma.technicianAssignment.create({ data: { companyId: user.companyId, branchId: scope.branchId, machineId: scope.machineId, equipmentId: scope.equipmentId, scheduleId: dto.scheduleId, maintenanceRecordId: dto.maintenanceRecordId, breakdownRecordId: dto.breakdownRecordId, technicianId: dto.technicianId, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined, status: dto.status ?? "ASSIGNED", notes: dto.notes, createdById: user.id } });
    await this.writeAudit(user, "CREATE", "TechnicianAssignment", data.id, "Assigned technician", context, scope);
    return { data };
  }

  async listAssignments(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.technicianAssignment.findMany({ where: this.assignmentWhere(user, query), include: { technician: { select: { fullName: true, email: true } }, machine: true, equipment: true }, orderBy: { assignedAt: "desc" } }) };
  }

  async createDowntime(user: AuthenticatedUser, dto: CreateDowntimeDto, context: RequestContext) {
    const scope = await this.resolveAssetScope(user, dto.machineId, dto.equipmentId);
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : undefined;
    const durationHours = endAt ? Number(((endAt.getTime() - startAt.getTime()) / 3600000).toFixed(2)) : 0;
    if (durationHours < 0) throw new BadRequestException("Downtime end time cannot be before start time.");
    const data = await this.prisma.machineDowntimeRecord.create({ data: { companyId: user.companyId, ...scope, breakdownRecordId: dto.breakdownRecordId, startAt, endAt, durationHours, reason: dto.reason, status: dto.status ?? (endAt ? "CLOSED" : "OPEN"), createdById: user.id } });
    await this.writeAudit(user, "CREATE", "MachineDowntimeRecord", data.id, "Recorded machine downtime", context, data);
    return { data };
  }

  async listDowntime(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.machineDowntimeRecord.findMany({ where: this.downtimeWhere(user, query), include: { machine: true, equipment: true, breakdownRecord: true }, orderBy: { startAt: "desc" } }) };
  }

  async createCost(user: AuthenticatedUser, dto: CreateMaintenanceCostDto, context: RequestContext) {
    const scope = await this.resolveAssetScope(user, dto.machineId, dto.equipmentId);
    const data = await this.prisma.maintenanceCost.create({ data: { companyId: user.companyId, ...scope, maintenanceRecordId: dto.maintenanceRecordId, breakdownRecordId: dto.breakdownRecordId, costDate: dto.costDate ? new Date(dto.costDate) : new Date(), costType: dto.costType, amount: dto.amount, description: dto.description, status: dto.status ?? "COMPLETED", approvedById: user.id, approvedAt: new Date(), createdById: user.id } });
    await this.writeAudit(user, "CREATE", "MaintenanceCost", data.id, "Recorded maintenance cost", context, data);
    return { data };
  }

  async listCosts(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { data: await this.prisma.maintenanceCost.findMany({ where: this.costWhere(user, query), include: { machine: true, equipment: true, maintenanceRecord: true, breakdownRecord: true }, orderBy: { costDate: "desc" } }) };
  }

  async reportCsv(user: AuthenticatedUser, query: MaintenanceQueryDto, context: RequestContext) {
    const rows = await this.prisma.maintenanceCost.findMany({ where: this.costWhere(user, query), include: { machine: true, equipment: true }, orderBy: { costDate: "desc" } });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "Report", entityId: "maintenance.cost", summary: "Exported maintenance cost report", ipAddress: context.ipAddress, userAgent: context.userAgent });
    return [["date", "asset", "cost_type", "amount", "description"], ...rows.map((row) => [row.costDate.toISOString().slice(0, 10), row.machine?.name ?? row.equipment?.name ?? "Unassigned", row.costType, String(row.amount), row.description ?? ""])].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  private async resolveAssetScope(user: AuthenticatedUser, machineId?: string, equipmentId?: string, fallback?: Partial<AssetScope>): Promise<AssetScope> {
    if (!machineId && !equipmentId && fallback?.branchId) {
      this.assertScopeAccess(user, fallback);
      return { branchId: fallback.branchId, farmId: fallback.farmId, warehouseId: fallback.warehouseId, productionSiteId: fallback.productionSiteId, machineId: null, equipmentId: null };
    }
    if (machineId) {
      const machine = await this.prisma.machine.findFirst({ where: { companyId: user.companyId, id: machineId, deletedAt: null } });
      if (!machine) throw new NotFoundException("Machine was not found.");
      this.assertScopeAccess(user, machine);
      return { branchId: machine.branchId, farmId: machine.farmId, warehouseId: machine.warehouseId, productionSiteId: machine.productionSiteId, machineId: machine.id, equipmentId: null };
    }
    if (equipmentId) {
      const equipment = await this.prisma.equipment.findFirst({ where: { companyId: user.companyId, id: equipmentId, deletedAt: null } });
      if (!equipment) throw new NotFoundException("Equipment was not found.");
      this.assertScopeAccess(user, equipment);
      return { branchId: equipment.branchId, farmId: equipment.farmId, warehouseId: equipment.warehouseId, productionSiteId: equipment.productionSiteId, machineId: equipment.machineId, equipmentId: equipment.id };
    }
    throw new BadRequestException("A machine, equipment, or fallback branch scope is required.");
  }

  private async consumeSparePartTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, item: { id: string; branchId: string; warehouseId: string; productionSiteId: string | null; productId: string; uomId: string }, quantity: number, usageId: string, unitCost: number) {
    const batch = await tx.stockBatch.findFirst({ where: { companyId: user.companyId, inventoryItemId: item.id, quantityRemaining: { gte: quantity }, deletedAt: null }, orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }] });
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: { decrement: quantity }, updatedById: user.id } });
    if (batch) await tx.stockBatch.update({ where: { id: batch.id }, data: { quantityRemaining: { decrement: quantity } } });
    await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: item.branchId, productId: item.productId, inventoryItemId: item.id, stockBatchId: batch?.id, fromWarehouseId: item.warehouseId, warehouseId: item.warehouseId, productionSiteId: item.productionSiteId, uomId: item.uomId, movementType: "ADJUSTMENT_OUT", quantity, unitCost, referenceType: "SparePartUsage", referenceId: usageId, notes: "Spare part issued for maintenance", createdById: user.id } });
  }

  private machineWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, farmId: query.farmId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, id: query.machineId, ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: { in: user.branchIds } }, { farmId: { in: user.farmIds } }, { warehouseId: { in: user.warehouseIds } }, { productionSiteId: { in: user.productionSiteIds } }] }) };
  }

  private equipmentWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, farmId: query.farmId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, machineId: query.machineId, id: query.equipmentId, ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: { in: user.branchIds } }, { farmId: { in: user.farmIds } }, { warehouseId: { in: user.warehouseIds } }, { productionSiteId: { in: user.productionSiteIds } }] }) };
  }

  private scheduleWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, farmId: query.farmId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, machineId: query.machineId, equipmentId: query.equipmentId, ...(this.dateRange(query, "nextDueDate")), ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: { in: user.branchIds } }, { farmId: { in: user.farmIds } }, { warehouseId: { in: user.warehouseIds } }, { productionSiteId: { in: user.productionSiteIds } }] }) };
  }

  private recordWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, farmId: query.farmId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, machineId: query.machineId, equipmentId: query.equipmentId, ...(this.dateRange(query, "maintenanceDate")), ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: { in: user.branchIds } }, { farmId: { in: user.farmIds } }, { warehouseId: { in: user.warehouseIds } }, { productionSiteId: { in: user.productionSiteIds } }] }) };
  }

  private breakdownWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, farmId: query.farmId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, machineId: query.machineId, equipmentId: query.equipmentId, ...(this.dateRange(query, "reportedAt")), ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: { in: user.branchIds } }, { farmId: { in: user.farmIds } }, { warehouseId: { in: user.warehouseIds } }, { productionSiteId: { in: user.productionSiteIds } }] }) };
  }

  private spareWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, warehouseId: query.warehouseId, machineId: query.machineId, equipmentId: query.equipmentId, ...(this.dateRange(query, "usedAt")), ...(user.hasGlobalAccess ? {} : { warehouseId: { in: user.warehouseIds } }) };
  }

  private assignmentWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, machineId: query.machineId, equipmentId: query.equipmentId, ...(user.hasGlobalAccess ? {} : { branchId: { in: user.branchIds } }) };
  }

  private downtimeWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, farmId: query.farmId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, machineId: query.machineId, equipmentId: query.equipmentId, ...(this.dateRange(query, "startAt")), ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: { in: user.branchIds } }, { farmId: { in: user.farmIds } }, { warehouseId: { in: user.warehouseIds } }, { productionSiteId: { in: user.productionSiteIds } }] }) };
  }

  private costWhere(user: AuthenticatedUser, query: MaintenanceQueryDto) {
    return { companyId: user.companyId, deletedAt: null, branchId: query.branchId, farmId: query.farmId, warehouseId: query.warehouseId, productionSiteId: query.productionSiteId, machineId: query.machineId, equipmentId: query.equipmentId, ...(this.dateRange(query, "costDate")), ...(user.hasGlobalAccess ? {} : { OR: [{ branchId: { in: user.branchIds } }, { farmId: { in: user.farmIds } }, { warehouseId: { in: user.warehouseIds } }, { productionSiteId: { in: user.productionSiteIds } }] }) };
  }

  private dateRange(query: MaintenanceQueryDto, field: string) {
    return query.startDate || query.endDate ? { [field]: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } } : {};
  }

  private assertScopeAccess(user: AuthenticatedUser, scope: { branchId?: string | null; farmId?: string | null; warehouseId?: string | null; productionSiteId?: string | null }) {
    if (user.hasGlobalAccess) return;
    if (scope.branchId && !user.branchIds.includes(scope.branchId)) throw new ForbiddenException("You do not have access to this branch.");
    if (scope.farmId && !user.farmIds.includes(scope.farmId)) throw new ForbiddenException("You do not have access to this farm.");
    if (scope.warehouseId && !user.warehouseIds.includes(scope.warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
    if (scope.productionSiteId && !user.productionSiteIds.includes(scope.productionSiteId)) throw new ForbiddenException("You do not have access to this production site.");
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && !user.warehouseIds.includes(warehouseId)) throw new ForbiddenException("You do not have access to this warehouse.");
  }

  private async nextDocumentNumber(companyId: string, prefix: string, model: { count: (args: { where: { companyId: string } }) => Promise<number> }) {
    const count = await model.count({ where: { companyId } });
    return `${prefix}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  }

  private sum<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
    return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "REJECT", entityType: string, entityId: string, summary: string, context: RequestContext, scope: { branchId?: string | null; farmId?: string | null; warehouseId?: string | null; productionSiteId?: string | null }) {
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action, entityType, entityId, summary, branchId: scope.branchId ?? undefined, farmId: scope.farmId ?? undefined, warehouseId: scope.warehouseId ?? undefined, productionSiteId: scope.productionSiteId ?? undefined, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
