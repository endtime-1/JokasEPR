import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
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
  UpdatePoultryTransferStatusDto
} from "./dto/poultry.dto";

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

type BatchContext = {
  id: string;
  companyId: string;
  branchId: string;
  farmId: string;
  poultryHouseId: string;
  openingBirdCount: number;
  birdType: string;
};

@Injectable()
export class PoultryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async dashboard(user: AuthenticatedUser) {
    const batches = await this.prisma.flockBatch.findMany({
      where: this.batchWhere(user),
      include: {
        farm: { select: { name: true, code: true } },
        poultryHouse: { select: { name: true, code: true } },
        mortalityRecords: { where: { deletedAt: null }, select: { birdCount: true } },
        feedConsumptionRecords: { where: { deletedAt: null }, select: { quantityKg: true } },
        eggProductionRecords: { where: { deletedAt: null }, select: { goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true } },
        birdWeightRecords: { where: { deletedAt: null }, orderBy: { recordDate: "desc" }, take: 1 },
        costRecords: { where: { deletedAt: null }, select: { amount: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const rows = batches.map((batch) => this.batchMetrics(batch));
    return {
      data: {
        totalOpeningBirds: rows.reduce((sum, row) => sum + row.openingBirdCount, 0),
        currentLiveBirds: rows.reduce((sum, row) => sum + row.currentLiveBirds, 0),
        activeBatches: rows.filter((row) => row.status === "ACTIVE").length,
        totalEggs: rows.reduce((sum, row) => sum + row.totalEggs, 0),
        totalFeedKg: rows.reduce((sum, row) => sum + row.totalFeedKg, 0),
        totalCosts: rows.reduce((sum, row) => sum + row.totalCosts, 0),
        batches: rows
      }
    };
  }

  async options(user: AuthenticatedUser) {
    const [farms, houses, batches] = await Promise.all([
      this.prisma.farm.findMany({ where: this.farmWhere(user), select: { id: true, code: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.poultryHouse.findMany({ where: this.houseWhere(user), select: { id: true, code: true, name: true, farmId: true }, orderBy: { name: "asc" } }),
      this.prisma.flockBatch.findMany({ where: this.batchWhere(user), select: { id: true, code: true, name: true, farmId: true, poultryHouseId: true, birdType: true }, orderBy: { createdAt: "desc" } })
    ]);
    return { data: { farms, houses, batches } };
  }

  async farmOverview(user: AuthenticatedUser, farmId: string) {
    this.assertFarmAccess(user, farmId);
    const [houses, batches] = await Promise.all([
      this.prisma.poultryHouse.findMany({ where: { companyId: user.companyId, farmId, deletedAt: null }, orderBy: { code: "asc" } }),
      this.prisma.flockBatch.findMany({ where: { companyId: user.companyId, farmId, deletedAt: null }, include: { mortalityRecords: true, eggProductionRecords: true, feedConsumptionRecords: true, costRecords: true } })
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
      where: { ...this.houseWhere(user), farmId: query.farmId },
      include: { farm: { select: { id: true, code: true, name: true } }, flockBatches: { where: { deletedAt: null }, select: { id: true, status: true } } },
      orderBy: { code: "asc" }
    });
    return { data };
  }

  async createHouse(user: AuthenticatedUser, dto: CreatePoultryHouseDto, context: RequestContext) {
    this.assertFarmAccess(user, dto.farmId);
    const farm = await this.getFarm(user.companyId, dto.farmId);
    const house = await this.prisma.poultryHouse.create({
      data: {
        companyId: user.companyId,
        branchId: farm.branchId,
        farmId: farm.id,
        name: dto.name,
        code: dto.code.toUpperCase(),
        capacity: dto.capacity,
        createdById: user.id
      }
    });
    await this.writeAudit(user, "CREATE", "PoultryHouse", house.id, `Created poultry house ${house.code}`, context, farm.id);
    return { data: house };
  }

  async listBatches(user: AuthenticatedUser, query: PoultryQueryDto) {
    const batches = await this.prisma.flockBatch.findMany({
      where: { ...this.batchWhere(user), farmId: query.farmId, poultryHouseId: query.poultryHouseId },
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
    });
    return { data: batches.map((batch) => this.batchMetrics(batch)) };
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
        poultryTransferRecords: { where: { deletedAt: null }, orderBy: { transferDate: "desc" } },
        costRecords: { where: { deletedAt: null }, orderBy: { costDate: "desc" } }
      }
    });
    if (!batch) {
      throw new NotFoundException("Flock batch was not found.");
    }
    return { data: { ...batch, metrics: this.batchMetrics(batch) } };
  }

  async createBatch(user: AuthenticatedUser, dto: CreateFlockBatchDto, context: RequestContext) {
    this.assertFarmAccess(user, dto.farmId);
    const house = await this.getHouse(user.companyId, dto.poultryHouseId);
    if (house.farmId !== dto.farmId) {
      throw new BadRequestException("Poultry house does not belong to the selected farm.");
    }
    const batch = await this.prisma.flockBatch.create({
      data: {
        companyId: user.companyId,
        branchId: house.branchId,
        farmId: dto.farmId,
        poultryHouseId: dto.poultryHouseId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        birdType: dto.birdType,
        openingBirdCount: dto.openingBirdCount,
        startDate: new Date(dto.startDate),
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        status: dto.status ?? "ACTIVE",
        notes: dto.notes,
        createdById: user.id
      }
    });
    await this.writeAudit(user, "CREATE", "FlockBatch", batch.id, `Created flock batch ${batch.code}`, context, batch.farmId);
    return { data: batch };
  }

  async createDailyRecord(user: AuthenticatedUser, dto: CreateDailyPoultryRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const record = await this.prisma.dailyPoultryRecord.upsert({
      where: { companyId_flockBatchId_recordDate: { companyId: user.companyId, flockBatchId: batch.id, recordDate: new Date(dto.recordDate) } },
      update: {
        openingBirdCount: dto.openingBirdCount,
        mortalityCount: dto.mortalityCount,
        culledCount: dto.culledCount,
        feedConsumedKg: dto.feedConsumedKg,
        totalEggs: dto.totalEggs,
        notes: dto.notes,
        status: dto.status ?? "SUBMITTED",
        updatedById: user.id
      },
      create: {
        ...this.batchRecordBase(user, batch),
        recordDate: new Date(dto.recordDate),
        openingBirdCount: dto.openingBirdCount,
        mortalityCount: dto.mortalityCount,
        culledCount: dto.culledCount,
        feedConsumedKg: dto.feedConsumedKg,
        totalEggs: dto.totalEggs,
        notes: dto.notes,
        status: dto.status ?? "SUBMITTED"
      }
    });
    await this.writeAudit(user, "CREATE", "DailyPoultryRecord", record.id, "Submitted daily poultry record", context, batch.farmId);
    return { data: record };
  }

  async createMortality(user: AuthenticatedUser, dto: CreateMortalityRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.mortalityRecord.create({
      data: { ...this.batchRecordBase(user, batch), recordDate: new Date(dto.recordDate), birdCount: dto.birdCount, isCulling: dto.isCulling ?? false, reason: dto.reason, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
    });
    await this.writeAudit(user, "CREATE", "MortalityRecord", data.id, dto.isCulling ? "Recorded poultry culling" : "Recorded poultry mortality", context, batch.farmId);
    return { data };
  }

  async createFeed(user: AuthenticatedUser, dto: CreateFeedConsumptionRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.feedConsumptionRecord.create({
      data: { ...this.batchRecordBase(user, batch), recordDate: new Date(dto.recordDate), feedProductId: dto.feedProductId, quantityKg: dto.quantityKg, costAmount: dto.costAmount, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
    });
    await this.writeAudit(user, "CREATE", "FeedConsumptionRecord", data.id, "Recorded poultry feed consumption", context, batch.farmId);
    return { data };
  }

  async createEggs(user: AuthenticatedUser, dto: CreateEggProductionRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.eggProductionRecord.create({
      data: { ...this.batchRecordBase(user, batch), recordDate: new Date(dto.recordDate), goodEggs: dto.goodEggs, crackedEggs: dto.crackedEggs, dirtyEggs: dto.dirtyEggs, brokenEggs: dto.brokenEggs, rejectedEggs: dto.rejectedEggs, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
    });
    await this.writeAudit(user, "CREATE", "EggProductionRecord", data.id, "Recorded egg production", context, batch.farmId);
    return { data };
  }

  async createWeight(user: AuthenticatedUser, dto: CreateBirdWeightRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.birdWeightRecord.create({
      data: { ...this.batchRecordBase(user, batch), recordDate: new Date(dto.recordDate), sampleSize: dto.sampleSize, averageWeightKg: dto.averageWeightKg, notes: dto.notes, status: dto.status ?? "SUBMITTED" }
    });
    await this.writeAudit(user, "CREATE", "BirdWeightRecord", data.id, "Recorded bird weight", context, batch.farmId);
    return { data };
  }

  async createMedication(user: AuthenticatedUser, dto: CreateMedicationRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.medicationRecord.create({
      data: { ...this.batchRecordBase(user, batch), medicationName: dto.medicationName, dosage: dto.dosage, route: dto.route, startDate: new Date(dto.startDate), endDate: dto.endDate ? new Date(dto.endDate) : undefined, withdrawalUntil: dto.withdrawalUntil ? new Date(dto.withdrawalUntil) : undefined, notes: dto.notes }
    });
    await this.writeAudit(user, "CREATE", "MedicationRecord", data.id, "Recorded poultry medication", context, batch.farmId);
    return { data };
  }

  async createVaccination(user: AuthenticatedUser, dto: CreateVaccinationRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.vaccinationRecord.create({
      data: { ...this.batchRecordBase(user, batch), vaccineName: dto.vaccineName, dose: dto.dose, vaccinationDate: new Date(dto.vaccinationDate), nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : undefined, notes: dto.notes }
    });
    await this.writeAudit(user, "CREATE", "VaccinationRecord", data.id, "Recorded poultry vaccination", context, batch.farmId);
    return { data };
  }

  async createHealthObservation(user: AuthenticatedUser, dto: CreateHealthObservationDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.poultryHealthObservation.create({
      data: { ...this.batchRecordBase(user, batch), observationDate: new Date(dto.observationDate), severity: dto.severity, observation: dto.observation, vetVisitDate: dto.vetVisitDate ? new Date(dto.vetVisitDate) : undefined, veterinarianName: dto.veterinarianName, recommendation: dto.recommendation }
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
    const data = await this.prisma.poultryTransferRecord.create({
      data: {
        companyId: user.companyId,
        branchId: batch.branchId,
        flockBatchId: batch.id,
        fromFarmId: batch.farmId,
        fromPoultryHouseId: batch.poultryHouseId,
        toFarmId: dto.toFarmId,
        toPoultryHouseId: dto.toPoultryHouseId,
        birdCount: dto.birdCount,
        transferDate: new Date(dto.transferDate),
        reason: dto.reason,
        createdById: user.id
      }
    });
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

  async createCost(user: AuthenticatedUser, dto: CreatePoultryCostRecordDto, context: RequestContext) {
    const batch = await this.getBatchContext(user, dto.flockBatchId);
    const data = await this.prisma.poultryCostRecord.create({
      data: { ...this.batchRecordBase(user, batch), costDate: new Date(dto.costDate), costType: dto.costType, amount: dto.amount, description: dto.description, status: dto.status ?? "SUBMITTED" }
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
    const where = this.recordWhere(user, query);
    const model = this.recordModel(type);
    const data = await model.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    return { data };
  }

  async softDelete(user: AuthenticatedUser, type: string, id: string, context: RequestContext) {
    const model = this.recordModel(type);
    const existing = await model.findFirst({ where: { companyId: user.companyId, id, deletedAt: null } });
    if (!existing) {
      throw new NotFoundException("Record was not found.");
    }
    this.assertFarmAccess(user, existing.farmId);
    const data = await model.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.writeAudit(user, "DELETE", type, id, `Deleted poultry ${type} record`, context, existing.farmId);
    return { data };
  }

  async reportCsv(user: AuthenticatedUser, query: PoultryQueryDto, context: RequestContext) {
    const batches = await this.listBatches(user, query);
    const rows = [
      ["batch", "farm", "house", "bird_type", "opening_birds", "current_live_birds", "mortality_rate", "egg_production_percent", "feed_conversion_ratio", "cost_per_bird", "profitability"],
      ...batches.data.map((batch) => [
        batch.code,
        batch.farm.name,
        batch.poultryHouse.name,
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

  private batchMetrics(batch: any) {
    const mortality = (batch.mortalityRecords ?? []).reduce((sum: number, row: any) => sum + row.birdCount, 0);
    const currentLiveBirds = this.currentLiveBirds(batch.openingBirdCount, batch.mortalityRecords ?? []);
    const totalFeedKg = (batch.feedConsumptionRecords ?? []).reduce((sum: number, row: any) => sum + Number(row.quantityKg), 0);
    const totalEggs = (batch.eggProductionRecords ?? []).reduce((sum: number, row: any) => sum + this.totalEggs(row), 0);
    const totalCosts = (batch.costRecords ?? []).reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    const latestWeight = Number(batch.birdWeightRecords?.[0]?.averageWeightKg ?? 0);
    const estimatedRevenue = totalEggs * 1.2 + (batch.birdType === "BROILERS" ? currentLiveBirds * latestWeight * 35 : 0);
    const birdDays = Math.max(currentLiveBirds, 1) * Math.max((batch.eggProductionRecords ?? []).length, 1);
    return {
      ...batch,
      currentLiveBirds,
      mortalityRate: Number(((mortality / Math.max(batch.openingBirdCount, 1)) * 100).toFixed(2)),
      eggProductionPercent: Number(((totalEggs / birdDays) * 100).toFixed(2)),
      feedConversionRatio: batch.birdType === "BROILERS" && latestWeight > 0 ? Number((totalFeedKg / Math.max(currentLiveBirds * latestWeight, 1)).toFixed(2)) : 0,
      costPerBird: Number((totalCosts / Math.max(currentLiveBirds, 1)).toFixed(2)),
      profitability: Number((estimatedRevenue - totalCosts).toFixed(2)),
      totalFeedKg: Number(totalFeedKg.toFixed(2)),
      totalEggs,
      totalCosts: Number(totalCosts.toFixed(2))
    };
  }

  private currentLiveBirds(openingBirdCount: number, mortalityRecords: Array<{ birdCount: number }>) {
    return Math.max(0, openingBirdCount - mortalityRecords.reduce((sum, row) => sum + row.birdCount, 0));
  }

  private totalEggs(row: { goodEggs: number; crackedEggs: number; dirtyEggs: number; brokenEggs: number; rejectedEggs: number }) {
    return row.goodEggs + row.crackedEggs + row.dirtyEggs + row.brokenEggs + row.rejectedEggs;
  }

  private async getBatchContext(user: AuthenticatedUser, flockBatchId: string): Promise<BatchContext> {
    const batch = await this.prisma.flockBatch.findFirst({ where: { ...this.batchWhere(user), id: flockBatchId } });
    if (!batch) {
      throw new NotFoundException("Flock batch was not found.");
    }
    this.assertFarmAccess(user, batch.farmId);
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

  private batchRecordBase(user: AuthenticatedUser, batch: BatchContext) {
    return {
      companyId: user.companyId,
      branchId: batch.branchId,
      farmId: batch.farmId,
      poultryHouseId: batch.poultryHouseId,
      flockBatchId: batch.id,
      createdById: user.id
    };
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

  private recordWhere(user: AuthenticatedUser, query: PoultryQueryDto) {
    return {
      companyId: user.companyId,
      deletedAt: null,
      farmId: query.farmId,
      poultryHouseId: query.poultryHouseId,
      flockBatchId: query.flockBatchId,
      ...(query.startDate || query.endDate
        ? {
            OR: [
              { recordDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } },
              { startDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } },
              { vaccinationDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } },
              { observationDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } },
              { transferDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } },
              { costDate: { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } }
            ]
          }
        : {}),
      ...(user.hasGlobalAccess ? {} : { farmId: { in: user.farmIds } })
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

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "TRANSFER" | "APPROVE", entityType: string, entityId: string, summary: string, context: RequestContext, farmId?: string) {
    await this.audit.write({ companyId: user.companyId, farmId, actorUserId: user.id, action, entityType, entityId, summary, ipAddress: context.ipAddress, userAgent: context.userAgent });
  }
}
