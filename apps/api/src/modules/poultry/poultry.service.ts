import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import {
  AddPenDto,
  CreateBirdWeightRecordDto,
  CreateDailyPoultryRecordDto,
  CreateEggProductionRecordDto,
  CreateFeedConsumptionRecordDto,
  CreateFlockBatchDto,
  CreateHealthObservationDto,
  CreateMedicationRecordDto,
  CreateMortalityRecordDto,
  CreatePoultryCostRecordDto,
  CreatePoultryHouseDto,
  CreatePoultryTransferDto,
  CreateVaccinationRecordDto,
  PoultryQueryDto,
  UpdateBatchStatusDto,
  UpdateFlockBatchDto,
  UpdatePenDto,
  UpdatePoultryHouseDto,
  AllocateTransferPenDto,
  UpdatePoultryTransferStatusDto
} from "./dto/poultry.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type BatchContext = {
  id: string;
  code: string;
  companyId: string;
  branchId: string;
  farmId: string;
  poultryHouseId: string | null;
  openingBirdCount: number;
  birdType: string;
};

@Injectable()
export class PoultryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const since7 = new Date(Date.now() - 7 * 86400000);

    const [batches, weekEggs, weekMortality, weekFeed, recentHealth, houses, prices] = await Promise.all([
      this.prisma.flockBatch.findMany({
        where: this.batchWhere(user),
        include: {
          farm: { select: { name: true, code: true } },
          poultryHouse: { select: { name: true, code: true } },
          mortalityRecords: { where: { deletedAt: null }, select: { birdCount: true, isCulling: true } },
          feedConsumptionRecords: { where: { deletedAt: null }, select: { quantityKg: true } },
          eggProductionRecords: { where: { deletedAt: null }, select: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true } },
          birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" }, take: 1 },
          costRecords: { where: { deletedAt: null }, select: { amount: true } },
          dailyRecords: { where: { deletedAt: null, recordDate: { gte: todayStart } }, select: { id: true } },
          penAllocations: { select: { birdCount: true, pen: { select: { code: true, name: true } } } }
        },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.eggProductionRecord.groupBy({
        by: ["recordDate"],
        where: { companyId: user.companyId, recordDate: { gte: since7 }, deletedAt: null },
        _sum: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true },
        orderBy: { recordDate: "asc" }
      }),
      this.prisma.mortalityRecord.groupBy({
        by: ["recordDate"],
        where: { companyId: user.companyId, recordDate: { gte: since7 }, deletedAt: null, isCulling: false },
        _sum: { birdCount: true },
        orderBy: { recordDate: "asc" }
      }),
      this.prisma.feedConsumptionRecord.groupBy({
        by: ["recordDate"],
        where: { companyId: user.companyId, recordDate: { gte: since7 }, deletedAt: null },
        _sum: { quantityKg: true },
        orderBy: { recordDate: "asc" }
      }),
      this.prisma.poultryHealthObservation.findMany({
        where: { companyId: user.companyId, deletedAt: null, observationDate: { gte: since7 }, severity: { in: ["HIGH", "CRITICAL"] } },
        select: { id: true, severity: true, observation: true, observationDate: true, flockBatch: { select: { code: true, name: true } } },
        orderBy: { observationDate: "desc" },
        take: 5
      }),
      this.prisma.poultryHouse.findMany({
        where: this.houseWhere(user),
        select: {
          id: true, code: true, name: true,
          pens: {
            where: { deletedAt: null, isActive: true },
            select: {
              id: true, code: true, penNumber: true,
              batchAllocations: {
                where: { flockBatch: { status: "ACTIVE", deletedAt: null } },
                select: { birdCount: true, flockBatch: { select: { code: true } } }
              }
            },
            orderBy: { penNumber: "asc" }
          }
        },
        orderBy: { code: "asc" }
      }),
      this.poultryPrices(user.companyId)
    ]);

    const rows = batches.map((batch) => ({
      ...this.batchMetrics(batch, prices),
      hasTodayRecord: (batch.dailyRecords ?? []).length > 0,
      penCount: (batch.penAllocations ?? []).length,
      penCodes: (batch.penAllocations ?? []).map((a: any) => a.pen.code).join(", ")
    }));
    const activeRows = rows.filter((r) => r.status === "ACTIVE");

    return {
      data: {
        summary: {
          totalOpeningBirds: rows.reduce((s, r) => s + r.openingBirdCount, 0),
          currentLiveBirds: rows.reduce((s, r) => s + r.currentLiveBirds, 0),
          activeBatches: activeRows.length,
          totalBatches: rows.length,
          totalEggs: rows.reduce((s, r) => s + r.totalEggs, 0),
          totalFeedKg: Number(rows.reduce((s, r) => s + r.totalFeedKg, 0).toFixed(2)),
          totalCosts: Number(rows.reduce((s, r) => s + r.totalCosts, 0).toFixed(2)),
          totalProfitability: Number(rows.reduce((s, r) => s + r.profitability, 0).toFixed(2))
        },
        batches: rows,
        alerts: {
          noTodayRecord: activeRows.filter((r) => !r.hasTodayRecord).map((r) => ({ id: r.id, code: r.code, name: r.name })),
          highMortality: activeRows.filter((r) => r.mortalityRate > 5).map((r) => ({ id: r.id, code: r.code, name: r.name, mortalityRate: r.mortalityRate })),
          criticalHealth: recentHealth
        },
        trends: {
          eggs: weekEggs.map((r) => ({ date: r.recordDate, total: (r._sum.goodEggs ?? 0) + (r._sum.crackedEggs ?? 0) + (r._sum.dirtyEggs ?? 0) + (r._sum.brokenEggs ?? 0) + (r._sum.rejectedEggs ?? 0), good: r._sum.goodEggs ?? 0 })),
          mortality: weekMortality.map((r) => ({ date: r.recordDate, count: r._sum.birdCount ?? 0 })),
          feed: weekFeed.map((r) => ({ date: r.recordDate, kg: Number(r._sum.quantityKg ?? 0) }))
        },
        houses: houses.map((h) => ({
          id: h.id, code: h.code, name: h.name,
          totalPens: h.pens.length,
          occupiedPens: h.pens.filter((p) => p.batchAllocations.length > 0).length,
          pens: h.pens.map((p) => ({
            id: p.id, code: p.code, penNumber: p.penNumber,
            isOccupied: p.batchAllocations.length > 0,
            activeBatch: p.batchAllocations[0] ? { code: p.batchAllocations[0].flockBatch.code, birdCount: p.batchAllocations[0].birdCount } : null
          }))
        }))
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const cacheKey = `poultry:opts:${user.companyId}:${user.hasGlobalAccess ? "g" : user.id}`;
    const cached = this.lookupCache.get<object>(cacheKey);
    if (cached) return cached;
    const [farms, houses, pens, batches, warehouses, products] = await Promise.all([
      this.prisma.farm.findMany({ where: this.farmWhere(user), select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.poultryHouse.findMany({ where: this.houseWhere(user), select: { id: true, code: true, name: true, farmId: true }, orderBy: { name: "asc" } }),
      this.prisma.pen.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true }, select: { id: true, code: true, name: true, penNumber: true, poultryHouseId: true, farmId: true, capacity: true }, orderBy: [{ poultryHouseId: "asc" }, { penNumber: "asc" }] }),
      this.prisma.flockBatch.findMany({ where: this.batchWhere(user), select: { id: true, code: true, name: true, farmId: true, birdType: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.warehouse.findMany({ where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, sku: true, name: true }, orderBy: { name: "asc" } })
    ]);
    const result = { data: { farms, houses, pens, batches, warehouses, products } };
    this.lookupCache.set(cacheKey, result);
    return result;
  }

  async farmOverview(user: AuthenticatedUser, farmId: string) {
    this.assertFarmAccess(user, farmId);
    const [houses, batches] = await Promise.all([
      this.prisma.poultryHouse.findMany({ where: { companyId: user.companyId, farmId, deletedAt: null }, orderBy: { code: "asc" } }),
      this.prisma.flockBatch.findMany({ where: { companyId: user.companyId, farmId, deletedAt: null }, include: { mortalityRecords: { where: { deletedAt: null } }, eggProductionRecords: { where: { deletedAt: null } }, feedConsumptionRecords: { where: { deletedAt: null } }, costRecords: { where: { deletedAt: null } } } })
    ]);

    return {
      data: {
        houses,
        batchCount: batches.length,
        currentLiveBirds: batches.reduce((sum, batch) => sum + this.currentLiveBirds(batch.openingBirdCount, batch.mortalityRecords), 0),
        eggs: batches.flatMap((batch) => batch.eggProductionRecords).reduce((sum, row) => sum + this.totalEggs(row), 0),
        feedKg: batches.flatMap((batch) => batch.feedConsumptionRecords).reduce((sum, row) => sum + Number(row.quantityKg), 0),
        costs: batches.flatMap((batch) => batch.costRecords).reduce((sum, row) => sum + Number(row.amount), 0)
      }
    };
  }

  async listHouses(user: AuthenticatedUser, query: PoultryQueryDto) {
    const data = await this.prisma.poultryHouse.findMany({
      where: { ...this.houseWhere(user), ...(query.farmId ? { farmId: query.farmId } : {}) },
      include: {
        farm: { select: { id: true, code: true, name: true } },
        pens: { where: { deletedAt: null }, orderBy: { penNumber: "asc" }, include: { batchAllocations: { include: { flockBatch: { select: { id: true, code: true, name: true, status: true, birdType: true } } } } } }
      },
      orderBy: { code: "asc" }
    });
    return { data };
  }

  async createHouse(user: AuthenticatedUser, dto: CreatePoultryHouseDto, context: RequestContext) {
    this.assertFarmAccess(user, dto.farmId);
    const farm = await this.getFarm(user.companyId, dto.farmId);
    const penCount = dto.defaultPenCount ?? 5;

    const house = await this.prisma.poultryHouse.create({
      data: {
        companyId: user.companyId,
        branchId: farm.branchId,
        farmId: farm.id,
        name: dto.name,
        code: dto.code.toUpperCase(),
        capacity: dto.capacity,
        createdById: user.id,
        pens: {
          create: Array.from({ length: penCount }, (_, i) => ({
            companyId: user.companyId,
            branchId: farm.branchId,
            farmId: farm.id,
            penNumber: i + 1,
            code: `PEN-${String(i + 1).padStart(2, "0")}`,
            createdById: user.id
          }))
        }
      },
      include: { pens: true }
    });
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "CREATE", "PoultryHouse", house.id, `Created poultry house ${house.code} with ${penCount} pens`, context, farm.id);
    return { data: house };
  }

  async listPens(user: AuthenticatedUser, houseId: string) {
    const house = await this.getHouse(user.companyId, houseId);
    const data = await this.prisma.pen.findMany({
      where: { companyId: user.companyId, poultryHouseId: houseId, deletedAt: null },
      orderBy: { penNumber: "asc" },
      include: {
        batchAllocations: {
          include: { flockBatch: { select: { id: true, code: true, name: true, status: true, birdType: true, startDate: true } } }
        }
      }
    });
    return { data, house };
  }

  async addPen(user: AuthenticatedUser, houseId: string, dto: AddPenDto, context: RequestContext) {
    const house = await this.getHouse(user.companyId, houseId);
    this.assertFarmAccess(user, house.farmId);
    const lastPen = await this.prisma.pen.findFirst({ where: { poultryHouseId: houseId, deletedAt: null }, orderBy: { penNumber: "desc" } });
    const nextNumber = (lastPen?.penNumber ?? 0) + 1;
    const pen = await this.prisma.pen.create({
      data: {
        companyId: user.companyId,
        branchId: house.branchId,
        farmId: house.farmId,
        poultryHouseId: houseId,
        penNumber: nextNumber,
        code: `PEN-${String(nextNumber).padStart(2, "0")}`,
        name: dto.name,
        capacity: dto.capacity,
        createdById: user.id
      }
    });
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "CREATE", "Pen", pen.id, `Added pen ${pen.code} to house ${house.code}`, context, house.farmId);
    return { data: pen };
  }

  async updateHouse(user: AuthenticatedUser, id: string, dto: UpdatePoultryHouseDto, context: RequestContext) {
    const house = await this.getHouse(user.companyId, id);
    this.assertFarmAccess(user, house.farmId);
    const data = await this.prisma.poultryHouse.update({
      where: { id },
      data: { name: dto.name, code: dto.code?.toUpperCase(), capacity: dto.capacity, updatedById: user.id }
    });
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "UPDATE", "PoultryHouse", id, `Updated poultry house ${house.code}`, context, house.farmId);
    return { data };
  }

  async deleteHouse(user: AuthenticatedUser, id: string, context: RequestContext) {
    const house = await this.getHouse(user.companyId, id);
    this.assertFarmAccess(user, house.farmId);
    const data = await this.prisma.poultryHouse.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "DELETE", "PoultryHouse", id, `Deleted poultry house ${house.code}`, context, house.farmId);
    return { data };
  }

  async updatePen(user: AuthenticatedUser, id: string, dto: UpdatePenDto, context: RequestContext) {
    const pen = await this.prisma.pen.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!pen) throw new NotFoundException("Pen was not found.");
    this.assertFarmAccess(user, pen.farmId);
    const data = await this.prisma.pen.update({ where: { id }, data: { name: dto.name, capacity: dto.capacity } });
    await this.writeAudit(user, "UPDATE", "Pen", id, `Updated pen ${pen.code}`, context, pen.farmId);
    return { data };
  }

  async deletePen(user: AuthenticatedUser, id: string, context: RequestContext) {
    const pen = await this.prisma.pen.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!pen) throw new NotFoundException("Pen was not found.");
    this.assertFarmAccess(user, pen.farmId);
    await this.prisma.pen.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.writeAudit(user, "DELETE", "Pen", id, `Deleted pen ${pen.code}`, context, pen.farmId);
    return { data: { id } };
  }

  async updateBatch(user: AuthenticatedUser, id: string, dto: UpdateFlockBatchDto, context: RequestContext) {
    const batch = await this.prisma.flockBatch.findFirst({ where: { ...this.batchWhere(user), id } });
    if (!batch) throw new NotFoundException("Flock batch was not found.");
    this.assertFarmAccess(user, batch.farmId);
    const data = await this.prisma.flockBatch.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        birdType: dto.birdType,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        notes: dto.notes,
        updatedById: user.id
      }
    });
    await this.writeAudit(user, "UPDATE", "FlockBatch", id, `Updated flock batch ${batch.code}`, context, batch.farmId);
    return { data };
  }

  async deleteBatch(user: AuthenticatedUser, id: string, context: RequestContext) {
    const batch = await this.prisma.flockBatch.findFirst({ where: { ...this.batchWhere(user), id } });
    if (!batch) throw new NotFoundException("Flock batch was not found.");
    this.assertFarmAccess(user, batch.farmId);
    await this.prisma.flockBatch.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "DELETE", "FlockBatch", id, `Deleted flock batch ${batch.code}`, context, batch.farmId);
    return { data: { id } };
  }

  async listBatches(user: AuthenticatedUser, query: PoultryQueryDto) {
    const [batches, prices] = await Promise.all([
      this.prisma.flockBatch.findMany({
        where: { ...this.batchWhere(user), ...(query.farmId ? { farmId: query.farmId } : {}), ...(query.poultryHouseId ? { poultryHouseId: query.poultryHouseId } : {}) },
        include: {
          farm: { select: { code: true, name: true } },
          poultryHouse: { select: { code: true, name: true } },
          mortalityRecords: { where: { deletedAt: null } },
          feedConsumptionRecords: { where: { deletedAt: null } },
          eggProductionRecords: { where: { deletedAt: null } },
          birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" }, take: 1 },
          costRecords: { where: { deletedAt: null } }
        },
        orderBy: { createdAt: "desc" }
      }),
      this.poultryPrices(user.companyId)
    ]);
    return { data: batches.map((batch) => this.batchMetrics(batch, prices)) };
  }

  async getBatch(user: AuthenticatedUser, id: string) {
    const batch = await this.prisma.flockBatch.findFirst({
      where: { ...this.batchWhere(user), id },
      include: {
        farm: true,
        poultryHouse: true,
        dailyRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" } },
        mortalityRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" } },
        feedConsumptionRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" } },
        eggProductionRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" } },
        birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" } },
        medicationRecords: { where: { deletedAt: null }, orderBy: { startDate: "desc" } },
        vaccinationRecords: { where: { deletedAt: null }, orderBy: { vaccinationDate: "desc" } },
        healthObservations: { where: { deletedAt: null }, orderBy: { observationDate: "desc" } },
        poultryTransferRecords: {
          where: { deletedAt: null },
          orderBy: { transferDate: "desc" },
          include: {
            toPoultryHouse: { select: { id: true, name: true, code: true } },
            toPen: { select: { id: true, code: true, name: true } }
          }
        },
        costRecords: { where: { deletedAt: null }, orderBy: { costDate: "desc" } },
        penAllocations: { include: { pen: { select: { code: true, name: true, penNumber: true, poultryHouse: { select: { name: true, code: true } } } } } }
      }
    });
    if (!batch) {
      throw new NotFoundException("Flock batch was not found.");
    }
    const prices = await this.poultryPrices(user.companyId);

    // Compute live bird count per pen by subtracting both outgoing transfers and
    // mortality from the stored allocation. The stored birdCount represents initial
    // allocation + any incoming transfers (upserted at transfer creation time).
    // Outgoing transfers and deaths are not stored against the pen — they are
    // applied at read time so the sum across all pens (across all houses in the
    // batch) equals currentLiveBirds.
    const outgoingByPen = new Map<string, number>();
    for (const t of batch.poultryTransferRecords) {
      if (t.fromPenId) {
        outgoingByPen.set(t.fromPenId, (outgoingByPen.get(t.fromPenId) ?? 0) + t.birdCount);
      }
    }
    const mortalityByPen = new Map<string, number>();
    for (const m of batch.mortalityRecords) {
      if ((m as any).penId) {
        mortalityByPen.set((m as any).penId, (mortalityByPen.get((m as any).penId) ?? 0) + m.birdCount);
      }
    }
    const adjustedAllocations = batch.penAllocations.map((alloc: any) => ({
      ...alloc,
      birdCount: Math.max(0, alloc.birdCount
        - (outgoingByPen.get(alloc.penId) ?? 0)
        - (mortalityByPen.get(alloc.penId) ?? 0))
    }));

    const batchAdj = { ...batch, penAllocations: adjustedAllocations };
    return { data: { ...batchAdj, metrics: this.batchMetrics(batchAdj, prices) } };
  }

  async createBatch(user: AuthenticatedUser, dto: CreateFlockBatchDto, context: RequestContext) {
    if (!dto.penAllocations?.length) {
      throw new BadRequestException("At least one pen allocation is required.");
    }
    const totalAllocated = dto.penAllocations.reduce((sum, a) => sum + a.birdCount, 0);
    if (totalAllocated !== dto.openingBirdCount) {
      throw new BadRequestException(`Pen allocations total (${totalAllocated}) must equal opening bird count (${dto.openingBirdCount}).`);
    }

    const penIds = dto.penAllocations.map((a) => a.penId);
    const pens = await this.prisma.pen.findMany({ where: { companyId: user.companyId, id: { in: penIds }, deletedAt: null } });
    if (pens.length !== penIds.length) {
      throw new BadRequestException("One or more pens were not found.");
    }

    const farmIds = [...new Set(pens.map((p) => p.farmId))];
    if (farmIds.length > 1) {
      throw new BadRequestException("All pens must belong to the same farm. Split into separate batches for each farm.");
    }
    farmIds.forEach((fid) => this.assertFarmAccess(user, fid));

    const codeUpper = dto.code.toUpperCase();
    const codeConflict = await this.prisma.flockBatch.findFirst({ where: { companyId: user.companyId, code: codeUpper, deletedAt: null } });
    if (codeConflict) {
      throw new BadRequestException(`A batch with code ${codeUpper} already exists.`);
    }

    const activeBatchCheck = await this.prisma.batchPenAllocation.findFirst({
      where: { penId: { in: penIds }, flockBatch: { status: "ACTIVE", deletedAt: null } }
    });
    if (activeBatchCheck) {
      throw new BadRequestException("One or more selected pens already have an active batch.");
    }

    const firstPen = pens[0];
    const batch = await this.prisma.flockBatch.create({
      data: {
        companyId: user.companyId,
        branchId: firstPen.branchId,
        farmId: firstPen.farmId,
        code: codeUpper,
        name: dto.name,
        birdType: dto.birdType,
        openingBirdCount: dto.openingBirdCount,
        startDate: new Date(dto.startDate),
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        status: dto.status ?? "ACTIVE",
        notes: dto.notes,
        createdById: user.id,
        penAllocations: {
          create: dto.penAllocations.map((alloc) => {
            const pen = pens.find((p) => p.id === alloc.penId)!;
            return {
              companyId: user.companyId,
              branchId: pen.branchId,
              penId: alloc.penId,
              poultryHouseId: pen.poultryHouseId,
              farmId: pen.farmId,
              birdCount: alloc.birdCount,
              notes: alloc.notes,
              createdById: user.id
            };
          })
        }
      },
      include: { penAllocations: { include: { pen: true } } }
    });
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "CREATE", "FlockBatch", batch.id, `Created flock batch ${batch.code} across ${penIds.length} pen(s)`, context, batch.farmId);
    return { data: batch };
  }

  async updateBatchStatus(user: AuthenticatedUser, id: string, dto: UpdateBatchStatusDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, id, false);
    const data = await this.prisma.flockBatch.update({
      where: { id },
      data: {
        status: dto.status,
        actualCloseDate: dto.actualCloseDate ? new Date(dto.actualCloseDate) : dto.status !== "ACTIVE" ? new Date() : undefined,
        notes: dto.notes ?? undefined,
        updatedById: user.id
      }
    });
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "UPDATE", "FlockBatch", id, `Updated batch status to ${dto.status}`, context, batch.farmId);
    return { data };
  }

  async createDailyRecord(user: AuthenticatedUser, dto: CreateDailyPoultryRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const recordDate = new Date(dto.recordDate);
    const payload = { openingBirdCount: dto.openingBirdCount, mortalityCount: dto.mortalityCount, culledCount: dto.culledCount, feedConsumedKg: dto.feedConsumedKg, totalEggs: dto.totalEggs, notes: dto.notes, status: dto.status ?? "SUBMITTED" };
    const existing = await this.prisma.dailyPoultryRecord.findFirst({
      where: { companyId: user.companyId, flockBatchId: batch.id, penId: dto.penId ?? null, recordDate }
    });
    const record = existing
      ? await this.prisma.dailyPoultryRecord.update({ where: { id: existing.id }, data: { ...payload, updatedById: user.id } })
      : await this.prisma.dailyPoultryRecord.create({ data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate, ...payload } });
    await this.writeAudit(user, "CREATE", "DailyPoultryRecord", record.id, "Submitted daily poultry record", context, batch.farmId);
    return { data: record };
  }

  async createMortality(user: AuthenticatedUser, dto: CreateMortalityRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const { _sum } = await this.prisma.mortalityRecord.aggregate({ where: { flockBatchId: batch.id, deletedAt: null }, _sum: { birdCount: true } });
    const liveBirds = Math.max(0, batch.openingBirdCount - (_sum.birdCount ?? 0));
    if (dto.birdCount > liveBirds) throw new BadRequestException(`Cannot record ${dto.birdCount} bird${dto.birdCount !== 1 ? "s" : ""}. Only ${liveBirds} live bird${liveBirds !== 1 ? "s" : ""} remain in this batch.`);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.mortalityRecord.create({
      data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), birdCount: dto.birdCount, isCulling: dto.isCulling ?? false, reason: dto.reason, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
    });
    await this.writeAudit(user, "CREATE", "MortalityRecord", data.id, dto.isCulling ? "Recorded poultry culling" : "Recorded poultry mortality", context, batch.farmId);
    return { data };
  }

  async createFeed(user: AuthenticatedUser, dto: CreateFeedConsumptionRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (dto.warehouseId) this.assertWarehouseAccess(user, dto.warehouseId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.$transaction(async (tx) => {
      const record = await tx.feedConsumptionRecord.create({
        data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), feedProductId: dto.feedProductId, quantityKg: dto.quantityKg, costAmount: dto.costAmount, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
      });
      if (dto.feedProductId && dto.warehouseId) {
        await this.consumeInventoryTx(tx, user, batch, dto.warehouseId, dto.feedProductId, dto.quantityKg, "PRODUCTION_INPUT", "FeedConsumptionRecord", record.id, `Feed consumption for flock ${batch.code}`);
      }
      return record;
    });
    await this.writeAudit(user, "CREATE", "FeedConsumptionRecord", data.id, "Recorded poultry feed consumption", context, batch.farmId);
    return { data };
  }

  async createEggs(user: AuthenticatedUser, dto: CreateEggProductionRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.$transaction(async (tx) => {
      const record = await tx.eggProductionRecord.create({
        data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), goodEggs: dto.goodEggs, crackedEggs: dto.crackedEggs, dirtyEggs: dto.dirtyEggs, brokenEggs: dto.brokenEggs, rejectedEggs: dto.rejectedEggs, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
      });
      if (dto.eggProductId && dto.warehouseId && dto.goodEggs > 0) {
        await this.addToInventoryTx(tx, user, batch, dto.warehouseId, dto.eggProductId, dto.goodEggs, "EggProductionRecord", record.id, `Egg production from flock ${batch.code}`);
      }
      return record;
    });
    await this.writeAudit(user, "CREATE", "EggProductionRecord", data.id, "Recorded egg production", context, batch.farmId);
    return { data };
  }

  async createWeight(user: AuthenticatedUser, dto: CreateBirdWeightRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.birdWeightRecord.create({
      data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), sampleSize: dto.sampleSize, averageWeightKg: dto.averageWeightKg, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
    });
    await this.writeAudit(user, "CREATE", "BirdWeightRecord", data.id, "Recorded bird weight", context, batch.farmId);
    return { data };
  }

  async createMedication(user: AuthenticatedUser, dto: CreateMedicationRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (dto.warehouseId) this.assertWarehouseAccess(user, dto.warehouseId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.$transaction(async (tx) => {
      const record = await tx.medicationRecord.create({
        data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), medicationName: dto.medicationName, dosage: dto.dosage, route: dto.route, startDate: new Date(dto.startDate), endDate: dto.endDate ? new Date(dto.endDate) : undefined, withdrawalUntil: dto.withdrawalUntil ? new Date(dto.withdrawalUntil) : undefined, notes: dto.notes }
      });
      if (dto.medicineProductId && dto.warehouseId && dto.quantityUsed) {
        await this.consumeInventoryTx(tx, user, batch, dto.warehouseId, dto.medicineProductId, dto.quantityUsed, "PRODUCTION_INPUT", "MedicationRecord", record.id, `Medication (${dto.medicationName}) for flock ${batch.code}`);
      }
      return record;
    });
    await this.writeAudit(user, "CREATE", "MedicationRecord", data.id, "Recorded poultry medication", context, batch.farmId);
    return { data };
  }

  async createVaccination(user: AuthenticatedUser, dto: CreateVaccinationRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (dto.warehouseId) this.assertWarehouseAccess(user, dto.warehouseId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.$transaction(async (tx) => {
      const record = await tx.vaccinationRecord.create({
        data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), vaccineName: dto.vaccineName, dose: dto.dose, vaccinationDate: new Date(dto.vaccinationDate), nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined, notes: dto.notes }
      });
      if (dto.vaccineProductId && dto.warehouseId && dto.quantityUsed) {
        await this.consumeInventoryTx(tx, user, batch, dto.warehouseId, dto.vaccineProductId, dto.quantityUsed, "PRODUCTION_INPUT", "VaccinationRecord", record.id, `Vaccination (${dto.vaccineName}) for flock ${batch.code}`);
      }
      return record;
    });
    await this.writeAudit(user, "CREATE", "VaccinationRecord", data.id, "Recorded poultry vaccination", context, batch.farmId);
    return { data };
  }

  async createHealthObservation(user: AuthenticatedUser, dto: CreateHealthObservationDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.poultryHealthObservation.create({
      data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), observationDate: new Date(dto.observationDate), severity: dto.severity, observation: dto.observation, vetVisitDate: dto.vetVisitDate ? new Date(dto.vetVisitDate) : undefined, veterinarianName: dto.veterinarianName, recommendation: dto.recommendation }
    });
    await this.writeAudit(user, "CREATE", "PoultryHealthObservation", data.id, "Recorded poultry health observation", context, batch.farmId);
    return { data };
  }

  async createTransfer(user: AuthenticatedUser, dto: CreatePoultryTransferDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    this.assertFarmAccess(user, dto.toFarmId);
    const toHouse = await this.getHouse(user.companyId, dto.toPoultryHouseId);
    if (toHouse.farmId !== dto.toFarmId) {
      throw new BadRequestException("Destination poultry house does not belong to the destination farm.");
    }
    const fromPen = dto.fromPenId ? await this.prisma.pen.findFirst({ where: { id: dto.fromPenId, companyId: user.companyId } }) : null;
    const fromHouseId = fromPen?.poultryHouseId ?? dto.fromPoultryHouseId ?? batch.poultryHouseId;
    if (!fromHouseId) throw new BadRequestException("Cannot determine source house. Specify a fromPenId or fromPoultryHouseId.");

    if (dto.fromPenId) {
      const fromAlloc = await this.prisma.batchPenAllocation.findFirst({ where: { flockBatchId: batch.id, penId: dto.fromPenId } });
      if (!fromAlloc) throw new BadRequestException("Source pen is not allocated to this batch.");
      const [outgoing, penMortality] = await Promise.all([
        this.prisma.poultryTransferRecord.aggregate({ where: { flockBatchId: batch.id, fromPenId: dto.fromPenId, deletedAt: null }, _sum: { birdCount: true } }),
        this.prisma.mortalityRecord.aggregate({ where: { flockBatchId: batch.id, penId: dto.fromPenId, deletedAt: null }, _sum: { birdCount: true } })
      ]);
      const available = fromAlloc.birdCount - (outgoing._sum.birdCount ?? 0) - (penMortality._sum.birdCount ?? 0);
      if (dto.birdCount > available) {
        throw new BadRequestException(`Source pen only has ${available} birds available. Cannot transfer ${dto.birdCount}.`);
      }
    } else {
      const [mortalityAgg, outgoingAgg] = await Promise.all([
        this.prisma.mortalityRecord.aggregate({ where: { flockBatchId: batch.id, deletedAt: null }, _sum: { birdCount: true } }),
        this.prisma.poultryTransferRecord.aggregate({ where: { flockBatchId: batch.id, deletedAt: null }, _sum: { birdCount: true } })
      ]);
      const liveBirds = Math.max(0, batch.openingBirdCount - (mortalityAgg._sum.birdCount ?? 0) - (outgoingAgg._sum.birdCount ?? 0));
      if (dto.birdCount > liveBirds) throw new BadRequestException(`Cannot transfer ${dto.birdCount} birds. Only ${liveBirds} live birds remain in this batch.`);
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.poultryTransferRecord.create({
        data: {
          companyId: user.companyId,
          branchId: batch.branchId,
          flockBatchId: batch.id,
          fromFarmId: batch.farmId,
          fromPoultryHouseId: fromHouseId,
          fromPenId: dto.fromPenId,
          toFarmId: dto.toFarmId,
          toPoultryHouseId: dto.toPoultryHouseId,
          toPenId: dto.toPenId,
          birdCount: dto.birdCount,
          transferDate: new Date(dto.transferDate),
          reason: dto.reason,
          createdById: user.id
        }
      });

      if (dto.toPenId) {
        // Activate the destination pen so it appears in dropdowns and can receive records.
        await tx.pen.update({ where: { id: dto.toPenId }, data: { isActive: true } });

        // Link the destination pen to the batch (create or increment birdCount).
        await tx.batchPenAllocation.upsert({
          where: { flockBatchId_penId: { flockBatchId: batch.id, penId: dto.toPenId } },
          update: { birdCount: { increment: dto.birdCount } },
          create: {
            companyId: user.companyId,
            branchId: toHouse.branchId,
            flockBatchId: batch.id,
            penId: dto.toPenId,
            poultryHouseId: dto.toPoultryHouseId,
            farmId: dto.toFarmId,
            birdCount: dto.birdCount,
            createdById: user.id
          }
        });
      }

      return transfer;
    });

    // Bust the options cache so the now-active pen is visible immediately.
    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "TRANSFER", "PoultryTransferRecord", data.id, "Created poultry transfer request", context, batch.farmId);
    return { data };
  }

  async updateTransferStatus(user: AuthenticatedUser, id: string, dto: UpdatePoultryTransferStatusDto, context: RequestContext) {
    const transfer = await this.prisma.poultryTransferRecord.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!transfer) {
      throw new NotFoundException("Transfer was not found.");
    }
    this.assertFarmAccess(user, transfer.fromFarmId);
    const data = await this.prisma.poultryTransferRecord.update({
      where: { id },
      data: {
        status: dto.status,
        approvedAt: ["APPROVED", "COMPLETED"].includes(dto.status) ? new Date() : undefined,
        approvedById: ["APPROVED", "COMPLETED"].includes(dto.status) ? user.id : undefined,
        updatedById: user.id
      }
    });
    await this.writeAudit(user, dto.status === "APPROVED" ? "APPROVE" : "UPDATE", "PoultryTransferRecord", data.id, `Updated poultry transfer to ${dto.status}`, context, transfer.fromFarmId);
    return { data };
  }

  async allocateTransferPen(user: AuthenticatedUser, id: string, dto: AllocateTransferPenDto, context: RequestContext) {
    const transfer = await this.prisma.poultryTransferRecord.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!transfer) throw new NotFoundException("Transfer was not found.");
    if (transfer.toPenId) throw new BadRequestException("This transfer already has a pen assigned.");

    const pen = await this.prisma.pen.findFirst({ where: { id: dto.penId, companyId: user.companyId } });
    if (!pen) throw new NotFoundException("Pen not found.");
    if (pen.poultryHouseId !== transfer.toPoultryHouseId) throw new BadRequestException("Pen does not belong to the transfer's destination house.");

    const house = await this.prisma.poultryHouse.findFirst({ where: { id: transfer.toPoultryHouseId!, companyId: user.companyId } });

    const data = await this.prisma.$transaction(async (tx) => {
      await tx.pen.update({ where: { id: dto.penId }, data: { isActive: true } });
      await tx.batchPenAllocation.upsert({
        where: { flockBatchId_penId: { flockBatchId: transfer.flockBatchId, penId: dto.penId } },
        update: { birdCount: { increment: transfer.birdCount } },
        create: {
          companyId: user.companyId,
          branchId: house?.branchId ?? transfer.branchId,
          flockBatchId: transfer.flockBatchId,
          penId: dto.penId,
          poultryHouseId: transfer.toPoultryHouseId!,
          farmId: transfer.toFarmId,
          birdCount: transfer.birdCount,
          createdById: user.id
        }
      });
      return tx.poultryTransferRecord.update({ where: { id }, data: { toPenId: dto.penId, updatedById: user.id } });
    });

    this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    await this.writeAudit(user, "UPDATE", "PoultryTransferRecord", id, `Assigned pen to transfer`, context, transfer.fromFarmId);
    return { data };
  }

  async createCost(user: AuthenticatedUser, dto: CreatePoultryCostRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const data = await this.prisma.poultryCostRecord.create({
      data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), costDate: new Date(dto.costDate), costType: dto.costType, amount: dto.amount, description: dto.description, status: dto.status ?? "SUBMITTED" }
    });
    await this.writeAudit(user, "CREATE", "PoultryCostRecord", data.id, "Recorded poultry batch cost", context, batch.farmId);
    return { data };
  }

  async approveCost(user: AuthenticatedUser, id: string, context: RequestContext) {
    const cost = await this.prisma.poultryCostRecord.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!cost) {
      throw new NotFoundException("Cost record was not found.");
    }
    this.assertFarmAccess(user, cost.farmId);
    const data = await this.prisma.poultryCostRecord.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id, updatedById: user.id } });
    await this.writeAudit(user, "APPROVE", "PoultryCostRecord", id, "Approved poultry cost record", context, cost.farmId);
    return { data };
  }

  async listRecords(user: AuthenticatedUser, type: string, query: PoultryQueryDto) {
    const where = this.recordWhere(user, query, type);
    const model = this.recordModel(type);
    const take = Math.min(query.take ?? 200, 500);
    const skip = query.skip ?? 0;
    const [data, total] = await Promise.all([
      model.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
      model.count({ where })
    ]);
    return { data, meta: { total, take, skip } };
  }

  async softDelete(user: AuthenticatedUser, type: string, id: string, context: RequestContext) {
    const model = this.recordModel(type);
    const existing = await model.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("Record was not found.");
    }
    // Transfer records use fromFarmId/toFarmId, not farmId
    const farmId: string = existing.farmId ?? existing.fromFarmId;
    this.assertFarmAccess(user, farmId);

    let data: unknown;
    if (type === "transfers" && existing.toPenId) {
      // Reverse the batchPenAllocation increment that was created when the transfer was made.
      data = await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.poultryTransferRecord.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
        await tx.batchPenAllocation.update({
          where: { flockBatchId_penId: { flockBatchId: existing.flockBatchId, penId: existing.toPenId } },
          data: { birdCount: { decrement: existing.birdCount } }
        });
        return deleted;
      });
      this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    } else {
      data = await model.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    }
    await this.writeAudit(user, "DELETE", type, id, `Deleted poultry ${type} record`, context, farmId);
    return { data };
  }

  async updateRecord(user: AuthenticatedUser, type: string, id: string, dto: Record<string, any>, context: RequestContext) {
    const model = this.recordModel(type);
    const existing = await model.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!existing) throw new NotFoundException("Record was not found.");
    const farmId: string = existing.farmId ?? existing.fromFarmId;
    this.assertFarmAccess(user, farmId);

    // Per-type correctable fields. Transfer birdCount is excluded — changing it
    // would require resyncing batchPenAllocation and is handled via delete+recreate.
    const CORRECTABLE: Record<string, string[]> = {
      daily: ["mortalityCount", "culledCount", "feedConsumedKg", "totalEggs", "notes"],
      mortality: ["birdCount", "reason", "notes"],
      feed: ["quantityKg", "costAmount", "notes"],
      eggs: ["goodEggs", "crackedEggs", "dirtyEggs", "brokenEggs", "rejectedEggs", "notes"],
      weights: ["sampleSize", "averageWeightKg", "notes"],
      medications: ["notes"],
      vaccinations: ["notes"],
      health: ["observation", "recommendation", "notes"],
      transfers: ["reason", "notes"],
      costs: ["amount", "description", "notes"]
    };
    const correctable = CORRECTABLE[type] ?? [];
    const updateData: Record<string, any> = { updatedById: user.id };
    for (const field of correctable) {
      if (dto[field] !== undefined) updateData[field] = dto[field];
    }
    const data = await model.update({ where: { id }, data: updateData });

    if (type === "feed" && updateData.quantityKg !== undefined) {
      const feed = existing as { feedProductId?: string | null; warehouseId?: string | null; quantityKg: number };
      if (feed.feedProductId && feed.warehouseId) {
        const delta = Number(updateData.quantityKg) - Number(feed.quantityKg);
        if (delta !== 0) {
          const invItem = await this.prisma.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: feed.warehouseId, productId: feed.feedProductId, deletedAt: null } });
          if (invItem) {
            await this.prisma.inventoryItem.update({ where: { id: invItem.id }, data: { quantityOnHand: delta > 0 ? { decrement: delta } : { increment: -delta }, updatedById: user.id } });
            await this.prisma.stockMovement.create({ data: { companyId: user.companyId, branchId: invItem.branchId, productId: feed.feedProductId, inventoryItemId: invItem.id, fromWarehouseId: feed.warehouseId, warehouseId: feed.warehouseId, uomId: invItem.uomId, movementType: delta > 0 ? "PRODUCTION_INPUT" : "ADJUSTMENT_IN", quantity: Math.abs(delta), referenceType: "FeedConsumptionRecord", referenceId: id, notes: "Feed quantity correction", createdById: user.id } });
          }
        }
      }
    }

    await this.writeAudit(user, "UPDATE", type, id, `Corrected poultry ${type} record`, context, farmId);
    return { data };
  }

  async reportCsv(user: AuthenticatedUser, query: PoultryQueryDto, context: RequestContext) {
    const batches = await this.listBatches(user, query);
    const rows = [
      ["batch", "farm", "house", "bird_type", "opening_birds", "current_live_birds", "mortality_rate", "egg_production_percent", "feed_conversion_ratio", "cost_per_bird", "profitability"],
      ...batches.data.map((batch) => [
        batch.code,
        batch.farm?.name ?? "",
        batch.poultryHouse?.name ?? "multi-house",
        batch.birdType,
        String(batch.openingBirdCount),
        String(batch.currentLiveBirds),
        String(batch.mortalityRate),
        String(batch.eggProductionPercent),
        String(batch.feedConversionRatio),
        String(batch.costPerBird),
        String(batch.profitability)
      ])
    ];
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "Report", entityId: "poultry.summary", summary: "Exported poultry summary report", ipAddress: context.ipAddress, userAgent: context.userAgent });
    return rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
  }

  private batchMetrics(batch: any, prices: { eggPricePerUnit: number; broilerPricePerKg: number }) {
    const records: any[] = batch.mortalityRecords ?? [];
    // Natural deaths only for mortalityRate — culling is a planned management action,
    // not a disease/welfare event, and should not trigger high-mortality alerts.
    const naturalMortality = records.filter((r) => !r.isCulling).reduce((sum: number, r: any) => sum + r.birdCount, 0);
    // currentLiveBirds subtracts both natural deaths AND culling — culled birds are gone.
    const currentLiveBirds = this.currentLiveBirds(batch.openingBirdCount, records);
    const totalFeedKg = (batch.feedConsumptionRecords ?? []).reduce((sum: number, row: any) => sum + Number(row.quantityKg), 0);
    const totalEggs = (batch.eggProductionRecords ?? []).reduce((sum: number, row: any) => sum + this.totalEggs(row), 0);
    const totalCosts = (batch.costRecords ?? []).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    const latestWeight = Number(batch.birdWeightRecords?.[0]?.averageWeightKg ?? 0);
    const estimatedRevenue =
      totalEggs * prices.eggPricePerUnit +
      (batch.birdType === "BROILERS" ? currentLiveBirds * latestWeight * prices.broilerPricePerKg : 0);
    const numEggDays = (batch.eggProductionRecords ?? []).length;
    // Hen-day production %: eggs / (live birds × days with records). Zero when no egg records.
    const eggProductionPercent = numEggDays > 0
      ? Number(((totalEggs / (Math.max(currentLiveBirds, 1) * numEggDays)) * 100).toFixed(2))
      : 0;
    return {
      ...batch,
      currentLiveBirds,
      mortalityRate: Number(((naturalMortality / Math.max(batch.openingBirdCount, 1)) * 100).toFixed(2)),
      eggProductionPercent,
      feedConversionRatio: batch.birdType === "BROILERS" && latestWeight > 0 ? Number((totalFeedKg / Math.max(currentLiveBirds * latestWeight, 1)).toFixed(2)) : 0,
      costPerBird: Number((totalCosts / Math.max(currentLiveBirds, 1)).toFixed(2)),
      profitability: Number((estimatedRevenue - totalCosts).toFixed(2)),
      totalFeedKg: Number(totalFeedKg.toFixed(2)),
      totalEggs,
      totalCosts: Number(totalCosts.toFixed(2))
    };
  }

  private async poultryPrices(companyId: string): Promise<{ eggPricePerUnit: number; broilerPricePerKg: number }> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { companyId, key: "poultry.pricing", deletedAt: null },
      select: { value: true }
    });
    const v = (setting?.value ?? {}) as Record<string, unknown>;
    return {
      eggPricePerUnit: v.eggPricePerUnit ? Number(v.eggPricePerUnit) : 1.2,
      broilerPricePerKg: v.broilerPricePerKg ? Number(v.broilerPricePerKg) : 35
    };
  }

  private currentLiveBirds(openingBirdCount: number, mortalityRecords: Array<{ birdCount: number }>) {
    return Math.max(0, openingBirdCount - mortalityRecords.reduce((sum, row) => sum + row.birdCount, 0));
  }

  private totalEggs(row: { goodEggs: number; crackedEggs: number; dirtyEggs: number; brokenEggs: number; rejectedEggs: number }) {
    return row.goodEggs + row.crackedEggs + row.dirtyEggs + row.brokenEggs + row.rejectedEggs;
  }

  private async getBatchContext(user: AuthenticatedUser, flockBatchId: string, requireActive = true): Promise<BatchContext> {
    const batch = await this.prisma.flockBatch.findFirst({ where: { ...this.batchWhere(user), id: flockBatchId } });
    if (!batch) {
      throw new NotFoundException("Flock batch was not found.");
    }
    this.assertFarmAccess(user, batch.farmId);
    if (requireActive && batch.status !== "ACTIVE" && batch.status !== "PLANNED") {
      throw new BadRequestException(`Cannot add records to a batch with status "${batch.status}". Only ACTIVE or PLANNED batches accept new records.`);
    }
    return batch;
  }

  private async getFarm(companyId: string, farmId: string) {
    const farm = await this.prisma.farm.findFirst({ where: { companyId, id: farmId, deletedAt: null } });
    if (!farm) {
      throw new NotFoundException("Farm was not found.");
    }
    return farm;
  }

  private async getHouse(companyId: string, poultryHouseId: string) {
    const house = await this.prisma.poultryHouse.findFirst({ where: { companyId, id: poultryHouseId, deletedAt: null } });
    if (!house) {
      throw new NotFoundException("Poultry house was not found.");
    }
    return house;
  }

  private batchRecordBase(user: AuthenticatedUser, batch: BatchContext, poultryHouseId: string, penId?: string) {
    return {
      companyId: user.companyId,
      branchId: batch.branchId,
      farmId: batch.farmId,
      poultryHouseId,
      penId: penId ?? undefined,
      flockBatchId: batch.id,
      createdById: user.id
    };
  }

  private async resolvePenHouseId(companyId: string, penId: string | undefined, batch: BatchContext): Promise<string> {
    if (penId) {
      const pen = await this.prisma.pen.findFirst({ where: { id: penId, companyId, deletedAt: null } });
      if (!pen) throw new BadRequestException("Pen not found.");
      const alloc = await this.prisma.batchPenAllocation.findFirst({ where: { flockBatchId: batch.id, penId } });
      if (!alloc) throw new BadRequestException("The specified pen is not allocated to this batch.");
      return pen.poultryHouseId;
    }
    if (batch.poultryHouseId) return batch.poultryHouseId;
    const firstAlloc = await this.prisma.batchPenAllocation.findFirst({ where: { flockBatchId: batch.id }, include: { pen: true } });
    if (!firstAlloc) throw new BadRequestException("Batch has no pen allocations. Specify penId.");
    return firstAlloc.pen.poultryHouseId;
  }

  private farmWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { id: { in: user.farmIds } }) };
  }

  private houseWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { farmId: { in: user.farmIds } }) };
  }

  private batchWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess || user.farmIds.length === 0 ? {} : { farmId: { in: user.farmIds } }) };
  }

  private recordWhere(user: AuthenticatedUser, query: PoultryQueryDto, type?: string) {
    const farmFilter: Record<string, unknown> = user.hasGlobalAccess || user.farmIds.length === 0
      ? (query.farmId ? { farmId: query.farmId } : {})
      : {
          farmId:
            query.farmId && user.farmIds.includes(query.farmId)
              ? query.farmId
              : { in: user.farmIds }
        };

    // Each record type stores its date under a different field name.
    // Using an OR across all field names causes Prisma validation errors for types
    // that don't have those fields. Use the correct field per type instead.
    const DATE_FIELD: Record<string, string> = {
      daily: "recordDate", mortality: "recordDate", feed: "recordDate",
      eggs: "recordDate", weights: "recordDate", medications: "startDate",
      vaccinations: "vaccinationDate", health: "observationDate",
      transfers: "transferDate", costs: "costDate"
    };
    const dateField = type ? (DATE_FIELD[type] ?? "recordDate") : "recordDate";
    const dateRange = query.startDate || query.endDate
      ? { [dateField]: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } }
      : {};

    return {
      companyId: user.companyId,
      deletedAt: null,
      ...farmFilter,
      poultryHouseId: query.poultryHouseId,
      flockBatchId: query.flockBatchId,
      ...dateRange
    };
  }

  private recordModel(type: string) {
    const models: Record<string, any> = {
      daily: this.prisma.dailyPoultryRecord,
      mortality: this.prisma.mortalityRecord,
      feed: this.prisma.feedConsumptionRecord,
      eggs: this.prisma.eggProductionRecord,
      weights: this.prisma.birdWeightRecord,
      medications: this.prisma.medicationRecord,
      vaccinations: this.prisma.vaccinationRecord,
      health: this.prisma.poultryHealthObservation,
      transfers: this.prisma.poultryTransferRecord,
      costs: this.prisma.poultryCostRecord
    };
    const model = models[type];
    if (!model) {
      throw new BadRequestException("Unsupported poultry record type.");
    }
    return model;
  }

  private assertFarmAccess(user: AuthenticatedUser, farmId: string) {
    if (!user.hasGlobalAccess && !user.farmIds.includes(farmId)) {
      throw new ForbiddenException("You do not have access to this farm.");
    }
  }

  private assertWarehouseAccess(user: AuthenticatedUser, warehouseId: string) {
    if (!user.hasGlobalAccess && !user.warehouseIds.includes(warehouseId)) {
      throw new ForbiddenException("You do not have access to this warehouse.");
    }
  }

  private async consumeInventoryTx(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    batch: BatchContext,
    warehouseId: string,
    productId: string,
    quantity: number,
    movementType: "PRODUCTION_INPUT" | "WASTE",
    referenceType: string,
    referenceId: string,
    notes: string
  ) {
    const item = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId, productId, deletedAt: null } });
    if (!item) return; // no inventory item set up for this product/warehouse — skip deduction, record still saves
    const product = await tx.product.findFirst({ where: { id: productId } });
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: { decrement: quantity }, updatedById: user.id } });
    await tx.stockMovement.create({
      data: { companyId: user.companyId, branchId: batch.branchId, productId, inventoryItemId: item.id, fromWarehouseId: warehouseId, warehouseId, farmId: batch.farmId, uomId: product!.uomId, movementType, quantity, referenceType, referenceId, notes, createdById: user.id }
    });
  }

  private async addToInventoryTx(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    batch: BatchContext,
    warehouseId: string,
    productId: string,
    quantity: number,
    referenceType: string,
    referenceId: string,
    notes: string
  ) {
    const warehouse = await tx.warehouse.findFirst({ where: { companyId: user.companyId, id: warehouseId, deletedAt: null } });
    if (!warehouse) throw new BadRequestException("Warehouse not found.");
    const product = await tx.product.findFirst({ where: { companyId: user.companyId, id: productId } });
    if (!product) throw new BadRequestException("Product not found.");
    const item = await tx.inventoryItem.upsert({
      where: { companyId_warehouseId_productId: { companyId: user.companyId, warehouseId, productId } },
      update: { quantityOnHand: { increment: quantity }, updatedById: user.id },
      create: { companyId: user.companyId, branchId: warehouse.branchId, warehouseId, farmId: batch.farmId, productId, uomId: product.uomId, quantityOnHand: quantity, createdById: user.id }
    });
    await tx.stockMovement.create({
      data: { companyId: user.companyId, branchId: batch.branchId, productId, inventoryItemId: item.id, toWarehouseId: warehouseId, warehouseId, farmId: batch.farmId, uomId: product.uomId, movementType: "PRODUCTION_OUTPUT", quantity, referenceType, referenceId, notes, createdById: user.id }
    });
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE", entityType: string, entityId: string, summary: string, context: RequestContext, farmId?: string) {
    await this.audit.write({ companyId: user.companyId, farmId, actorUserId: user.id, action, entityType, entityId, summary, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
