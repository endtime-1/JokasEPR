import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { AuditService } from "../../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EggAnalysis, RawEggData, analyseEggs } from "./egg-analysis.calc";
import { buildEggWorkbook } from "./egg-analysis.workbook";

const n = (v: { toString(): string } | number | null | undefined) => Number(v ?? 0);

/**
 * Reads the company's egg records (read-only) and builds the egg analysis. Everything is scoped to the company, and the
 * report is for people with company-wide access: it spans every egg store and includes sales values.
 */
@Injectable()
export class EggAnalysisService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private assertAllowed(user: AuthenticatedUser) {
    if (!user.hasGlobalAccess) throw new ForbiddenException("The egg analysis covers every store, so it is only available to users with company-wide access.");
  }

  private parse(value: string | undefined, label: string): Date | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must be a date like 2026-11-24.`);
    const d = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label} is not a valid date.`);
    return d;
  }

  /** Every egg record the analysis needs, converted to plain numbers and dates. */
  async load(companyId: string): Promise<RawEggData> {
    const product = await this.prisma.product.findFirst({ where: { companyId, sku: "EG", deletedAt: null }, select: { id: true, piecesPerUnit: true } });
    if (!product) throw new BadRequestException("There is no Eggs product (SKU EG), so there is nothing to analyse.");
    const productId = product.id;
    const [warehouses, items, movements, records, transfers, sales, deletedSaleCount, adjustments] = await Promise.all([
      this.prisma.warehouse.findMany({ where: { companyId }, select: { id: true, name: true, type: true, status: true, deletedAt: true, farm: { select: { name: true } } } }),
      this.prisma.inventoryItem.findMany({ where: { companyId, productId }, select: { warehouseId: true, quantityOnHand: true } }),
      this.prisma.stockMovement.findMany({ where: { companyId, productId, deletedAt: null }, select: { id: true, warehouseId: true, fromWarehouseId: true, toWarehouseId: true, movementType: true, quantity: true, referenceType: true, referenceId: true, movementDate: true, notes: true } }),
      this.prisma.eggProductionRecord.findMany({ where: { companyId }, select: { id: true, recordDate: true, goodEggs: true, crackedEggs: true, dirtyEggs: true, brokenEggs: true, rejectedEggs: true, deletedAt: true, updatedAt: true, poultryHouse: { select: { name: true } } } }),
      this.prisma.stockTransfer.findMany({ where: { companyId, productId, deletedAt: null }, select: { id: true, transferNumber: true, transferDate: true, quantity: true, receivedQuantity: true, status: true, fromWarehouseId: true, toWarehouseId: true } }),
      this.prisma.eggSale.findMany({ where: { companyId, deletedAt: null }, select: { id: true, saleNumber: true, warehouseId: true, saleDate: true, quantityCrates: true, totalAmount: true, buyerName: true } }),
      this.prisma.eggSale.count({ where: { companyId, deletedAt: { not: null } } }),
      this.prisma.stockAdjustment.findMany({ where: { companyId, productId, deletedAt: null }, select: { id: true, adjustmentNumber: true, warehouseId: true, adjustmentType: true, quantity: true, status: true, reason: true, createdAt: true, requestedById: true, approvedById: true } })
    ]);
    const discrepancies = await this.prisma.transferDiscrepancy.findMany({ where: { companyId, deletedAt: null, stockTransferId: { in: transfers.map((t) => t.id) } }, select: { expectedQuantity: true, receivedQuantity: true, differenceQuantity: true, status: true, resolution: true, reason: true, stockTransfer: { select: { transferNumber: true } } } });
    const userIds = [...new Set(adjustments.flatMap((a) => [a.requestedById, a.approvedById]).filter((x): x is string => !!x))];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { companyId, id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
    const who = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      perCrate: product.piecesPerUnit || 30,
      today: new Date(),
      warehouses: warehouses.map((w) => ({ id: w.id, name: w.name, type: w.type, farm: w.farm?.name ?? null, retired: !!w.deletedAt || w.status !== "ACTIVE" })),
      onHand: items.map((i) => ({ warehouseId: i.warehouseId, qty: n(i.quantityOnHand) })),
      movements: movements.map((m) => ({ id: m.id, warehouseId: m.warehouseId, fromWarehouseId: m.fromWarehouseId, toWarehouseId: m.toWarehouseId, type: m.movementType, qty: n(m.quantity), referenceType: m.referenceType, referenceId: m.referenceId, date: m.movementDate, notes: m.notes })),
      records: records.map((r) => ({ id: r.id, date: r.recordDate, eggs: n(r.goodEggs) + n(r.crackedEggs) + n(r.dirtyEggs) + n(r.brokenEggs) + n(r.rejectedEggs), deletedAt: r.deletedAt, updatedAt: r.updatedAt, house: r.poultryHouse?.name ?? null })),
      transfers: transfers.map((t) => ({ id: t.id, number: t.transferNumber, date: t.transferDate, qty: n(t.quantity), received: t.receivedQuantity === null ? null : n(t.receivedQuantity), status: t.status, fromId: t.fromWarehouseId, toId: t.toWarehouseId })),
      discrepancies: discrepancies.map((d) => ({ transferNumber: d.stockTransfer.transferNumber, expected: n(d.expectedQuantity), received: n(d.receivedQuantity), difference: n(d.differenceQuantity), status: d.status, resolution: d.resolution, reason: d.reason })),
      sales: sales.map((s) => ({ id: s.id, number: s.saleNumber, warehouseId: s.warehouseId, date: s.saleDate, crates: n(s.quantityCrates), amount: n(s.totalAmount), buyer: s.buyerName })),
      deletedSaleCount,
      adjustments: adjustments.map((a) => ({ id: a.id, number: a.adjustmentNumber, warehouseId: a.warehouseId, type: a.adjustmentType, qty: n(a.quantity), status: a.status, reason: a.reason, createdAt: a.createdAt, requestedById: a.requestedById, approvedById: a.approvedById, requestedBy: a.requestedById ? who.get(a.requestedById) ?? null : null, approvedBy: a.approvedById ? who.get(a.approvedById) ?? null : null }))
    };
  }

  async analysis(user: AuthenticatedUser, query: { from?: string; to?: string }): Promise<EggAnalysis> {
    this.assertAllowed(user);
    const from = this.parse(query.from, "The start date");
    const to = this.parse(query.to, "The end date");
    if (from && to && from > to) throw new BadRequestException("The start date is after the end date.");
    return analyseEggs(await this.load(user.companyId), { from, to });
  }

  async workbook(user: AuthenticatedUser, query: { from?: string; to?: string }, meta: { ipAddress?: string; userAgent?: string } = {}): Promise<{ buffer: Buffer; filename: string }> {
    const a = await this.analysis(user, query);
    const company = await this.prisma.company.findFirst({ where: { id: user.companyId }, select: { name: true } });
    const buffer = await buildEggWorkbook(a, { company: company?.name, preparedBy: user.fullName });
    await this.audit.write({ companyId: user.companyId, actorUserId: user.id, action: "EXPORT", entityType: "EggAnalysis", summary: `Exported the egg analysis (${a.period.from ?? "start"} to ${a.period.to})`, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
    return { buffer, filename: `egg-analysis-${a.period.to}.xlsx` };
  }
}
