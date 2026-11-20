/**
 * Finance v2 items and stock tests (real MySQL/MariaDB with all fin migrations applied, triggers included):
 *   FIN_TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3398/fintest npx jest --runInBand src/modules/fin
 * Every test builds its own company, so tests never see each other's data.
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { FinAccountsService } from "./fin-accounts.service";
import { FinAuditService } from "./fin-audit.service";
import { FinItemsService } from "./fin-items.service";
import { FinLedgerService, dayString, parseDay } from "./fin-ledger.service";
import { FinNumberingService } from "./fin-numbering.service";
import { ledgerBalancePesewas } from "./fin-payment-accounts.service";
import { FinStockService } from "./fin-stock.service";
import { costOfStockOut, costToTenThousandths, milliToString, qtyToMilli, unitCost4, valueOfStockIn } from "./fin-stock-math";

const URL = process.env.FIN_TEST_DATABASE_URL;
const maybe = URL ? describe : describe.skip;

describe("stock arithmetic", () => {
  it("reads quantities to thousandths and refuses anything else", () => {
    expect(qtyToMilli("12.5")).toBe(12_500);
    expect(qtyToMilli(".5")).toBe(500);
    expect(qtyToMilli("-3")).toBe(-3_000);
    expect(qtyToMilli(0.125)).toBe(125);
    expect(qtyToMilli("")).toBe(0);
    expect(() => qtyToMilli("1.0005")).toThrow(/at most 3 decimal/);
    expect(() => qtyToMilli("abc")).toThrow(/not a valid number/);
    expect(milliToString(12_500)).toBe("12.500");
    expect(milliToString(-250)).toBe("-0.250");
  });
  it("values stock in at its cost, to the pesewa", () => {
    expect(valueOfStockIn(10_000, costToTenThousandths("310"))).toBe(310_000); // 10 x 310.00 = 3,100.00
    expect(valueOfStockIn(2_500, costToTenThousandths("3.2"))).toBe(800); // 2.5 x 3.20 = 8.00
    expect(valueOfStockIn(3_000, costToTenThousandths("3.3333"))).toBe(1_000); // 3 x 3.3333 = 9.9999 -> 10.00
    expect(() => costToTenThousandths("1.00005")).toThrow(/at most 4 decimal/);
  });
  it("takes stock out at the weighted average, and the last unit takes whatever value is left", () => {
    expect(costOfStockOut(10_000, 3_000, 1_000)).toBe(3_333); // 1 of 3 units worth 100.00 -> 33.33
    expect(costOfStockOut(10_000 - 3_333, 2_000, 1_000)).toBe(3_334); // value left is 66.67: half of it, rounded
    expect(costOfStockOut(3_333, 1_000, 1_000)).toBe(3_333); // the last unit: all of it, no rounding left behind
    expect(costOfStockOut(5_000, 2_000, 9_000)).toBe(5_000); // more than held: only what is held counts
    expect(costOfStockOut(5_000, 0, 1_000)).toBe(0);
  });
  it("shows a movement's unit cost to four decimals", () => {
    expect(unitCost4(310_000, 10_000)).toBe(3_100_000); // 3,100.00 for 10 units = 310.0000 each
    expect(unitCost4(-3_333, -1_000)).toBe(333_300); // 33.33 for 1 unit = 33.3300
  });
});

maybe("finance v2 items and stock (real database)", () => {
  let prisma: PrismaClient;
  let chart: FinAccountsService;
  let ledger: FinLedgerService;
  let items: FinItemsService;
  let stock: FinStockService;
  const user = "user-1";
  const meta = { ipAddress: "127.0.0.1", userAgent: "jest" };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$connect();
    const p = prisma as never;
    const audit = new FinAuditService(p);
    const numbering = new FinNumberingService(p, audit);
    chart = new FinAccountsService(p, audit);
    ledger = new FinLedgerService(p, numbering, audit);
    stock = new FinStockService(p);
    items = new FinItemsService(p, audit, ledger, stock);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const today = () => dayString(parseDay(new Date()));
  async function setup() {
    const companyId = randomUUID();
    await chart.applyTemplate(companyId, user, meta);
    const acc = async (code: string) => (await prisma.finAccount.findFirstOrThrow({ where: { companyId, code } })).id;
    return { companyId, acc };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;
  const make = (c: Ctx, over: object = {}) => items.create(c.companyId, user, { sku: `SKU-${randomUUID().slice(0, 6)}`, name: "Layer 1 C feed, 50 kg bag", unit: "bag", sellPrice: "336", ...over } as never, meta);
  /** Balance of a ledger account as a number in cedis (debit positive). */
  const bal = async (c: Ctx, code: string) => (await ledgerBalancePesewas(prisma as never, c.companyId, await c.acc(code))) / 100;
  const out = (c: Ctx, itemId: string, qty: string, over: object = {}) =>
    prisma.$transaction((tx) => stock.move(tx, { companyId: c.companyId, itemId, date: today(), type: "SALE", quantityMilli: -qtyToMilli(qty), sourceModule: "TEST", sourceId: randomUUID(), userId: user, ...over }));
  const inn = (c: Ctx, itemId: string, qty: string, cost: string) =>
    prisma.$transaction((tx) => stock.move(tx, { companyId: c.companyId, itemId, date: today(), type: "PURCHASE", quantityMilli: qtyToMilli(qty), cost4: costToTenThousandths(cost), sourceModule: "TEST", sourceId: randomUUID(), userId: user }));

  describe("items", () => {
    it("creates an item with opening stock: quantity, value, a balanced journal, and the movement linked to it", async () => {
      const c = await setup();
      const it = await make(c, { sku: "FD-L1C", barcode: "6001234567890", openingStock: { quantity: "100", unitCost: "310" } });
      expect(it).toMatchObject({ sku: "FD-L1C", qtyOnHand: "100.000", stockValue: "31000.00", avgCost: "310.00", unit: "bag", kind: "GOODS", trackStock: true, priceIncludesTax: true });
      expect(await bal(c, "1390")).toBe(31_000); // Inventory
      expect(await bal(c, "3900")).toBe(-31_000); // Opening Balance Equity
      const [m] = await prisma.finStockMovement.findMany({ where: { itemId: it.id } });
      expect(m).toMatchObject({ type: "OPENING", balanceQty: expect.anything() });
      expect(m.journalEntryId).toBeTruthy();
      const entry = await prisma.finJournalEntry.findUniqueOrThrow({ where: { id: m.journalEntryId! } });
      expect(entry).toMatchObject({ type: "OPENING", status: "POSTED" });
      expect(await prisma.finAuditLog.count({ where: { companyId: c.companyId, entityType: "FinItem", action: "CREATE" } })).toBe(1);
    });

    it("refuses duplicate SKUs and barcodes, bad prices and quantities, and wrong account types", async () => {
      const c = await setup();
      await make(c, { sku: "A1", barcode: "111" });
      await expect(make(c, { sku: "a1" })).rejects.toThrow(/already exists/); // not case sensitive
      await expect(make(c, { sku: "A2", barcode: "111" })).rejects.toThrow(/barcode 111 already belongs to A1/);
      await expect(make(c, { sku: "A3", sellPrice: "-1" })).rejects.toThrow(/cannot be negative/);
      await expect(make(c, { sku: "A4", sellPrice: "1.005" })).rejects.toThrow(/2 decimal/);
      await expect(make(c, { sku: "A5", openingStock: { quantity: "0", unitCost: "1" } })).rejects.toThrow(/more than zero/);
      await expect(make(c, { sku: "A6", openingStock: { quantity: "1", unitCost: "1.00005" } })).rejects.toThrow(/4 decimal/);
      await expect(make(c, { sku: "A7", incomeAccountId: await c.acc("6900") })).rejects.toThrow(/income account/);
      await expect(make(c, { sku: "A8", inventoryAccountId: await c.acc("4500") })).rejects.toThrow(/inventory account/);
      await expect(make(c, { sku: "A9", cogsAccountId: await c.acc("1390") })).rejects.toThrow(/cost of goods sold/);
      await expect(make(c, { sku: "B1", taxCodeId: randomUUID() })).rejects.toThrow(/tax code/);
      expect(await prisma.finItem.count({ where: { companyId: c.companyId } })).toBe(1); // nothing half-created
    });

    it("a service never tracks stock", async () => {
      const c = await setup();
      const svc = await make(c, { sku: "DEL", name: "Delivery", kind: "SERVICE", trackStock: true, unit: "each" });
      expect(svc).toMatchObject({ kind: "SERVICE", trackStock: false });
      await expect(make(c, { sku: "DEL2", kind: "SERVICE", openingStock: { quantity: "1", unitCost: "1" } })).rejects.toThrow(/only applies to items that track stock/);
      await expect(out(c, svc.id, "1")).rejects.toThrow(/does not track stock/);
    });

    it("lets you change the price and details, but not the unit or stock tracking once there is stock history", async () => {
      const c = await setup();
      const it = await make(c, { sku: "X1", openingStock: { quantity: "5", unitCost: "10" } });
      const edited = await items.update(c.companyId, user, it.id, { name: "Renamed", sellPrice: "400", reorderLevel: "3", category: "Feed" }, meta);
      expect(edited).toMatchObject({ name: "Renamed", sellPrice: "400.00", reorderLevel: "3", category: "Feed" });
      await expect(items.update(c.companyId, user, it.id, { unit: "kg" }, meta)).rejects.toThrow(/unit cannot change/);
      await expect(items.update(c.companyId, user, it.id, { trackStock: false }, meta)).rejects.toThrow(/tracking cannot change/);
      const fresh = await make(c, { sku: "X2" });
      expect((await items.update(c.companyId, user, fresh.id, { unit: "kg", trackStock: false }, meta)).trackStock).toBe(false);
      const off = await items.update(c.companyId, user, it.id, { isActive: false }, meta);
      expect(off.isActive).toBe(false);
    });

    it("finds items by barcode, SKU or part of the name, lists with filters, and keeps companies apart", async () => {
      const c = await setup();
      const other = await setup();
      await make(c, { sku: "FD-L1C", barcode: "6001", name: "Layer 1 C feed" });
      await make(c, { sku: "FD-BS", barcode: "6002", name: "Broiler starter" });
      await make(other, { sku: "FD-L1C", barcode: "6001", name: "Someone else's feed" }); // the same codes in another company are fine
      expect((await items.lookup(c.companyId, "6002")).exact).toMatchObject({ sku: "FD-BS" });
      expect((await items.lookup(c.companyId, "fd-l1c")).exact).toMatchObject({ sku: "FD-L1C" });
      const byName = await items.lookup(c.companyId, "starter");
      expect(byName.exact).toBeNull();
      expect(byName.matches.map((m) => m.sku)).toEqual(["FD-BS"]);
      expect((await items.lookup(c.companyId, "nothing like it")).matches).toHaveLength(0);
      expect((await items.list(c.companyId, { search: "feed" })).rows.map((r) => r.sku)).toEqual(["FD-L1C"]);
      expect((await items.list(c.companyId, {})).total).toBe(2);
      const lowOnes = await make(c, { sku: "LOW", reorderLevel: "10", openingStock: { quantity: "4", unitCost: "1" } });
      const low = await items.list(c.companyId, { lowStock: true });
      expect(low.rows.map((r) => r.sku)).toEqual(["LOW"]);
      expect(lowOnes.lowStock).toBe(true);
    });
  });

  describe("stock movements and average cost", () => {
    it("takes stock out at the weighted average of what was bought, and nothing is left behind at the end", async () => {
      const c = await setup();
      const it = await make(c, { sku: "AVG" });
      await inn(c, it.id, "10", "100"); // 10 @ 100 = 1,000
      await inn(c, it.id, "10", "120"); // 10 @ 120 = 1,200 -> 20 units worth 2,200, average 110
      expect((await items.get(c.companyId, it.id)).avgCost).toBe("110.00");
      const sale = await out(c, it.id, "5");
      expect(sale.valuePesewas).toBe(-55_000); // 5 x 110 = 550.00
      const after = await items.get(c.companyId, it.id);
      expect(after).toMatchObject({ qtyOnHand: "15.000", stockValue: "1650.00" });
      const rest = await out(c, it.id, "15");
      expect(rest.valuePesewas).toBe(-165_000); // the last 15 take exactly the 1,650.00 that is left
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "0.000", stockValue: "0.00" });
    });

    it("never leaves stray pesewas when the average does not divide evenly", async () => {
      const c = await setup();
      const it = await make(c, { sku: "ODD" });
      await inn(c, it.id, "3", "33.3333"); // worth 99.9999 -> 100.00
      const parts = [await out(c, it.id, "1"), await out(c, it.id, "1"), await out(c, it.id, "1")];
      expect(parts.map((p) => p.valuePesewas)).toEqual([-3_333, -3_334, -3_333]);
      expect(parts.reduce((s, p) => s + p.valuePesewas, 0)).toBe(-10_000);
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "0.000", stockValue: "0.00" });
    });

    it("blocks selling more than is in stock, and says how much there is", async () => {
      const c = await setup();
      const it = await make(c, { sku: "SHORT", name: "Egg tray", openingStock: { quantity: "4", unitCost: "50" } });
      await expect(out(c, it.id, "5")).rejects.toThrow(/Only 4.000 of Egg tray in stock, so 5.000 cannot be taken out/);
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "4.000", stockValue: "200.00" });
      expect(await prisma.finStockMovement.count({ where: { itemId: it.id } })).toBe(1); // only the opening stock
    });

    it("lets a person with the override sell below zero: what is held at its average, the rest at zero cost", async () => {
      const c = await setup();
      const it = await make(c, { sku: "NEG", openingStock: { quantity: "2", unitCost: "50" } });
      const m = await out(c, it.id, "5", { allowNegative: true });
      expect(m.valuePesewas).toBe(-10_000); // only the 2 we had are costed
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "-3.000", stockValue: "0.00" });
      await inn(c, it.id, "10", "60"); // a delivery brings it back up
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "7.000", stockValue: "600.00" });
    });

    it("is idempotent: the same business event moves stock only once", async () => {
      const c = await setup();
      const it = await make(c, { sku: "IDEM", openingStock: { quantity: "10", unitCost: "10" } });
      const key = { sourceModule: "POS_SALE", sourceId: "sale-1:1" };
      const first = await out(c, it.id, "3", key);
      const again = await out(c, it.id, "3", key);
      expect(first.created).toBe(true);
      expect(again).toMatchObject({ created: false, id: first.id, valuePesewas: first.valuePesewas });
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "7.000" });
    });

    it("two sellers racing for the last unit: exactly one gets it", async () => {
      const c = await setup();
      const it = await make(c, { sku: "RACE", openingStock: { quantity: "1", unitCost: "10" } });
      const results = await Promise.allSettled([out(c, it.id, "1"), out(c, it.id, "1"), out(c, it.id, "1"), out(c, it.id, "1")]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "0.000", stockValue: "0.00" });
    });

    it("the database keeps the movements permanent", async () => {
      const c = await setup();
      const it = await make(c, { sku: "PERM", openingStock: { quantity: "5", unitCost: "10" } });
      const sale = await out(c, it.id, "1");
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_stock_movements SET quantity = 99 WHERE id = '${sale.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_stock_movements WHERE id = '${sale.id}'`)).rejects.toThrow(/cannot be deleted/);
      // linking to a ledger entry is allowed once, and only that
      await prisma.$executeRawUnsafe(`UPDATE fin_stock_movements SET journalEntryId = 'je-1' WHERE id = '${sale.id}'`);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_stock_movements SET journalEntryId = 'je-2' WHERE id = '${sale.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_items WHERE id = '${it.id}'`)).rejects.toThrow(/cannot be deleted/);
      const bare = await make(c, { sku: "BARE" });
      await prisma.$executeRawUnsafe(`DELETE FROM fin_items WHERE id = '${bare.id}'`); // an item nobody used can go
    });
  });

  describe("stock adjustments", () => {
    it("a stock count that finds more posts a gain; one that finds less posts a loss; both balance", async () => {
      const c = await setup();
      const it = await make(c, { sku: "CNT", openingStock: { quantity: "100", unitCost: "10" } }); // 1,000.00
      const gain = await items.adjust(c.companyId, user, { itemId: it.id, date: today(), newQuantity: "105", reason: "Count found 5 more" }, meta);
      expect(gain).toMatchObject({ quantityChange: "5.000", valueChange: "50.00" }); // at the average cost
      expect(await bal(c, "1390")).toBe(1_050);
      expect(await bal(c, "5300")).toBe(-50); // Stock Adjustments: a credit (gain)
      const loss = await items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "-10", reason: "Damaged in the store" }, meta);
      expect(loss).toMatchObject({ quantityChange: "-10.000", valueChange: "-100.00" });
      expect(await bal(c, "1390")).toBe(950);
      expect(await bal(c, "5300")).toBe(50); // net loss of 50
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "95.000", stockValue: "950.00" });
      const entries = await prisma.finJournalEntry.findMany({ where: { companyId: c.companyId, status: "POSTED" } });
      for (const e of entries) expect(e.totalDebit.toString()).toBe(e.totalCredit.toString());
      expect((await prisma.finAuditLog.findMany({ where: { companyId: c.companyId, action: "ADJUST_STOCK" } })).length).toBe(2);
    });

    it("needs a cost to bring stock up from zero, and refuses nonsense", async () => {
      const c = await setup();
      const it = await make(c, { sku: "EMPTY" });
      await expect(items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "5", reason: "found" }, meta)).rejects.toThrow(/Enter the cost per unit/);
      const ok = await items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "5", unitCost: "12.5", reason: "found" }, meta);
      expect(ok.valueChange).toBe("62.50");
      await expect(items.adjust(c.companyId, user, { itemId: it.id, date: today(), reason: "x1" } as never, meta)).rejects.toThrow(/either the change/);
      await expect(items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "1", newQuantity: "2", reason: "x1" } as never, meta)).rejects.toThrow(/either the change/);
      await expect(items.adjust(c.companyId, user, { itemId: it.id, date: today(), newQuantity: "5", reason: "same" }, meta)).rejects.toThrow(/nothing to adjust/);
      await expect(items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "-6", reason: "too many" }, meta)).rejects.toThrow(/Only 5.000/);
      await expect(items.adjust(c.companyId, user, { itemId: it.id, date: today(), newQuantity: "-1", reason: "neg" }, meta)).rejects.toThrow(/cannot be negative/);
      expect(await prisma.finStockMovement.count({ where: { itemId: it.id } })).toBe(1);
    });

    it("respects a closed accounting period and rolls everything back", async () => {
      const c = await setup();
      const it = await make(c, { sku: "LOCK", openingStock: { quantity: "5", unitCost: "10" } });
      await ledger.setLock(c.companyId, user, today(), "month end", meta).catch(() => undefined);
      const yesterday = dayString(new Date(parseDay(new Date()).getTime() - 86_400_000));
      await ledger.setLock(c.companyId, user, yesterday, "month end", meta);
      await expect(items.adjust(c.companyId, user, { itemId: it.id, date: yesterday, quantityChange: "-1", reason: "late count" }, meta)).rejects.toThrow(/books are closed/);
      expect(await items.get(c.companyId, it.id)).toMatchObject({ qtyOnHand: "5.000", stockValue: "50.00" }); // the stock did not move either
    });

    it("uses an item's own inventory account when it has one", async () => {
      const c = await setup();
      const feedStock = await c.acc("1320"); // Finished Feed
      const it = await make(c, { sku: "OWN", inventoryAccountId: feedStock, openingStock: { quantity: "2", unitCost: "100" } });
      expect(await bal(c, "1320")).toBe(200);
      expect(await bal(c, "1390")).toBe(0);
      await items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "-1", reason: "spoiled" }, meta);
      expect(await bal(c, "1320")).toBe(100);
    });
  });

  describe("CSV import", () => {
    const csv = (rows: string[]) => ["sku,name,barcode,type,unit,category,price,price_includes_tax,tax_code,track_stock,reorder_level,qty,cost", ...rows].join("\n");

    it("previews without changing anything, then creates items with opening stock under ONE journal entry", async () => {
      const c = await setup();
      const text = csv(["FD-L1C,Layer 1 C feed,600100,goods,bag,Feed,336,yes,,yes,20,100,310", "FD-BS,Broiler starter,600200,goods,bag,Feed,360,yes,,yes,10,50,300", "DEL,Delivery,,service,each,Services,50,yes,,,,,"]);
      const preview = await items.previewImport(c.companyId, { csv: text });
      expect(preview).toMatchObject({ total: 3, toCreate: 3, toUpdate: 0, errors: 0 });
      expect(await prisma.finItem.count({ where: { companyId: c.companyId } })).toBe(0);
      const res = await items.commitImport(c.companyId, user, { csv: text, openingDate: today() }, meta);
      expect(res).toEqual({ created: 3, updated: 0, skipped: 0, openingValue: "46000.00" }); // 100x310 + 50x300
      expect(await prisma.finItem.count({ where: { companyId: c.companyId } })).toBe(3);
      expect(await bal(c, "1390")).toBe(46_000);
      expect(await bal(c, "3900")).toBe(-46_000);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, type: "OPENING" } })).toBe(1);
      const movements = await prisma.finStockMovement.findMany({ where: { companyId: c.companyId } });
      expect(movements).toHaveLength(2);
      expect(movements.every((m) => m.journalEntryId)).toBe(true);
      expect((await prisma.finItem.findFirstOrThrow({ where: { companyId: c.companyId, sku: "DEL" } })).trackStock).toBe(false);
    });

    it("updates existing items by SKU without touching their stock, and says opening stock was ignored", async () => {
      const c = await setup();
      const it = await make(c, { sku: "FD-L1C", openingStock: { quantity: "10", unitCost: "100" } });
      const text = csv(["fd-l1c,Layer 1 C feed (new name),,goods,bag,Feed,350,yes,,yes,5,999,1"]);
      const preview = await items.previewImport(c.companyId, { csv: text });
      expect(preview).toMatchObject({ toUpdate: 1, toCreate: 0 });
      expect(preview.plans[0].warnings[0]).toMatch(/Opening stock is ignored/);
      await items.commitImport(c.companyId, user, { csv: text }, meta);
      expect(await items.get(c.companyId, it.id)).toMatchObject({ name: "Layer 1 C feed (new name)", sellPrice: "350.00", qtyOnHand: "10.000", stockValue: "1000.00" });
    });

    it("reports every bad row, imports nothing unless told to skip them, and never half-imports", async () => {
      const c = await setup();
      await make(c, { sku: "TAKEN", barcode: "777" });
      const text = csv(["GOOD1,Good one,,goods,each,,10,yes,,yes,,,", ",No sku,,goods,each,,10,yes,,yes,,,", "BAD2,X,,goods,each,,10,yes,,yes,,,", "BAD3,Has bad price,,goods,each,,abc,yes,,yes,,,", "BAD4,Barcode taken,777,goods,each,,10,yes,,yes,,,", "BAD5,Bad tax code,,goods,each,,10,yes,NOPE,yes,,,", "BAD6,Needs cost,,goods,each,,10,yes,,yes,,5,", "GOOD1,Same sku twice,,goods,each,,10,yes,,yes,,,"]);
      const preview = await items.previewImport(c.companyId, { csv: text });
      expect(preview.errors).toBe(7);
      expect(preview.plans.filter((p) => p.action === "error").map((p) => p.messages[0])).toEqual([
        expect.stringMatching(/SKU is empty/), expect.stringMatching(/name is empty/), expect.stringMatching(/not a valid number/), expect.stringMatching(/barcode 777 already belongs to TAKEN/),
        expect.stringMatching(/"NOPE" is not an active sales tax code/), expect.stringMatching(/needs an opening_unit_cost/), expect.stringMatching(/GOOD1 appears twice/)
      ]);
      await expect(items.commitImport(c.companyId, user, { csv: text }, meta)).rejects.toThrow(/7 row\(s\) have problems, so nothing was imported/);
      expect(await prisma.finItem.count({ where: { companyId: c.companyId } })).toBe(1);
      const done = await items.commitImport(c.companyId, user, { csv: text, skipBadRows: true }, meta);
      expect(done).toMatchObject({ created: 1, skipped: 7 });
      expect(await prisma.finItem.count({ where: { companyId: c.companyId } })).toBe(2);
    });

    it("exports to a file that imports straight back, and ships a template", async () => {
      const c = await setup();
      await make(c, { sku: "EXP-1", name: "Exported", barcode: "888", sellPrice: "12.5" });
      const file = await items.exportCsv(c.companyId);
      expect(file).toContain("EXP-1");
      const again = await items.previewImport(c.companyId, { csv: file.slice(1) });
      expect(again).toMatchObject({ total: 1, toUpdate: 1, errors: 0 });
      expect(items.templateCsv()).toContain("opening_unit_cost");
    });
  });

  describe("valuation", () => {
    it("adds up to the inventory account in the ledger, as at any date", async () => {
      const c = await setup();
      const a = await make(c, { sku: "V1", openingStock: { quantity: "10", unitCost: "100" } });
      await make(c, { sku: "V2", openingStock: { quantity: "4", unitCost: "25.5" } });
      await out(c, a.id, "2");
      const v = await items.valuation(c.companyId, {});
      expect(v.rows.map((r) => [r.sku, r.quantity, r.value, r.avgCost])).toEqual([["V1", "8.000", "800.00", "100.00"], ["V2", "4.000", "102.00", "25.50"]]);
      expect(v.totalValue).toBe("902.00");
      // the sale above moved stock but has no journal in this test, so the ledger still holds the opening value
      expect(v.ledgerInventoryBalance).toBe("1102.00");
      expect(v.difference).toBe("200.00");
      const earlier = await items.valuation(c.companyId, { asOf: dayString(new Date(parseDay(new Date()).getTime() - 5 * 86_400_000)) });
      expect(earlier.totalValue).toBe("0.00"); // nothing existed five days ago
      expect((await items.valuation(c.companyId, { includeZero: "true" })).rows).toHaveLength(2);
    });

    it("ties out exactly when every movement has its journal, and shows a manual journal to Inventory as a difference", async () => {
      const c = await setup();
      const it = await make(c, { sku: "TIE", openingStock: { quantity: "10", unitCost: "10" } });
      await items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "-2", reason: "count" }, meta);
      let v = await items.valuation(c.companyId, {});
      expect([v.totalValue, v.ledgerInventoryBalance, v.difference]).toEqual(["80.00", "80.00", "0.00"]);
      await ledger.post({ companyId: c.companyId, userId: user, entryDate: today(), description: "Manual stock entry", lines: [{ role: "inventory", debit: "25" }, { role: "opening_equity", credit: "25" }] });
      v = await items.valuation(c.companyId, {});
      expect(v.difference).toBe("25.00");
    });

    it("lists the movement history of an item, newest first, with filters", async () => {
      const c = await setup();
      const it = await make(c, { sku: "HIST", openingStock: { quantity: "10", unitCost: "10" } });
      await items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "-1", reason: "one" }, meta);
      await items.adjust(c.companyId, user, { itemId: it.id, date: today(), quantityChange: "2", unitCost: "11", reason: "two" }, meta);
      const all = await items.movements(c.companyId, { itemId: it.id });
      expect(all.total).toBe(3);
      expect(all.rows[0]).toMatchObject({ type: "ADJUSTMENT", quantity: "2.000", sku: "HIST" });
      expect((await items.movements(c.companyId, { itemId: it.id, type: "OPENING" })).total).toBe(1);
      expect((await items.get(c.companyId, it.id)).recentMovements).toHaveLength(3);
    });
  });
});
