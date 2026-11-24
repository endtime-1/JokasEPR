import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { EggAnalysisService } from "./egg-analysis.service";

jest.setTimeout(60_000);

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const user = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({ id: "u1", companyId: "co-1", email: "o@x.com", fullName: "The Owner", roles: [], permissions: [], branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [], hasGlobalAccess: true, ...over });

function make(opts: { noProduct?: boolean } = {}) {
  const calls: { model: string; args: { where?: Record<string, unknown> } }[] = [];
  const q = (model: string, rows: unknown) => jest.fn(async (args: { where?: Record<string, unknown> } = {}) => { calls.push({ model, args }); return rows; });
  const prisma = {
    product: { findFirst: q("product", opts.noProduct ? null : { id: "p-eg", piecesPerUnit: 30 }) },
    warehouse: { findMany: q("warehouse", [{ id: "w-farm", name: "Jokas Egg", type: "EGG_STORE", status: "ACTIVE", deletedAt: null, farm: { name: "JOKASFARM" } }, { id: "w-hq", name: "Egg Store", type: "EGG_STORE", status: "ACTIVE", deletedAt: null, farm: { name: "Akoko" } }]) },
    inventoryItem: { findMany: q("inventoryItem", [{ warehouseId: "w-farm", quantityOnHand: { toString: () => "70" } }, { warehouseId: "w-hq", quantityOnHand: { toString: () => "29" } }]) },
    stockMovement: { findMany: q("stockMovement", [
      { id: "m1", warehouseId: "w-farm", fromWarehouseId: null, toWarehouseId: null, movementType: "PRODUCTION_OUTPUT", quantity: { toString: () => "100" }, referenceType: null, referenceId: null, movementDate: D("2026-10-01"), notes: null },
      { id: "m2", warehouseId: "w-farm", fromWarehouseId: "w-farm", toWarehouseId: "w-hq", movementType: "TRANSFER", quantity: { toString: () => "30" }, referenceType: "StockTransfer", referenceId: "t1", movementDate: D("2026-10-02"), notes: null },
      { id: "m3", warehouseId: "w-hq", fromWarehouseId: "w-farm", toWarehouseId: "w-hq", movementType: "TRANSFER", quantity: { toString: () => "29" }, referenceType: "StockTransfer", referenceId: "t1", movementDate: D("2026-10-02"), notes: null },
      { id: "m4", warehouseId: "w-hq", fromWarehouseId: null, toWarehouseId: null, movementType: "SALE_DISPATCH", quantity: { toString: () => "0" }, referenceType: "EggSale", referenceId: "s0", movementDate: D("2026-10-03"), notes: null }
    ]) },
    eggProductionRecord: { findMany: q("eggProductionRecord", [{ id: "r1", recordDate: D("2026-10-01"), goodEggs: 2900, crackedEggs: 50, dirtyEggs: 30, brokenEggs: 10, rejectedEggs: 10, deletedAt: null, updatedAt: D("2026-10-01"), poultryHouse: { name: "Dufie" } }]) },
    stockTransfer: { findMany: q("stockTransfer", [{ id: "t1", transferNumber: "STR-1", transferDate: D("2026-10-02"), quantity: { toString: () => "30" }, receivedQuantity: { toString: () => "29" }, status: "COMPLETED", fromWarehouseId: "w-farm", toWarehouseId: "w-hq" }]) },
    eggSale: { findMany: q("eggSale", []), count: q("eggSaleCount", 2) },
    stockAdjustment: { findMany: q("stockAdjustment", [{ id: "a1", adjustmentNumber: "ADJ-1", warehouseId: "w-farm", adjustmentType: "WRITE_OFF", quantity: { toString: () => "1" }, status: "APPROVED", reason: "Damage", createdAt: D("2026-10-12"), requestedById: "u-fm", approvedById: "u-fm" }]) },
    transferDiscrepancy: { findMany: q("transferDiscrepancy", [{ expectedQuantity: { toString: () => "30" }, receivedQuantity: { toString: () => "29" }, differenceQuantity: { toString: () => "1" }, status: "RESOLVED", resolution: "SOURCE_MISCOUNT", reason: "Short receipt", stockTransfer: { transferNumber: "STR-1" } }]) },
    user: { findMany: q("user", [{ id: "u-fm", fullName: "Farm manager" }]) },
    company: { findFirst: q("company", { name: "Jokas Farms" }) }
  };
  const audit = { write: jest.fn(async () => undefined) };
  const service = new EggAnalysisService(prisma as never, audit as never);
  return { service, prisma, audit, calls };
}

