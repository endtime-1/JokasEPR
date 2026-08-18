import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LookupCacheService } from "../../common/services/lookup-cache.service";
import { startOfTodayAccra } from "../../common/utils/timezone";
import { nextRef } from "../../common/next-ref";
import { withDbRetry } from "../../common/db-retry";
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

// Record types whose create path optionally moves real inventory
// (consumeInventoryTx/addToInventoryTx), keyed to the referenceType string
// the resulting StockMovement was written with.
const INVENTORY_LINKED_RECORD_TYPES: Record<string, string> = {
  feed: "FeedConsumptionRecord",
  eggs: "EggProductionRecord",
  medications: "MedicationRecord",
  vaccinations: "VaccinationRecord"
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
  status: string;
};

@Injectable()
export class PoultryService {
  private readonly logger = new Logger(PoultryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookupCache: LookupCacheService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const todayStart = startOfTodayAccra(); // (M20) was server-local midnight
    const since7 = new Date(todayStart.getTime() - 6 * 86400000);

    const [batches, weekEggs, weekMortality, weekFeed, recentHealth, houses, prices] = await Promise.all([
      this.prisma.flockBatch.findMany({
        where: { ...this.batchWhere(user), status: "ACTIVE" as never },
        include: {
          farm: { select: { name: true, code: true } },
          poultryHouse: { select: { name: true, code: true } },
          mortalityRecords: { where: { deletedAt: null }, select: { birdCount: true, isCulling: true } },
          poultryTransferRecords: { where: { deletedAt: null }, select: { birdCount: true, isFullBatchRelocation: true, fromFarmId: true, toFarmId: true } },
          feedConsumptionRecords: { where: { deletedAt: null }, select: { quantityKg: true } },
          eggProductionRecords: { where: { deletedAt: null }, select: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true } },
          birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" }, take: 1 },
          costRecords: { where: { deletedAt: null }, select: { amount: true } },
          dailyRecords: { where: { deletedAt: null, recordDate: { gte: todayStart } }, select: { id: true } },
          penAllocations: { select: { birdCount: true, pen: { select: { code: true, name: true } } } }
        },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.prisma.eggProductionRecord.groupBy({
        by: ["recordDate"],
        where: { companyId: user.companyId, recordDate: { gte: since7 }, deletedAt: null, ...(user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } }) },
        _sum: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true },
        orderBy: { recordDate: "asc" }
      }),
      this.prisma.mortalityRecord.groupBy({
        by: ["recordDate"],
        where: { companyId: user.companyId, recordDate: { gte: since7 }, deletedAt: null, isCulling: false, ...(user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } }) },
        _sum: { birdCount: true },
        orderBy: { recordDate: "asc" }
      }),
      this.prisma.feedConsumptionRecord.groupBy({
        by: ["recordDate"],
        where: { companyId: user.companyId, recordDate: { gte: since7 }, deletedAt: null, ...(user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } }) },
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
    // Only cache when batches exist — an empty-batches response can be transient (DB
    // warmup, first request during cold-start) and caching it would serve stale empty
    // data for the full 45-second TTL, causing "No flock batches found" to flash.
    if (batches.length > 0) {
      this.lookupCache.set(cacheKey, result);
    }
    return result;
  }

  async farmOverview(user: AuthenticatedUser, farmId: string) {
    this.assertFarmAccess(user, farmId);
    const [houses, batches] = await Promise.all([
      this.prisma.poultryHouse.findMany({ where: { companyId: user.companyId, farmId, deletedAt: null }, orderBy: { code: "asc" } }),
      this.prisma.flockBatch.findMany({
          where: { companyId: user.companyId, farmId, deletedAt: null },
          include: {
            mortalityRecords: { where: { deletedAt: null } },
            poultryTransferRecords: { where: { deletedAt: null }, select: { birdCount: true, isFullBatchRelocation: true, fromFarmId: true, toFarmId: true } },
            eggProductionRecords: { where: { deletedAt: null } },
            feedConsumptionRecords: { where: { deletedAt: null }, select: { quantityKg: true } },
            costRecords: { where: { deletedAt: null } }
          }
        })
      ]);

    return {
      data: {
        houses,
        batchCount: batches.length,
        currentLiveBirds: batches.reduce((sum, batch) => sum + this.currentLiveBirds(batch.openingBirdCount, batch.mortalityRecords, batch.poultryTransferRecords), 0),
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
    // Previously missing — a user restricted to Farm A could read Farm B's
    // pens and active batch allocations via any houseId in the company.
    this.assertFarmAccess(user, house.farmId);
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
    if (dto.birdType && dto.birdType !== batch.birdType) {
      const [eggs, weights] = await Promise.all([
        this.prisma.eggProductionRecord.count({ where: { flockBatchId: id, deletedAt: null } }),
        this.prisma.birdWeightRecord.count({ where: { flockBatchId: id, deletedAt: null } })
      ]);
      if (eggs + weights > 0) throw new BadRequestException(`Cannot change bird type from ${batch.birdType} to ${dto.birdType} — this batch has existing egg production or weight records.`);
    }
    const codeUpper = dto.code ? dto.code.toUpperCase() : undefined;
    if (codeUpper && codeUpper !== batch.code) {
      const codeConflict = await this.prisma.flockBatch.findFirst({ where: { companyId: user.companyId, code: codeUpper, deletedAt: null, id: { not: id } } });
      if (codeConflict) throw new BadRequestException(`A batch with code ${codeUpper} already exists.`);
    }
    const data = await this.prisma.flockBatch.update({
      where: { id },
      data: {
        name: dto.name,
        code: codeUpper,
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
    const [mortality, feed, eggs, weights, costs, transfers] = await Promise.all([
      this.prisma.mortalityRecord.count({ where: { flockBatchId: id, deletedAt: null } }),
      this.prisma.feedConsumptionRecord.count({ where: { flockBatchId: id, deletedAt: null } }),
      this.prisma.eggProductionRecord.count({ where: { flockBatchId: id, deletedAt: null } }),
      this.prisma.birdWeightRecord.count({ where: { flockBatchId: id, deletedAt: null } }),
      this.prisma.poultryCostRecord.count({ where: { flockBatchId: id, deletedAt: null } }),
      this.prisma.poultryTransferRecord.count({ where: { flockBatchId: id, deletedAt: null } })
    ]);
    const total = mortality + feed + eggs + weights + costs + transfers;
    if (total > 0) throw new BadRequestException(`Cannot delete batch "${batch.code}" — it has ${total} active record${total !== 1 ? "s" : ""} (mortality: ${mortality}, feed: ${feed}, eggs: ${eggs}, weights: ${weights}, costs: ${costs}, transfers: ${transfers}). Delete all records first.`);
    // The (companyId, code) unique index isn't deletedAt-aware, so a deleted
    // batch's code otherwise stays permanently reserved and blocks reuse.
    await this.prisma.flockBatch.update({ where: { id }, data: { code: `${batch.code}__deleted_${id}`, deletedAt: new Date(), updatedById: user.id } });
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
          poultryTransferRecords: { where: { deletedAt: null }, select: { birdCount: true, isFullBatchRelocation: true, fromFarmId: true, toFarmId: true } },
          feedConsumptionRecords: { where: { deletedAt: null } },
          eggProductionRecords: { where: { deletedAt: null } },
          birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" }, take: 1 },
          costRecords: { where: { deletedAt: null } }
        },
        orderBy: { createdAt: "desc" },
        take: query.take ?? 50
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

    // (M18) Pens have a defined physical capacity, but nothing ever checked
    // an allocation against it — a pen with a 500-bird capacity could be
    // allocated 5,000 birds with no error, silently corrupting density/
    // welfare-capacity reporting downstream. capacity is nullable (not every
    // pen has one recorded), so a null capacity means no cap to enforce.
    const overCapacity = dto.penAllocations
      .map((alloc) => ({ alloc, pen: pens.find((p) => p.id === alloc.penId)! }))
      .filter(({ alloc, pen }) => pen.capacity != null && alloc.birdCount > pen.capacity);
    if (overCapacity.length) {
      const details = overCapacity.map(({ alloc, pen }) => `${pen.code} (capacity ${pen.capacity}, allocated ${alloc.birdCount})`).join(", ");
      throw new BadRequestException(`Allocation exceeds pen capacity: ${details}.`);
    }

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
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      PLANNED: ["ACTIVE", "CULLED"],
      ACTIVE: ["TRANSFERRED", "CLOSED", "SOLD", "CULLED"],
      TRANSFERRED: ["CLOSED", "SOLD", "CULLED"],
      CLOSED: ["SOLD"],
      SOLD: [],
      CULLED: []
    };
    const allowed = ALLOWED_TRANSITIONS[batch.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition a batch from ${batch.status} to ${dto.status}.${allowed.length ? ` Allowed: ${allowed.join(", ")}.` : " This status is terminal."}`);
    }
    // H-BUG-2 (2026-08-13): withdrawalUntil was captured on every medication
    // record and shown as a passive reminder, but nothing ever actually
    // stopped a batch from being marked SOLD while still inside that
    // withdrawal window — the whole point of the field is food safety
    // (residue hasn't cleared the birds yet), not just record-keeping.
    if (dto.status === "SOLD") {
      await this.assertNoActiveWithdrawal(id, user.companyId, "cannot mark it SOLD until the withdrawal period has passed");
    }
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

    // Low (DB stability audit, 2026-08-16): non-blocking by design (a
    // profitability snapshot failure shouldn't fail the status update that
    // already succeeded), but this used to swallow the error completely —
    // logged now so a persistent failure is at least discoverable.
    if (["CLOSED", "SOLD", "CULLED"].includes(dto.status)) {
      void this.snapshotBatchProfitability(user, id).catch((err) =>
        this.logger.error(`Batch profitability snapshot failed for flock batch ${id}: ${err instanceof Error ? err.message : err}`)
      );
    }
    return { data };
  }

  async getDailyRecordPrefill(user: AuthenticatedUser, flockBatchId: string, date: string) {
    const batch = await this.getBatchContext(user, flockBatchId);
    const targetDate = new Date(date);
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);

    const prev = await this.prisma.dailyPoultryRecord.findFirst({
      where: { companyId: user.companyId, flockBatchId: batch.id, recordDate: prevDate },
      select: { openingBirdCount: true, mortalityCount: true, culledCount: true },
    });

    if (prev) {
      const closing = Math.max(0, (prev.openingBirdCount ?? 0) - (prev.mortalityCount ?? 0) - (prev.culledCount ?? 0));
      return { data: { openingBirdCount: closing, source: "previous_day" } };
    }

    // Fall back to the batch's live-bird count: opening count minus all
    // mortality/culling AND minus birds transferred out so far (2026-08-18 —
    // this used to ignore transfers entirely, so a batch that had already
    // moved part of its flock elsewhere still prefilled today's opening
    // count as if every bird it started with were still physically present).
    const fallback = await this.liveBirdsRemaining(this.prisma, batch.id, batch.openingBirdCount);
    return { data: { openingBirdCount: fallback, source: "batch_total" } };
  }

  // H-BUG-2 (2026-08-12): this used to only ever write the DailyPoultryRecord
  // row itself — the mortality/culled/feed/egg numbers it collects (the
  // mobile app's "Daily Poultry Record" screen presents this as THE way to
  // log a day's mortality, culling, feed, and eggs) never touched the real
  // MortalityRecord/FeedConsumptionRecord/EggProductionRecord tables, so the
  // flock's live-bird count, feed stock, and egg stock never moved even
  // though the screen reported success. Now applies the real effects.
  //
  // Because this record is upserted (same batch+pen+date resubmits update
  // the same row rather than creating a new one — see the existing-lookup
  // below), a naive "create a MortalityRecord for dto.mortalityCount every
  // submit" would double-count every time someone re-opens today's record
  // to add a later entry. Instead, effects are applied for the DELTA versus
  // what was already saved for this row (0 the first time). An increase is
  // real news ("3 more died since this morning") and gets its own linked
  // record; a decrease has no honest real-world meaning here (birds can't
  // un-die, and feed/eggs already recorded can't un-happen) — that's a
  // correction, and corrections belong in the dedicated Mortality/Feed/Egg
  // screens (which already have safe, audited update flows), not here.
  async createDailyRecord(user: AuthenticatedUser, dto: CreateDailyPoultryRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (dto.feedWarehouseId) this.assertWarehouseAccess(user, dto.feedWarehouseId);
    if (dto.eggWarehouseId) this.assertWarehouseAccess(user, dto.eggWarehouseId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    const recordDate = new Date(dto.recordDate);
    const payload = { openingBirdCount: dto.openingBirdCount, mortalityCount: dto.mortalityCount, culledCount: dto.culledCount, feedConsumedKg: dto.feedConsumedKg, totalEggs: dto.totalEggs, notes: dto.notes, status: dto.status ?? "SUBMITTED" };
    const existing = await this.prisma.dailyPoultryRecord.findFirst({
      where: { companyId: user.companyId, flockBatchId: batch.id, penId: dto.penId ?? null, recordDate }
    });

    const mortalityDelta = (dto.mortalityCount ?? 0) - (existing?.mortalityCount ?? 0);
    const culledDelta = (dto.culledCount ?? 0) - (existing?.culledCount ?? 0);
    const feedDelta = (dto.feedConsumedKg ?? 0) - Number(existing?.feedConsumedKg ?? 0);
    const eggsDelta = (dto.totalEggs ?? 0) - (existing?.totalEggs ?? 0);
    if (mortalityDelta < 0 || culledDelta < 0 || feedDelta < 0 || eggsDelta < 0) {
      throw new BadRequestException("Today's mortality, culled, feed, or egg numbers can't be reduced from this screen — use the Mortality, Feed, or Egg Production screens to correct an entry already recorded.");
    }
    // (2026-08-18) A feed/egg delta always creates a real FeedConsumptionRecord/
    // EggProductionRecord now, same as mortality/culled always create a real
    // MortalityRecord — previously the delta only ever moved inventory (via
    // consumeInventoryTx/addToInventoryTx) and, if no product/warehouse was
    // given, did nothing at all beyond this row. Either way the number never
    // showed up on the dedicated Feed/Egg pages or in the batch's
    // totalFeedKg/totalEggs metrics, which read those tables, not this one.
    // Crediting/deducting real stock from the new record is still optional,
    // matching createFeed/createEggs's own optional product+warehouse fields.
    if (eggsDelta > 0 && !["LAYERS", "BREEDERS"].includes(batch.birdType)) {
      throw new BadRequestException(`Egg production cannot be recorded for a ${batch.birdType} batch. Only LAYERS and BREEDERS batches produce eggs.`);
    }
    if (eggsDelta > 0 && dto.eggProductId && dto.eggWarehouseId) {
      await this.assertNoActiveWithdrawal(dto.flockBatchId, user.companyId, "eggs collected during this window can still be logged, but omit the egg product/warehouse to record them without crediting sellable stock");
    }

    // High (DB stability audit, 2026-08-16): consumeInventoryTx locks
    // InventoryItem before StockBatch, opposite the order used by
    // inventory.service.ts's own FIFO consumption — a concurrent call
    // through the other path can deadlock. Retrying (instead of a raw 500)
    // is the mitigation; the real lock-order fix is a separate follow-up.
    const record = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.dailyPoultryRecord.update({ where: { id: existing.id }, data: { ...payload, updatedById: user.id } })
        : await tx.dailyPoultryRecord.create({ data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate, ...payload } });

      // Same row-lock + live-bird-floor pattern as createMortality — held for
      // the rest of this transaction so the culled check below sees the
      // mortality insert above it.
      if (mortalityDelta > 0 || culledDelta > 0) {
        await tx.$queryRaw`SELECT id FROM FlockBatch WHERE id = ${batch.id} FOR UPDATE`;
      }
      if (mortalityDelta > 0) {
        const liveBirds = await this.liveBirdsRemaining(tx, batch.id, batch.openingBirdCount);
        if (mortalityDelta > liveBirds) throw new BadRequestException(`Cannot record ${mortalityDelta} more mortalit${mortalityDelta !== 1 ? "ies" : "y"}. Only ${liveBirds} live bird${liveBirds !== 1 ? "s" : ""} remain in this batch.`);
        await tx.mortalityRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate, birdCount: mortalityDelta, isCulling: false, reason: "Daily record", status: "SUBMITTED" }
        });
      }
      if (culledDelta > 0) {
        const liveBirds = await this.liveBirdsRemaining(tx, batch.id, batch.openingBirdCount);
        if (culledDelta > liveBirds) throw new BadRequestException(`Cannot record ${culledDelta} more culled. Only ${liveBirds} live bird${liveBirds !== 1 ? "s" : ""} remain in this batch.`);
        await tx.mortalityRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate, birdCount: culledDelta, isCulling: true, reason: "Daily record", status: "SUBMITTED" }
        });
      }
      if (feedDelta > 0) {
        const feedRecord = await tx.feedConsumptionRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate, feedProductId: dto.feedProductId, warehouseId: dto.feedWarehouseId, quantityKg: feedDelta, notes: "Daily record", status: "SUBMITTED" }
        });
        if (dto.feedProductId && dto.feedWarehouseId) {
          await this.consumeInventoryTx(tx, user, batch, dto.feedWarehouseId, dto.feedProductId, feedDelta, "PRODUCTION_INPUT", "FeedConsumptionRecord", feedRecord.id, `Feed consumption from daily record for flock ${batch.code}`);
        }
      }
      if (eggsDelta > 0) {
        const eggRecord = await tx.eggProductionRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate, goodEggs: eggsDelta, notes: "Daily record", status: "SUBMITTED" }
        });
        if (dto.eggProductId && dto.eggWarehouseId) {
          await this.addToInventoryTx(tx, user, batch, dto.eggWarehouseId, dto.eggProductId, eggsDelta, "EggProductionRecord", eggRecord.id, `Egg production from daily record for flock ${batch.code}`);
        }
      }
      return row;
    }), { label: "PoultryService.upsertDailyRecord" });
    await this.writeAudit(user, "CREATE", "DailyPoultryRecord", record.id, "Submitted daily poultry record", context, batch.farmId);
    const overlapWarnings = (await Promise.all([
      mortalityDelta > 0 ? this.dedicatedMortalityOverlapWarning(user.companyId, batch.id, recordDate, false) : Promise.resolve(undefined),
      culledDelta > 0 ? this.dedicatedMortalityOverlapWarning(user.companyId, batch.id, recordDate, true) : Promise.resolve(undefined),
      feedDelta > 0 ? this.dedicatedFeedOverlapWarning(user.companyId, batch.id, recordDate) : Promise.resolve(undefined),
      eggsDelta > 0 ? this.dedicatedEggsOverlapWarning(user.companyId, batch.id, recordDate) : Promise.resolve(undefined)
    ])).filter((w): w is string => !!w);
    return { data: record, warning: overlapWarnings.join(" ") || undefined };
  }

  async createMortality(user: AuthenticatedUser, dto: CreateMortalityRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findMortalityByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let data;
    try {
      data = await this.prisma.$transaction(async (tx) => {
        // H5: lock the FlockBatch row for the transaction's lifetime so two
        // concurrent mortality entries for the same batch can't both read the
        // same live-bird snapshot and both pass the check — the second waits
        // for the first to commit, then its own aggregate includes it.
        await tx.$queryRaw`SELECT id FROM FlockBatch WHERE id = ${batch.id} FOR UPDATE`;
        const liveBirds = await this.liveBirdsRemaining(tx, batch.id, batch.openingBirdCount);
        if (dto.birdCount > liveBirds) throw new BadRequestException(`Cannot record ${dto.birdCount} bird${dto.birdCount !== 1 ? "s" : ""}. Only ${liveBirds} live bird${liveBirds !== 1 ? "s" : ""} remain in this batch.`);
        return tx.mortalityRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), birdCount: dto.birdCount, isCulling: dto.isCulling ?? false, reason: dto.reason, notes: dto.notes, status: dto.status ?? "SUBMITTED", idempotencyKey: dto.idempotencyKey }
        });
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findMortalityByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "MortalityRecord", data.id, dto.isCulling ? "Recorded poultry culling" : "Recorded poultry mortality", context, batch.farmId);
    const warning = await this.dailyRecordOverlapWarning(user.companyId, batch.id, new Date(dto.recordDate), dto.isCulling ? "culledCount" : "mortalityCount", dto.isCulling ? "culled" : "mortality");
    return { data, warning };
  }

  async createFeed(user: AuthenticatedUser, dto: CreateFeedConsumptionRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (dto.warehouseId) this.assertWarehouseAccess(user, dto.warehouseId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findFeedByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let stockWarning: string | undefined;
    let data;
    try {
      // High (DB stability audit, 2026-08-16): consumeInventoryTx's lock order
      // conflicts with inventory.service.ts's FIFO path — retry mitigates the
      // resulting deadlock risk until the lock order is reconciled.
      data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
        const record = await tx.feedConsumptionRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), feedProductId: dto.feedProductId, warehouseId: dto.warehouseId, quantityKg: dto.quantityKg, costAmount: dto.costAmount, notes: dto.notes, status: dto.status ?? "SUBMITTED", idempotencyKey: dto.idempotencyKey }
        });
        if (dto.feedProductId && dto.warehouseId) {
          // M-BUG (2026-08-13): a mismatch between this warehouse and the one
          // the product's actually stocked in used to fail completely
          // silently — the record saved as if stock was deducted, with
          // nothing telling the person who entered it that it wasn't.
          const result = await this.consumeInventoryTx(tx, user, batch, dto.warehouseId, dto.feedProductId, dto.quantityKg, "PRODUCTION_INPUT", "FeedConsumptionRecord", record.id, `Feed consumption for flock ${batch.code}`);
          stockWarning = result.warning;
        }
        return record;
      }), { label: "PoultryService.createFeed" });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findFeedByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "FeedConsumptionRecord", data.id, "Recorded poultry feed consumption", context, batch.farmId);
    const overlapWarning = await this.dailyRecordOverlapWarning(user.companyId, batch.id, new Date(dto.recordDate), "feedConsumedKg", "kg feed");
    return { data, warning: [stockWarning, overlapWarning].filter(Boolean).join(" ") || undefined };
  }

  async createEggs(user: AuthenticatedUser, dto: CreateEggProductionRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (!["LAYERS", "BREEDERS"].includes(batch.birdType)) {
      throw new BadRequestException(`Egg production cannot be recorded for a ${batch.birdType} batch. Only LAYERS and BREEDERS batches produce eggs.`);
    }
    // Previously missing — unlike createFeed/createMedication/createVaccination,
    // this credited inventory to dto.warehouseId with no access check, letting
    // a user credit egg output to a warehouse outside their assignment.
    if (dto.warehouseId) this.assertWarehouseAccess(user, dto.warehouseId);
    // H-BUG-2 (2026-08-13): a batch inside an active medication withdrawal
    // window shouldn't have its eggs credited to sellable stock — residue
    // hasn't cleared yet. The raw count can still be logged for
    // record-keeping (omit product/warehouse), only the stock-crediting
    // path is blocked.
    if (dto.eggProductId && dto.warehouseId && dto.goodEggs > 0) {
      await this.assertNoActiveWithdrawal(dto.flockBatchId, user.companyId, "eggs collected during this window can still be logged, but omit the product/warehouse to record them without crediting sellable stock");
    }
    // M-BUG (2026-08-13): no sanity check that this flock is old enough to
    // plausibly be laying — a wrong-batch data-entry mistake (an obvious
    // error to a person looking at it) went through unquestioned. Can't
    // know for sure whether birds arrived as day-olds or already-point-of-
    // lay pullets, so this warns rather than blocks — 16 weeks is a
    // generously early floor even for day-old-reared layers.
    const rawBatch = batch as unknown as { startDate?: Date | string };
    let ageWarning: string | undefined;
    if (batch.birdType === "LAYERS" && rawBatch.startDate) {
      const daysSinceStart = (new Date(dto.recordDate).getTime() - new Date(rawBatch.startDate).getTime()) / 86400000;
      if (daysSinceStart < 112) {
        ageWarning = `This flock started ${Math.max(Math.floor(daysSinceStart), 0)} day(s) ago — layers don't typically begin laying until ~16 weeks. Please confirm this is the right batch.`;
      }
    }
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findEggsByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let stockWarning: string | undefined;
    let data;
    try {
      data = await this.prisma.$transaction(async (tx) => {
        const record = await tx.eggProductionRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), goodEggs: dto.goodEggs, crackedEggs: dto.crackedEggs, dirtyEggs: dto.dirtyEggs, brokenEggs: dto.brokenEggs, rejectedEggs: dto.rejectedEggs, notes: dto.notes, status: dto.status ?? "SUBMITTED", idempotencyKey: dto.idempotencyKey }
        });
        if (dto.eggProductId && dto.warehouseId && dto.goodEggs > 0) {
          await this.addToInventoryTx(tx, user, batch, dto.warehouseId, dto.eggProductId, dto.goodEggs, "EggProductionRecord", record.id, `Egg production from flock ${batch.code}`);
        }
        // M-BUG (2026-08-13): only goodEggs could ever become sellable stock —
        // cracked/dirty eggs (commonly sold at a discount as "seconds" on real
        // farms) had no way to be sold through the system at all.
        const seconds = dto.crackedEggs + dto.dirtyEggs;
        if (dto.secondsProductId && dto.warehouseId && seconds > 0) {
          await this.addToInventoryTx(tx, user, batch, dto.warehouseId, dto.secondsProductId, seconds, "EggProductionRecord", record.id, `Seconds (cracked/dirty) eggs from flock ${batch.code}`);
        } else if (seconds > 0 && !dto.secondsProductId) {
          stockWarning = `${seconds} cracked/dirty egg(s) were recorded but not credited to sellable stock — set a "seconds" product to sell them at a discount.`;
        }
        return record;
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findEggsByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "EggProductionRecord", data.id, "Recorded egg production", context, batch.farmId);
    const overlapWarning = await this.dailyRecordOverlapWarning(user.companyId, batch.id, new Date(dto.recordDate), "totalEggs", "eggs");
    const warning = [ageWarning, stockWarning, overlapWarning].filter(Boolean).join(" ") || undefined;
    return { data, warning };
  }

  async createWeight(user: AuthenticatedUser, dto: CreateBirdWeightRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findWeightByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let data;
    try {
      data = await this.prisma.birdWeightRecord.create({
        data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), recordDate: new Date(dto.recordDate), sampleSize: dto.sampleSize, averageWeightKg: dto.averageWeightKg, notes: dto.notes, status: dto.status ?? "SUBMITTED", idempotencyKey: dto.idempotencyKey }
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findWeightByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "BirdWeightRecord", data.id, "Recorded bird weight", context, batch.farmId);
    return { data };
  }

  async createMedication(user: AuthenticatedUser, dto: CreateMedicationRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (dto.warehouseId) this.assertWarehouseAccess(user, dto.warehouseId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findMedicationByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let stockWarning: string | undefined;
    let data;
    try {
      // High (DB stability audit, 2026-08-16): see createFeed above — same
      // consumeInventoryTx lock-order deadlock risk, mitigated with retry.
      data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
        const record = await tx.medicationRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), medicationName: dto.medicationName, dosage: dto.dosage, route: dto.route, startDate: new Date(dto.startDate), endDate: dto.endDate ? new Date(dto.endDate) : undefined, withdrawalUntil: dto.withdrawalUntil ? new Date(dto.withdrawalUntil) : undefined, notes: dto.notes, idempotencyKey: dto.idempotencyKey }
        });
        if (dto.medicineProductId && dto.warehouseId && dto.quantityUsed) {
          const result = await this.consumeInventoryTx(tx, user, batch, dto.warehouseId, dto.medicineProductId, dto.quantityUsed, "PRODUCTION_INPUT", "MedicationRecord", record.id, `Medication (${dto.medicationName}) for flock ${batch.code}`);
          stockWarning = result.warning;
        }
        return record;
      }), { label: "PoultryService.createMedication" });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findMedicationByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "MedicationRecord", data.id, "Recorded poultry medication", context, batch.farmId);
    return { data, warning: stockWarning };
  }

  async createVaccination(user: AuthenticatedUser, dto: CreateVaccinationRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    if (dto.warehouseId) this.assertWarehouseAccess(user, dto.warehouseId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findVaccinationByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let stockWarning: string | undefined;
    let data;
    try {
      // High (DB stability audit, 2026-08-16): see createFeed above — same
      // consumeInventoryTx lock-order deadlock risk, mitigated with retry.
      data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
        const record = await tx.vaccinationRecord.create({
          data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), vaccineName: dto.vaccineName, dose: dto.dose, vaccinationDate: new Date(dto.vaccinationDate), nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined, notes: dto.notes, idempotencyKey: dto.idempotencyKey }
        });
        if (dto.vaccineProductId && dto.warehouseId && dto.quantityUsed) {
          const result = await this.consumeInventoryTx(tx, user, batch, dto.warehouseId, dto.vaccineProductId, dto.quantityUsed, "PRODUCTION_INPUT", "VaccinationRecord", record.id, `Vaccination (${dto.vaccineName}) for flock ${batch.code}`);
          stockWarning = result.warning;
        }
        return record;
      }), { label: "PoultryService.createVaccination" });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findVaccinationByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
    await this.writeAudit(user, "CREATE", "VaccinationRecord", data.id, "Recorded poultry vaccination", context, batch.farmId);
    return { data, warning: stockWarning };
  }

  async createHealthObservation(user: AuthenticatedUser, dto: CreateHealthObservationDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const penHouseId = await this.resolvePenHouseId(user.companyId, dto.penId, batch);
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findHealthObservationByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let data;
    try {
      data = await this.prisma.poultryHealthObservation.create({
        data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), observationDate: new Date(dto.observationDate), severity: dto.severity, observation: dto.observation, vetVisitDate: dto.vetVisitDate ? new Date(dto.vetVisitDate) : undefined, veterinarianName: dto.veterinarianName, recommendation: dto.recommendation, idempotencyKey: dto.idempotencyKey }
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findHealthObservationByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
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
    const fromPen = dto.fromPenId ? await this.prisma.pen.findFirst({ where: { id: dto.fromPenId, companyId: user.companyId, deletedAt: null } }) : null;
    const fromHouseId = fromPen?.poultryHouseId ?? dto.fromPoultryHouseId ?? batch.poultryHouseId;
    if (!fromHouseId) throw new BadRequestException("Cannot determine source house. Specify a fromPenId or fromPoultryHouseId.");

    const data = await this.prisma.$transaction(async (tx) => {
      // H5: lock the FlockBatch row for the transaction's lifetime — the
      // availability checks below used to run as plain reads before this
      // transaction opened, so two concurrent transfers (or a transfer
      // racing a mortality entry) for the same batch/pen could both read
      // the same available-bird snapshot and both pass. The second call now
      // waits for the first to commit, then its own aggregate includes it.
      await tx.$queryRaw`SELECT id FROM FlockBatch WHERE id = ${batch.id} FOR UPDATE`;

      // Set below only for a batch-level (no fromPenId) transfer that moves
      // every remaining live bird — stamped onto the transfer row so
      // currentLiveBirds/liveBirdsRemaining know not to treat it as birds
      // that left the batch (see the schema comment on this column).
      let isFullBatchRelocation = false;

      if (dto.fromPenId) {
        const fromAlloc = await tx.batchPenAllocation.findFirst({ where: { flockBatchId: batch.id, penId: dto.fromPenId } });
        if (!fromAlloc) throw new BadRequestException("Source pen is not allocated to this batch.");
        const [outgoing, penMortality] = await Promise.all([
          tx.poultryTransferRecord.aggregate({ where: { flockBatchId: batch.id, fromPenId: dto.fromPenId, deletedAt: null }, _sum: { birdCount: true } }),
          tx.mortalityRecord.aggregate({ where: { flockBatchId: batch.id, penId: dto.fromPenId, deletedAt: null }, _sum: { birdCount: true } })
        ]);
        const available = fromAlloc.birdCount - (outgoing._sum.birdCount ?? 0) - (penMortality._sum.birdCount ?? 0);
        if (dto.birdCount > available) {
          throw new BadRequestException(`Source pen only has ${available} birds available. Cannot transfer ${dto.birdCount}.`);
        }
      } else {
        const liveBirds = await this.liveBirdsRemaining(tx, batch.id, batch.openingBirdCount);
        if (dto.birdCount > liveBirds) throw new BadRequestException(`Cannot transfer ${dto.birdCount} birds. Only ${liveBirds} live birds remain in this batch.`);
        // M-BUG (2026-08-13): a whole-flock, batch-level transfer (not
        // scoped to one pen) updated the transfer paperwork but never the
        // batch's own farmId/poultryHouseId — access checks throughout
        // this service gate on FlockBatch.farmId, so staff scoped only to
        // the destination farm could find themselves unable to log
        // anything further for a flock that's physically now theirs. Only
        // reassign when the ENTIRE remaining flock moves — a partial
        // transfer legitimately leaves birds (and the batch's home) behind.
        if (dto.birdCount === liveBirds && liveBirds > 0) {
          isFullBatchRelocation = true;
          await tx.flockBatch.update({ where: { id: batch.id }, data: { farmId: dto.toFarmId, poultryHouseId: dto.toPoultryHouseId, updatedById: user.id } });
        }
      }

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
          isFullBatchRelocation,
          transferDate: new Date(dto.transferDate),
          reason: dto.reason,
          createdById: user.id
        }
      });

      if (dto.toPenId) {
        // (M18) Nothing previously checked the destination pen's physical
        // capacity — a transfer of any size into any pen was accepted, which
        // could silently push a pen's bird count past what it can actually
        // hold. capacity is nullable, so a pen with none recorded has no cap.
        const [toPen, toAlloc] = await Promise.all([
          tx.pen.findFirst({ where: { id: dto.toPenId, companyId: user.companyId, deletedAt: null } }),
          tx.batchPenAllocation.findFirst({ where: { flockBatchId: batch.id, penId: dto.toPenId } })
        ]);
        if (!toPen) throw new BadRequestException("Destination pen was not found.");
        if (toPen.capacity != null) {
          const newTotal = (toAlloc?.birdCount ?? 0) + dto.birdCount;
          if (newTotal > toPen.capacity) {
            throw new BadRequestException(`Destination pen ${toPen.code} capacity is ${toPen.capacity}; this transfer would bring it to ${newTotal}.`);
          }
        }

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

    const pen = await this.prisma.pen.findFirst({ where: { id: dto.penId, companyId: user.companyId, deletedAt: null } });
    if (!pen) throw new NotFoundException("Pen not found.");
    if (pen.poultryHouseId !== transfer.toPoultryHouseId) throw new BadRequestException("Pen does not belong to the transfer's destination house.");

    const house = await this.prisma.poultryHouse.findFirst({ where: { id: transfer.toPoultryHouseId!, companyId: user.companyId, deletedAt: null } });
    // Previously missing entirely — a user scoped to Farm A could allocate a
    // pen (and increment live bird counts) for a transfer whose destination
    // farm is Farm B, which they have no access to.
    if (house) this.assertFarmAccess(user, house.farmId);

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
    // Mobile parity audit (2026-08-17): a mobile offline-queue resend (or a
    // client retry after a dropped response) carrying the same
    // idempotencyKey replays the original record instead of creating a
    // duplicate — mirrors sales.service.ts's createOrder.
    if (dto.idempotencyKey) {
      const existing = await this.findCostByIdempotencyKey(user.companyId, dto.idempotencyKey);
      if (existing) return { data: existing };
    }
    let data;
    try {
      data = await this.prisma.poultryCostRecord.create({
        data: { ...this.batchRecordBase(user, batch, penHouseId, dto.penId), costDate: new Date(dto.costDate), costType: dto.costType, amount: dto.amount, description: dto.description, status: dto.status ?? "SUBMITTED", idempotencyKey: dto.idempotencyKey }
      });
    } catch (err: unknown) {
      if (dto.idempotencyKey && (err as { code?: string })?.code === "P2002") {
        const existing = await this.findCostByIdempotencyKey(user.companyId, dto.idempotencyKey);
        if (existing) return { data: existing };
      }
      throw err;
    }
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
        const alloc = await tx.batchPenAllocation.findUnique({ where: { flockBatchId_penId: { flockBatchId: existing.flockBatchId, penId: existing.toPenId } } });
        if (alloc) {
          await tx.batchPenAllocation.update({
            where: { flockBatchId_penId: { flockBatchId: existing.flockBatchId, penId: existing.toPenId } },
            data: { birdCount: Math.max(0, alloc.birdCount - existing.birdCount) }
          });
        }
        return deleted;
      });
      this.lookupCache.invalidate(`poultry:opts:${user.companyId}`);
    } else if (INVENTORY_LINKED_RECORD_TYPES[type]) {
      // H-BUG-2 follow-up (2026-08-13): feed/medication/vaccination/egg
      // deletes used to just soft-delete the record with zero inventory
      // reversal — a deleted feed-consumption entry left the stock it
      // consumed gone forever, and a deleted egg-production entry left
      // phantom stock in the system that was never actually produced.
      // These record types have no stored productId/warehouseId/quantity
      // of their own (only carried transiently through the DTO at create
      // time), so the reversal reads the actual StockMovement ledger
      // entry the create call wrote — the one durable record of what
      // moved and where.
      const modelKey = ({ feed: "feedConsumptionRecord", eggs: "eggProductionRecord", medications: "medicationRecord", vaccinations: "vaccinationRecord" } as Record<string, string>)[type];
      const referenceType = INVENTORY_LINKED_RECORD_TYPES[type];
      data = await this.prisma.$transaction(async (tx) => {
        await this.reverseInventoryForRecordTx(tx, user, referenceType, id, farmId, existing.branchId);
        return (tx[modelKey as keyof typeof tx] as { update: (args: unknown) => Promise<unknown> }).update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
      });
    } else {
      data = await model.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    }
    await this.writeAudit(user, "DELETE", type, id, `Deleted poultry ${type} record`, context, farmId);
    return { data };
  }

  private async reverseInventoryForRecordTx(tx: Prisma.TransactionClient, user: AuthenticatedUser, referenceType: string, referenceId: string, farmId: string, branchId: string) {
    const movements = await tx.stockMovement.findMany({ where: { companyId: user.companyId, referenceType, referenceId, deletedAt: null } });
    for (const mv of movements) {
      const warehouseId = mv.warehouseId;
      if (!warehouseId) continue;
      const quantity = Number(mv.quantity);
      const item = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId, productId: mv.productId, deletedAt: null } });
      if (!item) continue; // nothing left to reverse against if the item itself is gone

      if (mv.movementType === "PRODUCTION_INPUT") {
        // Reversing a consumption (feed/medication/vaccine): give the quantity back.
        await tx.inventoryItem.update({ where: { id: item.id }, data: { quantityOnHand: { increment: quantity }, updatedById: user.id } });
        await tx.stockBatch.create({
          data: {
            companyId: user.companyId, branchId, farmId, warehouseId, productId: mv.productId,
            inventoryItemId: item.id, uomId: mv.uomId, batchNumber: `ADJ-${referenceId.slice(0, 8).toUpperCase()}`,
            quantityReceived: quantity, quantityRemaining: quantity, manufactureDate: new Date(), createdById: user.id
          }
        });
        await tx.stockMovement.create({
          data: { companyId: user.companyId, branchId, productId: mv.productId, inventoryItemId: item.id, toWarehouseId: warehouseId, warehouseId, farmId, uomId: mv.uomId, movementType: "ADJUSTMENT_IN", quantity, referenceType, referenceId, notes: `Reversal — ${referenceType} record deleted`, createdById: user.id }
        });
      } else if (mv.movementType === "PRODUCTION_OUTPUT") {
        // Reversing a production credit (eggs): pull it back out,
        // floor-guarded and FIFO across whatever lots are still available —
        // if it's already been partly consumed elsewhere, block the delete
        // rather than drive stock negative.
        const guarded = await tx.inventoryItem.updateMany({
          where: { id: item.id, quantityOnHand: { gte: quantity } },
          data: { quantityOnHand: { decrement: quantity }, updatedById: user.id }
        });
        if (guarded.count === 0) {
          throw new BadRequestException("Cannot delete this record — the stock it credited has already been partly or fully consumed elsewhere.");
        }
        let remaining = quantity;
        const lots = await tx.stockBatch.findMany({
          where: { companyId: user.companyId, warehouseId, productId: mv.productId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
          orderBy: { createdAt: "asc" }
        });
        for (const lot of lots) {
          if (remaining <= 0) break;
          const consumed = Math.min(remaining, Number(lot.quantityRemaining));
          const lotUpdate = await tx.stockBatch.updateMany({ where: { id: lot.id, quantityRemaining: { gte: consumed } }, data: { quantityRemaining: { decrement: consumed } } });
          if (lotUpdate.count === 0) {
            throw new BadRequestException("Stock batch for this product was consumed concurrently. Please retry.");
          }
          remaining -= consumed;
        }
        if (remaining > 0) {
          throw new BadRequestException("Cannot delete this record — the stock it credited has already been partly or fully consumed elsewhere.");
        }
        await tx.stockMovement.create({
          data: { companyId: user.companyId, branchId, productId: mv.productId, inventoryItemId: item.id, fromWarehouseId: warehouseId, warehouseId, farmId, uomId: mv.uomId, movementType: "ADJUSTMENT_OUT", quantity, referenceType, referenceId, notes: `Reversal — ${referenceType} record deleted`, createdById: user.id }
        });
      }
    }
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

    // H-BUG-3 (2026-08-12, from the inventory-integration logic audit): the
    // record update and its inventory adjustment used to be two separate,
    // un-transacted writes, and the inventory side used a plain `update`
    // with no floor guard — unlike every other place in the codebase that
    // decrements InventoryItem.quantityOnHand. A correction that increases
    // a feed record's recorded quantityKg (delta > 0, meaning more was
    // actually consumed than first logged) decrements inventory further;
    // under concurrent consumption of the same item that could drive
    // quantityOnHand negative with nothing to catch it, and a crash between
    // the two writes could leave the record corrected but inventory
    // unadjusted (or vice versa).
    // High (DB stability audit, 2026-08-16): this correction path locks
    // InventoryItem before StockBatch (same order as consumeInventoryTx),
    // conflicting with FIFO consumers that lock the opposite way — retry
    // mitigates the deadlock risk until the lock order is reconciled.
    const data = await withDbRetry(() => this.prisma.$transaction(async (tx) => {
      // Same type→model mapping as recordModel(), just resolved against `tx`
      // instead of `this.prisma` so the record update lands in the same
      // transaction as the inventory adjustment below.
      const modelKey = ({
        daily: "dailyPoultryRecord", mortality: "mortalityRecord", feed: "feedConsumptionRecord",
        eggs: "eggProductionRecord", weights: "birdWeightRecord", medications: "medicationRecord",
        vaccinations: "vaccinationRecord", health: "poultryHealthObservation",
        transfers: "poultryTransferRecord", costs: "poultryCostRecord"
      } as Record<string, string>)[type];

      // M-BUG (2026-08-13): recording a death for the first time
      // (createMortality) locks the batch row and refuses to let the live
      // count go negative — correcting an existing entry did neither, so an
      // implausible correction just silently floored to zero live birds
      // with no warning anything was off. Mirrors createMortality's own
      // lock-then-check exactly, applied to the delta versus what this
      // record already contributed to the aggregate.
      if (type === "mortality" && updateData.birdCount !== undefined) {
        const mortality = existing as { birdCount: number; flockBatchId: string };
        const newCount = Number(updateData.birdCount);
        if (newCount < 0) throw new BadRequestException("Bird count cannot be negative.");
        if (newCount !== mortality.birdCount) {
          await tx.$queryRaw`SELECT id FROM FlockBatch WHERE id = ${mortality.flockBatchId} FOR UPDATE`;
          const batch = await tx.flockBatch.findFirstOrThrow({ where: { id: mortality.flockBatchId }, select: { openingBirdCount: true } });
          const liveBirdsExcludingThisRecord = await this.liveBirdsRemaining(tx, mortality.flockBatchId, batch.openingBirdCount, id);
          if (newCount > liveBirdsExcludingThisRecord) {
            throw new BadRequestException(`Cannot correct this entry to ${newCount}. Only ${liveBirdsExcludingThisRecord} live bird(s) would remain available in this batch.`);
          }
        }
      }

      const updated = await (tx[modelKey as keyof typeof tx] as { update: (args: unknown) => Promise<unknown> }).update({ where: { id }, data: updateData });

      if (type === "feed" && updateData.quantityKg !== undefined) {
        const feed = existing as { feedProductId?: string | null; warehouseId?: string | null; quantityKg: number };
        if (feed.feedProductId && feed.warehouseId) {
          const delta = Number(updateData.quantityKg) - Number(feed.quantityKg);
          if (delta !== 0) {
            const invItem = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: feed.warehouseId, productId: feed.feedProductId, deletedAt: null } });
            if (invItem) {
              if (delta > 0) {
                // Lock order (DB stability audit, 2026-08-16): StockBatch
                // lots first, then InventoryItem — see consumeInventoryTx
                // above for why.
                let remaining = delta;
                const lots = await tx.stockBatch.findMany({
                  where: { companyId: user.companyId, warehouseId: feed.warehouseId, productId: feed.feedProductId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
                  orderBy: { createdAt: "asc" }
                });
                for (const lot of lots) {
                  if (remaining <= 0) break;
                  const consumed = Math.min(remaining, Number(lot.quantityRemaining));
                  const lotUpdate = await tx.stockBatch.updateMany({
                    where: { id: lot.id, quantityRemaining: { gte: consumed } },
                    data: { quantityRemaining: { decrement: consumed } }
                  });
                  if (lotUpdate.count === 0) {
                    throw new BadRequestException("Stock batch for this product was consumed concurrently. Please retry.");
                  }
                  remaining -= consumed;
                }
                if (remaining > 0) {
                  throw new BadRequestException(`Stock batches on hand cover only ${(delta - remaining).toFixed(2)} of the ${delta} needed for this correction — inventory and lot records are out of sync, or the remaining stock is quarantined. Please investigate before retrying.`);
                }
                const guarded = await tx.inventoryItem.updateMany({
                  where: { id: invItem.id, quantityOnHand: { gte: delta } },
                  data: { quantityOnHand: { decrement: delta }, updatedById: user.id }
                });
                if (guarded.count === 0) {
                  throw new BadRequestException("Cannot apply this correction — insufficient stock remains to cover the increased quantity. Please investigate before retrying.");
                }
              } else {
                await tx.inventoryItem.update({ where: { id: invItem.id }, data: { quantityOnHand: { increment: -delta }, updatedById: user.id } });
                // Giving stock back has no single lot to credit (the original
                // consumption may have drawn FIFO across several) — same
                // convention as inventory.service.ts's positive stock
                // adjustments: land it as a new, separately traceable lot
                // rather than guessing which existing lot to restore.
                await tx.stockBatch.create({
                  data: {
                    companyId: user.companyId,
                    branchId: invItem.branchId,
                    farmId: invItem.farmId,
                    warehouseId: feed.warehouseId,
                    productId: feed.feedProductId,
                    inventoryItemId: invItem.id,
                    uomId: invItem.uomId,
                    batchNumber: `ADJ-${id.slice(0, 8).toUpperCase()}`,
                    quantityReceived: -delta,
                    quantityRemaining: -delta,
                    manufactureDate: new Date(),
                    createdById: user.id
                  }
                });
              }
              await tx.stockMovement.create({ data: { companyId: user.companyId, branchId: invItem.branchId, productId: feed.feedProductId, inventoryItemId: invItem.id, fromWarehouseId: feed.warehouseId, warehouseId: feed.warehouseId, uomId: invItem.uomId, movementType: delta > 0 ? "PRODUCTION_INPUT" : "ADJUSTMENT_IN", quantity: Math.abs(delta), referenceType: "FeedConsumptionRecord", referenceId: id, notes: "Feed quantity correction", createdById: user.id } });
            }
          }
        }
      }

      // H-BUG-2 follow-up (2026-08-13): eggs corrections used to only touch
      // the EggProductionRecord row itself, leaving whatever inventory the
      // original goodEggs count had credited completely unchanged. Unlike
      // feed, EggProductionRecord stores no productId/warehouseId of its
      // own — the original StockMovement is the only durable record of
      // where the eggs actually landed, so we look there first.
      if (type === "eggs" && updateData.goodEggs !== undefined) {
        const egg = existing as { goodEggs: number };
        const delta = Number(updateData.goodEggs) - Number(egg.goodEggs);
        if (delta !== 0) {
          const mv = await tx.stockMovement.findFirst({ where: { companyId: user.companyId, referenceType: "EggProductionRecord", referenceId: id, movementType: "PRODUCTION_OUTPUT", deletedAt: null } });
          if (mv && mv.warehouseId) {
            const invItem = await tx.inventoryItem.findFirst({ where: { companyId: user.companyId, warehouseId: mv.warehouseId, productId: mv.productId, deletedAt: null } });
            if (invItem) {
              if (delta > 0) {
                // More eggs than first recorded — credit the difference as
                // its own traceable lot, same convention as a positive
                // stock adjustment.
                await tx.inventoryItem.update({ where: { id: invItem.id }, data: { quantityOnHand: { increment: delta }, updatedById: user.id } });
                await tx.stockBatch.create({
                  data: {
                    companyId: user.companyId, branchId: invItem.branchId, farmId: invItem.farmId,
                    warehouseId: mv.warehouseId, productId: mv.productId, inventoryItemId: invItem.id, uomId: invItem.uomId,
                    batchNumber: `ADJ-${id.slice(0, 8).toUpperCase()}`, quantityReceived: delta, quantityRemaining: delta,
                    manufactureDate: new Date(), createdById: user.id
                  }
                });
              } else {
                // Fewer eggs than first recorded — pull the excess back out,
                // floor-guarded and FIFO across whatever lots are still
                // available; block the correction if it's already been
                // partly or fully consumed elsewhere. Lock order (DB
                // stability audit, 2026-08-16): StockBatch lots first, then
                // InventoryItem — see consumeInventoryTx above for why.
                let remaining = -delta;
                const lots = await tx.stockBatch.findMany({
                  where: { companyId: user.companyId, warehouseId: mv.warehouseId, productId: mv.productId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
                  orderBy: { createdAt: "asc" }
                });
                for (const lot of lots) {
                  if (remaining <= 0) break;
                  const consumed = Math.min(remaining, Number(lot.quantityRemaining));
                  const lotUpdate = await tx.stockBatch.updateMany({ where: { id: lot.id, quantityRemaining: { gte: consumed } }, data: { quantityRemaining: { decrement: consumed } } });
                  if (lotUpdate.count === 0) {
                    throw new BadRequestException("Stock batch for this product was consumed concurrently. Please retry.");
                  }
                  remaining -= consumed;
                }
                if (remaining > 0) {
                  throw new BadRequestException("Cannot apply this correction — the previously credited egg stock has already been partly or fully consumed elsewhere.");
                }
                const guarded = await tx.inventoryItem.updateMany({
                  where: { id: invItem.id, quantityOnHand: { gte: -delta } },
                  data: { quantityOnHand: { decrement: -delta }, updatedById: user.id }
                });
                if (guarded.count === 0) {
                  throw new BadRequestException("Cannot apply this correction — the previously credited egg stock has already been consumed elsewhere.");
                }
              }
              await tx.stockMovement.create({
                data: {
                  companyId: user.companyId, branchId: invItem.branchId, productId: mv.productId, inventoryItemId: invItem.id,
                  toWarehouseId: delta > 0 ? mv.warehouseId : undefined, fromWarehouseId: delta < 0 ? mv.warehouseId : undefined,
                  warehouseId: mv.warehouseId, uomId: invItem.uomId, movementType: delta > 0 ? "PRODUCTION_OUTPUT" : "ADJUSTMENT_OUT",
                  quantity: Math.abs(delta), referenceType: "EggProductionRecord", referenceId: id, notes: "Egg quantity correction", createdById: user.id
                }
              });
            }
          }
        }
      }
      return updated;
    }), { label: "PoultryService.correctRecord" });

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
    // currentLiveBirds subtracts natural deaths, culling, AND birds transferred
    // out of the batch (excluding whole-batch relocations — see currentLiveBirds).
    const currentLiveBirds = this.currentLiveBirds(batch.openingBirdCount, records, batch.poultryTransferRecords ?? []);
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

  private async snapshotBatchProfitability(user: AuthenticatedUser, batchId: string) {
    const batch = await this.prisma.flockBatch.findFirst({
      where: { id: batchId, companyId: user.companyId },
      include: {
        mortalityRecords: { where: { deletedAt: null }, select: { birdCount: true, isCulling: true } },
        poultryTransferRecords: { where: { deletedAt: null }, select: { birdCount: true, isFullBatchRelocation: true, fromFarmId: true, toFarmId: true } },
        feedConsumptionRecords: { where: { deletedAt: null }, select: { quantityKg: true } },
        eggProductionRecords: { where: { deletedAt: null }, select: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true } },
        birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" }, take: 1 },
        costRecords: { where: { deletedAt: null }, select: { amount: true } }
      }
    });
    if (!batch) return;
    const prices = await this.poultryPrices(user.companyId);
    const m = this.batchMetrics(batch, prices);
    const totalRevenue = Number((m.estimatedRevenue ?? 0).toFixed(2));
    const totalCost = Number(m.totalCosts.toFixed(2));
    const grossProfit = Number((totalRevenue - totalCost).toFixed(2));
    const margin = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(2)) : 0;
    const reportData = { currentLiveBirds: m.currentLiveBirds, totalEggs: m.totalEggs, totalFeedKg: m.totalFeedKg, mortalityRate: m.mortalityRate };
    const existing = await this.prisma.batchProfitability.findFirst({ where: { companyId: user.companyId, batchType: "FLOCK" as never, batchId } });
    if (existing) {
      await this.prisma.batchProfitability.update({ where: { id: existing.id }, data: { totalRevenue, totalCost, grossProfit, margin, periodEnd: batch.actualCloseDate ?? new Date(), reportData } });
    } else {
      await this.prisma.batchProfitability.create({ data: { companyId: user.companyId, batchType: "FLOCK" as never, batchId, batchReference: batch.code, batchName: batch.name ?? batch.code, periodStart: batch.startDate ?? batch.createdAt, periodEnd: batch.actualCloseDate ?? new Date(), totalRevenue, totalCost, grossProfit, margin, createdById: user.id, reportData } });
    }
  }

  // (2026-08-18, revised same day) currentLiveBirds must agree with
  // getBatch's per-pen adjusted allocations — see that method's comment for
  // the invariant this restores. A transfer only actually removes birds
  // from the batch's total when they leave the FARM: moving birds between
  // pens or houses within the same farm (the overwhelmingly common case —
  // "move 6,600 from Pen 1 to Pen 2, same house, same farm") doesn't shrink
  // the flock at all, it just redistributes it. The first cut of this fix
  // only excluded isFullBatchRelocation (every remaining bird moving to a
  // genuinely different farm), which left every same-farm pen/house
  // transfer wrongly subtracted — exactly the case a live user hit
  // immediately after this shipped. isFullBatchRelocation is still needed
  // for the one remaining case a same-farm check can't cover: a whole-batch
  // move TO a different farm, where the batch's own farmId/poultryHouseId
  // get reassigned to follow the birds, so nothing was actually lost.
  private currentLiveBirds(
    openingBirdCount: number,
    mortalityRecords: Array<{ birdCount: number }>,
    transferRecords: Array<{ birdCount: number; isFullBatchRelocation: boolean; fromFarmId: string; toFarmId: string }> = []
  ) {
    const mortalityTotal = mortalityRecords.reduce((sum, row) => sum + row.birdCount, 0);
    const outgoingTotal = transferRecords
      .filter((t) => !t.isFullBatchRelocation && t.fromFarmId !== t.toFarmId)
      .reduce((sum, row) => sum + row.birdCount, 0);
    return Math.max(0, openingBirdCount - mortalityTotal - outgoingTotal);
  }

  // Transactional counterpart of currentLiveBirds, for the write-path checks
  // (createMortality, createDailyRecord, createTransfer, record corrections)
  // that need a live, lockable read rather than a pre-fetched array. Uses
  // findMany instead of aggregate because "exclude same-farm transfers"
  // compares two columns on the same row, which Prisma's where clause can't
  // express without raw SQL — summing in JS over what's normally a short
  // list is simpler and just as correct. Accepts either a live-run
  // Prisma.TransactionClient or the plain PrismaService for read-only
  // callers (getDailyRecordPrefill) that don't need row-locking.
  private async liveBirdsRemaining(
    client: Prisma.TransactionClient | PrismaService,
    flockBatchId: string,
    openingBirdCount: number,
    excludeMortalityId?: string
  ): Promise<number> {
    const [mortalityAgg, transfers] = await Promise.all([
      client.mortalityRecord.aggregate({
        where: { flockBatchId, deletedAt: null, ...(excludeMortalityId ? { id: { not: excludeMortalityId } } : {}) },
        _sum: { birdCount: true }
      }),
      client.poultryTransferRecord.findMany({
        where: { flockBatchId, deletedAt: null, isFullBatchRelocation: false },
        select: { birdCount: true, fromFarmId: true, toFarmId: true }
      })
    ]);
    const outgoingTotal = transfers.filter((t) => t.fromFarmId !== t.toFarmId).reduce((sum, t) => sum + t.birdCount, 0);
    return Math.max(0, openingBirdCount - (mortalityAgg._sum.birdCount ?? 0) - outgoingTotal);
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
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { id: { in: user.farmIds } }) };
  }

  private houseWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } }) };
  }

  private batchWhere(user: AuthenticatedUser) {
    return { companyId: user.companyId, deletedAt: null, ...(user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } }) };
  }

  private recordWhere(user: AuthenticatedUser, query: PoultryQueryDto, type?: string) {
    const farmFilter: Record<string, unknown> = user.hasGlobalAccess
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
      ...(type !== "transfers" ? { poultryHouseId: query.poultryHouseId } : {}),
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

  // (2026-08-18) Mortality/culled/feed/eggs can be logged either through
  // Daily Records or the dedicated Mortality/Feed/Egg screens — both write
  // to the same real tables, but neither screen knows the other was already
  // used for the same batch+day, so the same event could get reported
  // twice. These are advisory only (a legitimate second event on the same
  // day — a morning cull and a separate afternoon death — must not be
  // blocked), surfaced to the caller as a non-fatal `warning` string.
  private async dailyRecordOverlapWarning(companyId: string, flockBatchId: string, recordDate: Date, field: "mortalityCount" | "culledCount" | "feedConsumedKg" | "totalEggs", label: string): Promise<string | undefined> {
    const agg = await this.prisma.dailyPoultryRecord.aggregate({
      where: { companyId, flockBatchId, recordDate, deletedAt: null },
      _sum: { [field]: true }
    });
    const total = Number((agg._sum as Record<string, unknown>)[field] ?? 0);
    return total > 0
      ? `Heads up: today's Daily Record already logged ${total} ${label} for this batch — check this isn't the same event reported twice.`
      : undefined;
  }

  private async dedicatedMortalityOverlapWarning(companyId: string, flockBatchId: string, recordDate: Date, isCulling: boolean): Promise<string | undefined> {
    const agg = await this.prisma.mortalityRecord.aggregate({
      where: { companyId, flockBatchId, recordDate, isCulling, deletedAt: null, reason: { not: "Daily record" } },
      _sum: { birdCount: true }
    });
    const total = agg._sum.birdCount ?? 0;
    return total > 0
      ? `Heads up: ${total} ${isCulling ? "culled" : "mortality"} already logged today via the dedicated Mortality screen — check this isn't the same event reported twice.`
      : undefined;
  }

  private async dedicatedFeedOverlapWarning(companyId: string, flockBatchId: string, recordDate: Date): Promise<string | undefined> {
    const agg = await this.prisma.feedConsumptionRecord.aggregate({
      where: { companyId, flockBatchId, recordDate, deletedAt: null, notes: { not: "Daily record" } },
      _sum: { quantityKg: true }
    });
    const total = Number(agg._sum.quantityKg ?? 0);
    return total > 0
      ? `Heads up: ${total}kg feed already logged today via the dedicated Feed Consumption screen — check this isn't the same event reported twice.`
      : undefined;
  }

  private async dedicatedEggsOverlapWarning(companyId: string, flockBatchId: string, recordDate: Date): Promise<string | undefined> {
    const agg = await this.prisma.eggProductionRecord.aggregate({
      where: { companyId, flockBatchId, recordDate, deletedAt: null, notes: { not: "Daily record" } },
      _sum: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true }
    });
    const s = agg._sum;
    const total = (s.goodEggs ?? 0) + (s.crackedEggs ?? 0) + (s.dirtyEggs ?? 0) + (s.brokenEggs ?? 0) + (s.rejectedEggs ?? 0);
    return total > 0
      ? `Heads up: ${total} eggs already logged today via the dedicated Egg Production screen — check this isn't the same event reported twice.`
      : undefined;
  }

  private async assertNoActiveWithdrawal(flockBatchId: string, companyId: string, guidance: string) {
    const active = await this.prisma.medicationRecord.findFirst({
      where: { flockBatchId, companyId, deletedAt: null, withdrawalUntil: { gt: new Date() } },
      orderBy: { withdrawalUntil: "desc" }
    });
    if (active) {
      const until = active.withdrawalUntil!.toISOString().slice(0, 10);
      throw new BadRequestException(`This batch is within an active withdrawal period (${active.medicationName}) until ${until} — ${guidance}.`);
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
    if (!item) {
      // H4: this used to return silently — the production record saved as
      // if stock was consumed, with no stock movement and nothing logged,
      // which could mask a warehouse/product misconfiguration indefinitely.
      // Still don't block the record (a missing inventory setup shouldn't
      // stop a vet from logging medication given), but make it visible.
      // M-BUG (2026-08-13): visible server-side only wasn't enough — the
      // person who entered the record saw the same "saved successfully"
      // response either way, with nothing telling them stock wasn't
      // actually touched. Now returned so the caller can surface it.
      const warning = `No inventory item is set up for this product in the selected warehouse — the record was saved, but no stock was deducted.`;
      this.logger.warn(`consumeInventoryTx: no InventoryItem for product ${productId} in warehouse ${warehouseId} (companyId ${user.companyId}) — ${referenceType} ${referenceId} saved with no stock deducted.`);
      return { stockDeducted: false, warning };
    }
    const product = await tx.product.findFirst({ where: { id: productId } });
    // Lock order (DB stability audit, 2026-08-16): StockBatch lots first,
    // then InventoryItem — matches inventory.service.ts's own consumeFifoTx,
    // the canonical FIFO consumer. This used to decrement InventoryItem
    // first and StockBatch second, the opposite order, which risked a
    // deadlock against any concurrent transaction locking the same two rows
    // through the canonical path. A throw anywhere below still rolls back
    // everything already written in this transaction, so reordering which
    // guard runs first doesn't change correctness — only lock order.
    //
    // H-BUG-2 (2026-08-13): this used to stop at the aggregate
    // quantityOnHand decrement and never touch StockBatch — mirrors the
    // same drift bug already fixed in Feed Production and Market Planning.
    // Every FIFO consumer (Sales' consumeFifoTx included) reads
    // StockBatch.quantityRemaining, not quantityOnHand, so lots here would
    // silently go stale relative to what was actually recorded as consumed.
    let remaining = quantity;
    const stockBatches = await tx.stockBatch.findMany({
      where: { companyId: user.companyId, warehouseId, productId, quantityRemaining: { gt: 0 }, status: "AVAILABLE", deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
    for (const sb of stockBatches) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, Number(sb.quantityRemaining));
      const batchUpdate = await tx.stockBatch.updateMany({
        where: { id: sb.id, quantityRemaining: { gte: consumed } },
        data: { quantityRemaining: { decrement: consumed } }
      });
      if (batchUpdate.count === 0) {
        throw new BadRequestException(`Stock batch for this product was consumed concurrently. Please retry.`);
      }
      remaining -= consumed;
    }
    if (remaining > 0) {
      throw new BadRequestException(`Stock batches on hand for this product cover only ${(quantity - remaining).toFixed(2)} of the required ${quantity} — inventory and lot records are out of sync, or the remaining stock is quarantined. Please investigate before retrying.`);
    }
    // H4: floor-guarded updateMany — same reasoning as the other guarded
    // decrements in this codebase; a plain update() let two concurrent
    // consumption entries for the same product/warehouse both succeed and
    // jointly overdraw stock.
    const invUpdate = await tx.inventoryItem.updateMany({
      where: { id: item.id, quantityOnHand: { gte: quantity } },
      data: { quantityOnHand: { decrement: quantity }, updatedById: user.id }
    });
    if (invUpdate.count === 0) {
      throw new BadRequestException(`Stock for this product was modified concurrently. Please retry.`);
    }
    await tx.stockMovement.create({
      data: { companyId: user.companyId, branchId: batch.branchId, productId, inventoryItemId: item.id, fromWarehouseId: warehouseId, warehouseId, farmId: batch.farmId, uomId: product!.uomId, movementType, quantity, referenceType, referenceId, notes, createdById: user.id }
    });
    return { stockDeducted: true as const };
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
    // H-BUG-2 (2026-08-12): this only ever raised the aggregate
    // quantityOnHand — it never created a StockBatch. Every FIFO consumer
    // in the system (Sales' consumeFifoTx included) checks
    // StockBatch.quantityRemaining, not quantityOnHand, to decide what's
    // actually sellable/available — so stock credited here (eggs) looked
    // "in stock" on every dashboard but could never actually be released
    // to a customer. Mirrors the pattern every other production-output
    // path in this codebase already uses (see feed-production.service.ts's
    // createBatch).
    const batchNumber = await nextRef(tx, user.companyId, "EGG");
    await tx.stockBatch.create({
      data: {
        companyId: user.companyId,
        branchId: batch.branchId,
        farmId: batch.farmId,
        warehouseId,
        productId,
        inventoryItemId: item.id,
        uomId: product.uomId,
        batchNumber,
        quantityReceived: quantity,
        quantityRemaining: quantity,
        manufactureDate: new Date(),
        createdById: user.id
      }
    });
    await tx.stockMovement.create({
      data: { companyId: user.companyId, branchId: batch.branchId, productId, inventoryItemId: item.id, toWarehouseId: warehouseId, warehouseId, farmId: batch.farmId, uomId: product.uomId, movementType: "PRODUCTION_OUTPUT", quantity, referenceType, referenceId, notes, createdById: user.id }
    });
  }

  // Mobile parity audit (2026-08-17): idempotency-replay lookups for the 8
  // poultry create endpoints — mirrors sales.service.ts's
  // findOrderByIdempotencyKey/findPaymentByIdempotencyKey.
  private async findMortalityByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.mortalityRecord.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async findFeedByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.feedConsumptionRecord.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async findEggsByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.eggProductionRecord.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async findWeightByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.birdWeightRecord.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async findMedicationByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.medicationRecord.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async findVaccinationByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.vaccinationRecord.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async findHealthObservationByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.poultryHealthObservation.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async findCostByIdempotencyKey(companyId: string, idempotencyKey: string) {
    return this.prisma.poultryCostRecord.findFirst({ where: { companyId, idempotencyKey, deletedAt: null } });
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE", entityType: string, entityId: string, summary: string, context: RequestContext, farmId?: string) {
    await this.audit.write({ companyId: user.companyId, farmId, actorUserId: user.id, action, entityType, entityId, summary, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