describe("EggAnalysisService", () => {
  it("only people with company-wide access can run it", async () => {
    const { service, calls } = make();
    await expect(service.analysis(user({ hasGlobalAccess: false }), {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.workbook(user({ hasGlobalAccess: false }), {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls).toHaveLength(0); // it did not even read the data
  });

  it("reads ONLY this company's records, and only reads", async () => {
    const { service, calls, prisma } = make();
    await service.analysis(user(), {});
    expect(calls.length).toBeGreaterThanOrEqual(10);
    for (const c of calls) {
      if (c.model === "user") expect(c.args.where).toMatchObject({ companyId: "co-1" });
      else if (c.model === "transferDiscrepancy" || c.model === "product" || c.model === "warehouse" || c.model === "inventoryItem" || c.model === "stockMovement" || c.model === "eggProductionRecord" || c.model === "stockTransfer" || c.model === "stockAdjustment" || c.model.startsWith("eggSale")) expect(c.args.where).toMatchObject({ companyId: "co-1" });
    }
    // no write methods were ever touched
    for (const model of Object.values(prisma)) for (const key of Object.keys(model as object)) expect(["findMany", "findFirst", "count"]).toContain(key);
  });

  it("turns the records into the analysis: eggs add up across production, transfers and adjustments", async () => {
    const { service } = make();
    const a = await service.analysis(user(), {});
    expect(a.headline.producedPerRecords).toBeCloseTo(3000 / 30, 4); // 2900+50+30+10+10 eggs = 100 crates
    expect(a.stores.map((s) => [s.name, s.role, s.closing, s.agrees])).toEqual([["Jokas Egg", "FARM", 70, true], ["Egg Store", "SALES", 29, true]]);
    expect(a.transfers.summary).toMatchObject({ sent: 30, received: 29, shortBy: 1 });
    expect(a.adjustments[0]).toMatchObject({ number: "ADJ-1", requestedBy: "Farm manager", approvedBy: "Farm manager", sameApprover: true });
    expect(a.sales.deletedSaleCount).toBe(2);
  });

  it("checks the dates", async () => {
    const { service } = make();
    await expect(service.analysis(user(), { from: "yesterday" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.analysis(user(), { from: "2026-13-45" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.analysis(user(), { from: "2026-11-10", to: "2026-11-01" })).rejects.toThrow(/after the end date/);
    const ok = await service.analysis(user(), { from: "2026-10-01", to: "2026-10-31" });
    expect(ok.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("says so plainly when there is no Eggs product", async () => {
    const { service } = make({ noProduct: true });
    await expect(service.analysis(user(), {})).rejects.toThrow(/no Eggs product/);
  });

  it("the Excel export is a real workbook, named by date, and the export is written to the audit log", async () => {
    const { service, audit } = make();
    const r = await service.workbook(user(), { to: "2026-11-24" }, { ipAddress: "10.0.0.1", userAgent: "jest" });
    expect(r.filename).toBe("egg-analysis-2026-11-24.xlsx");
    expect(r.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(audit.write).toHaveBeenCalledTimes(1);
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ companyId: "co-1", actorUserId: "u1", action: "EXPORT", entityType: "EggAnalysis", ipAddress: "10.0.0.1" }));
  });
});
