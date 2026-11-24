/**
 * Finance v2 POS tests (real MySQL/MariaDB with all fin migrations applied, triggers included):
 *   FIN_TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3398/fintest npx jest --runInBand src/modules/fin
 * Every test builds its own company (chart, tax code, items, tills), so tests never see each other's data.
 */
import { randomUUID } from "crypto";
import { ForbiddenException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { FinAccountsService } from "./fin-accounts.service";
import { FinAuditService } from "./fin-audit.service";
import { FinItemsService } from "./fin-items.service";
import { FinLedgerService, dayString } from "./fin-ledger.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinPaymentAccountsService, ledgerBalancePesewas } from "./fin-payment-accounts.service";
import { FinLinksService } from "./fin-links.service";
import { FinPosReceiptService } from "./fin-pos-receipt.service";
import { FinPosService, PosUser } from "./fin-pos.service";
import { FinSettingsService } from "./fin-settings.service";
import { allocate, checkPayments, computeCart, percentOf } from "./fin-pos-math";
import { FinReportsService } from "./fin-reports.service";
import { FinStockService } from "./fin-stock.service";
import { FinTaxService } from "./fin-tax.service";

const URL = process.env.FIN_TEST_DATABASE_URL;
const maybe = URL ? describe : describe.skip;

describe("till arithmetic", () => {
  it("splits tax OUT of a tax-inclusive price, and adds it on top of a tax-exclusive one", () => {
    const inc = computeCart([{ qtyMilli: 2000, unitPesewas: 11_500, discountPesewas: 0, taxRatePercent: "15", priceIncludesTax: true }], 0);
    expect(inc).toMatchObject({ subtotal: 20_000, taxTotal: 3_000, total: 23_000, discountTotal: 0 });
    const exc = computeCart([{ qtyMilli: 2000, unitPesewas: 10_000, discountPesewas: 0, taxRatePercent: "15", priceIncludesTax: false }], 0);
    expect(exc).toMatchObject({ subtotal: 20_000, taxTotal: 3_000, total: 23_000 });
    const none = computeCart([{ qtyMilli: 3000, unitPesewas: 5_500, discountPesewas: 0, taxRatePercent: "0", priceIncludesTax: true }], 0);
    expect(none).toMatchObject({ subtotal: 16_500, taxTotal: 0, total: 16_500 });
  });
  it("applies line discounts, then shares an overall discount across lines to the pesewa", () => {
    const cart = computeCart(
      [
        { qtyMilli: 1000, unitPesewas: 10_000, discountPesewas: 1_000, taxRatePercent: "0", priceIncludesTax: true },
        { qtyMilli: 1000, unitPesewas: 3_333, discountPesewas: 0, taxRatePercent: "0", priceIncludesTax: true },
        { qtyMilli: 1000, unitPesewas: 3_333, discountPesewas: 0, taxRatePercent: "0", priceIncludesTax: true }
      ],
      1_000
    );
    expect(cart.lines.map((l) => l.share).reduce((s, x) => s + x, 0)).toBe(1_000);
    expect(cart.total).toBe(9_000 + 3_333 + 3_333 - 1_000);
    expect(cart.discountTotal).toBe(2_000);
    expect(() => computeCart([{ qtyMilli: 1000, unitPesewas: 100, discountPesewas: 200, taxRatePercent: "0", priceIncludesTax: true }], 0)).toThrow(/more than the line costs/);
    expect(() => computeCart([{ qtyMilli: 1000, unitPesewas: 100, discountPesewas: 0, taxRatePercent: "0", priceIncludesTax: true }], 101)).toThrow(/more than the sale costs/);
  });
  it("allocates exactly, giving leftover pesewas to the largest remainders", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(100, [1, 1, 1]).reduce((s, x) => s + x, 0)).toBe(100);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
    expect(percentOf(23_000, "10")).toBe(2_300);
    expect(percentOf(1_001, "50")).toBe(501);
    expect(() => percentOf(100, "100.5")).toThrow(/at most 2 decimals|more than 100/);
    expect(() => percentOf(100, "101")).toThrow(/more than 100%/);
  });
  it("checks a split payment and works out the change; only cash can be over", () => {
    expect(checkPayments(23_000, [{ method: "CASH", amount: 13_000, tendered: 15_000 }, { method: "CARD", amount: 10_000, tendered: 10_000 }])).toEqual({ paid: 23_000, tendered: 25_000, change: 2_000 });
    expect(() => checkPayments(23_000, [{ method: "CASH", amount: 10_000, tendered: 10_000 }])).toThrow(/less than the sale \(short by 130.00\)/);
    expect(() => checkPayments(23_000, [{ method: "CASH", amount: 25_000, tendered: 25_000 }])).toThrow(/more than the sale \(over by 20.00\)/);
    expect(() => checkPayments(10_000, [{ method: "MOMO", amount: 10_000, tendered: 12_000 }])).toThrow(/Only cash can be handed over in excess/);
    expect(() => checkPayments(10_000, [{ method: "CASH", amount: 10_000, tendered: 9_000 }])).toThrow(/less than the payment/);
    expect(() => checkPayments(10_000, [])).toThrow(/at least one payment/);
  });
});

maybe("finance v2 POS (real database)", () => {
  let prisma: PrismaClient;
  let chart: FinAccountsService;
  let ledger: FinLedgerService;
  let items: FinItemsService;
  let stock: FinStockService;
  let pos: FinPosService;
  let tax: FinTaxService;
  let reports: FinReportsService;
  let payAccounts: FinPaymentAccountsService;
  let receipts: FinPosReceiptService;
  let links: FinLinksService;
  const keepSecret = process.env.FIN_LINK_SECRET;
  const meta = { ipAddress: "127.0.0.1", userAgent: "jest" };
  const cashier: PosUser = { id: "cashier-1", fullName: "Ama Cashier", companyId: "" };
  const cashier2: PosUser = { id: "cashier-2", fullName: "Kojo Cashier", companyId: "" };
  const NORMAL = { supervisor: false };
  const BOSS = { supervisor: true };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$connect();
    const p = prisma as never;
    const audit = new FinAuditService(p);
    const numbering = new FinNumberingService(p, audit);
    chart = new FinAccountsService(p, audit);
    ledger = new FinLedgerService(p, numbering, audit);
    tax = new FinTaxService(p, audit);
    reports = new FinReportsService(p);
    payAccounts = new FinPaymentAccountsService(p, audit);
    stock = new FinStockService(p);
    items = new FinItemsService(p, audit, ledger, stock);
    pos = new FinPosService(p, audit, ledger, numbering, stock, tax);
    process.env.FIN_LINK_SECRET = "pos-test-secret-long-enough-for-hmac";
    links = new FinLinksService();
    receipts = new FinPosReceiptService(p, pos, new FinSettingsService(p, audit, numbering), links);
  });
  afterAll(async () => {
    if (keepSecret === undefined) delete process.env.FIN_LINK_SECRET;
    else process.env.FIN_LINK_SECRET = keepSecret;
    await prisma.$disconnect();
  });

  // ─── helpers ────────────────────────────────────────────────────────────────

  async function setup() {
    const companyId = randomUUID();
    const admin = "admin-1";
    await chart.applyTemplate(companyId, admin, meta);
    await prisma.finAccount.updateMany({ where: { companyId, code: "2180" }, data: { isActive: true } }); // tax payable is off in a new chart
    const vat = await tax.create(companyId, admin, { code: "VAT", name: "VAT", ratePercent: "15", effectiveFrom: "2026-01-01" }, meta);
    const mk = (name: string, type: "CASH" | "BANK" | "MOBILE_MONEY") => payAccounts.create(companyId, admin, { name, type, createLedgerAccount: true }, meta);
    const drawer = await mk("Till 1 drawer", "CASH");
    const drawer2 = await mk("Till 2 drawer", "CASH");
    const safe = await mk("Office safe", "CASH");
    const momo = await mk("MTN MoMo", "MOBILE_MONEY");
    const card = await mk("Card settlement", "BANK");
    await pos.updateSettings(companyId, admin, { momoPaymentAccountId: momo.id, cardPaymentAccountId: card.id, floatSourceAccountId: safe.id, maxDiscountPercent: "10", refundApprovalAbove: "100" }, meta);
    const reg = await pos.createRegister(companyId, admin, { name: "Till 1", cashAccountId: drawer.id }, meta);
    const reg2 = await pos.createRegister(companyId, admin, { name: "Till 2", cashAccountId: drawer2.id }, meta);
    const mkItem = (over: object) => items.create(companyId, admin, { unit: "bag", ...over } as never, meta);
    const feed = await mkItem({ sku: "FD-L1C", name: "Layer 1 C feed", sellPrice: "115", taxCodeId: vat.id, barcode: "6001", openingStock: { quantity: "100", unitCost: "60" } }); // 115 incl 15% -> 100 + 15
    const eggs = await mkItem({ sku: "EGG-30", name: "Egg tray of 30", unit: "tray", sellPrice: "55", barcode: "6002", openingStock: { quantity: "50", unitCost: "40" } }); // no tax
    const plus = await mkItem({ sku: "PLUS", name: "Medicine (plus tax)", sellPrice: "100", priceIncludesTax: false, taxCodeId: vat.id, openingStock: { quantity: "10", unitCost: "30" } });
    const acc = async (code: string) => (await prisma.finAccount.findFirstOrThrow({ where: { companyId, code } })).id;
    return { companyId, admin, vat, drawer, drawer2, safe, momo, card, reg, reg2, feed, eggs, plus, acc, user: { ...cashier, companyId }, user2: { ...cashier2, companyId } };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  const open = (c: Ctx, float = "100", who = c.user, reg = c.reg) => pos.openSession(c.companyId, who, { registerId: reg.id, openingFloat: float }, meta);
  /** Ledger balance of an account by code, in cedis (debit positive). */
  const bal = async (c: Ctx, code: string) => (await ledgerBalancePesewas(prisma as never, c.companyId, await c.acc(code))) / 100;
  const payBal = async (c: Ctx, pa: { ledgerAccount: { id: string } }) => (await ledgerBalancePesewas(prisma as never, c.companyId, pa.ledgerAccount.id)) / 100;
  const key = () => `key-${randomUUID()}`;
  const sell = (c: Ctx, lines: object[], payments: object[], extra: object = {}, who = c.user, powers = NORMAL) =>
    pos.sell(c.companyId, who, { clientKey: key(), lines, payments, ...extra } as never, powers, meta);
  const cash = (amount: string, tendered?: string) => ({ method: "CASH", amount, ...(tendered ? { tendered } : {}) });
  const item = (c: Ctx, sku: "feed" | "eggs" | "plus", quantity = "1", over: object = {}) => ({ itemId: c[sku].id, quantity, ...over });
  const stockOf = async (id: string) => (await items.get((await prisma.finItem.findUniqueOrThrow({ where: { id } })).companyId, id)).qtyOnHand;
  const balanced = async (c: Ctx) => {
    expect((await reports.trialBalance(c.companyId, { asOf: dayString(new Date(Date.now() + 86_400_000)) })).balanced).toBe(true);
    for (const e of await prisma.finJournalEntry.findMany({ where: { companyId: c.companyId, status: { in: ["POSTED", "REVERSED"] } } })) expect(e.totalDebit.toString()).toBe(e.totalCredit.toString());
  };

  // ─── tills ──────────────────────────────────────────────────────────────────

  describe("tills", () => {
    it("opens with a float taken from the safe, and refuses a second open till for the same person or the same till", async () => {
      const c = await setup();
      await payAccounts.get(c.companyId, c.safe.id); // exists
      const s = await open(c, "200");
      expect(s).toMatchObject({ status: "OPEN", openingFloat: "200.00", registerName: "Till 1", cashierName: "Ama Cashier", expectedCash: "200.00" });
      expect(s.number).toMatch(/^TILL-\d{4}-0001$/);
      expect(await payBal(c, c.drawer)).toBe(200);
      expect(await payBal(c, c.safe)).toBe(-200);
      await expect(open(c, "50")).rejects.toThrow(/You already have Till 1 open/);
      await expect(open(c, "50", c.user2)).rejects.toThrow(/Till 1 is already open/);
      const second = await open(c, "0", c.user2, c.reg2);
      expect(second.openingFloat).toBe("0.00");
      expect((await pos.registers(c.companyId)).find((r) => r.id === c.reg.id)!.openSession).toMatchObject({ cashierName: "Ama Cashier" });
      expect((await pos.currentSession(c.companyId, c.user.id))!.id).toBe(s.id);
      expect(await pos.currentSession(c.companyId, "nobody")).toBeNull();
      await balanced(c);
    });

    it("cannot sell or refund without an open till, and never after it closes", async () => {
      const c = await setup();
      await expect(sell(c, [item(c, "eggs")], [cash("55")])).rejects.toThrow(/Open your till before selling/);
      const s = await open(c, "0");
      await sell(c, [item(c, "eggs")], [cash("55")]);
      await pos.closeSession(c.companyId, c.user, s.id, { countedCash: "55" }, NORMAL, meta);
      await expect(sell(c, [item(c, "eggs")], [cash("55")])).rejects.toThrow(/Open your till before selling/);
    });

    it("closing with the exact cash posts no variance; expected cash is float + cash sales - cash refunds, and ignores MoMo and card", async () => {
      const c = await setup();
      const s = await open(c, "100");
      await sell(c, [item(c, "feed", "2")], [cash("230")]); // +230 cash
      await sell(c, [item(c, "eggs", "2")], [{ method: "MOMO", amount: "110" }]); // not cash
      await sell(c, [item(c, "eggs")], [{ method: "CARD", amount: "55" }]); // not cash
      const live = await pos.getSession(c.companyId, s.id);
      expect(live.expectedCash).toBe("330.00");
      expect(live.totals).toMatchObject({ sales: 3, salesTotal: "395.00", cash: "230.00", momo: "110.00", card: "55.00" });
      const closed = await pos.closeSession(c.companyId, c.user, s.id, { countedCash: "330", note: "All good" }, NORMAL, meta);
      expect(closed).toMatchObject({ status: "CLOSED", expectedCash: "330.00", countedCash: "330.00", variance: "0.00", closeNote: "All good" });
      expect(await bal(c, "6730")).toBe(0);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_POS_VARIANCE" } })).toBe(0);
      await expect(pos.closeSession(c.companyId, c.user, s.id, { countedCash: "330" }, NORMAL, meta)).rejects.toThrow(/already closed/);
    });

    it("TILL VARIANCE: cash over is credited and cash short is expensed to Cash Over / Short, against the drawer", async () => {
      const c = await setup();
      const over = await open(c, "100");
      await sell(c, [item(c, "eggs", "2")], [cash("110")]); // expected 210
      const closedOver = await pos.closeSession(c.companyId, c.user, over.id, { countedCash: "215.50" }, NORMAL, meta);
      expect(closedOver).toMatchObject({ expectedCash: "210.00", countedCash: "215.50", variance: "5.50" });
      expect(await payBal(c, c.drawer)).toBe(215.5); // the books now agree with the count
      expect(await bal(c, "6730")).toBe(-5.5); // a credit: income
      const entry = await prisma.finJournalEntry.findFirstOrThrow({ where: { companyId: c.companyId, sourceModule: "FIN_POS_VARIANCE" }, include: { lines: { include: { account: true } } } });
      expect(entry.lines.map((l) => [l.account.code, l.debit.toString(), l.credit.toString()]).sort()).toEqual([["1121", "5.5", "0"], ["6730", "0", "5.5"]]); // Dr the till's drawer, Cr Cash Over / Short

      const short = await open(c, "0", c.user2, c.reg2);
      await sell(c, [item(c, "eggs", "2")], [cash("110")], {}, c.user2); // expected 110
      const closedShort = await pos.closeSession(c.companyId, c.user2, short.id, { countedCash: "100" }, NORMAL, meta);
      expect(closedShort).toMatchObject({ expectedCash: "110.00", countedCash: "100.00", variance: "-10.00" });
      expect(await payBal(c, c.drawer2)).toBe(100);
      expect(await bal(c, "6730")).toBe(4.5); // -5.50 + 10.00: a net shortage
      await balanced(c);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_pos_sessions SET countedCash = 999 WHERE id = '${over.id}'`)).rejects.toThrow(/closed till session is final/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_pos_sessions WHERE id = '${over.id}'`)).rejects.toThrow(/cannot be deleted/);
    });

    it("only the cashier or a supervisor can close a till, and a count cannot be negative", async () => {
      const c = await setup();
      const s = await open(c, "0");
      await expect(pos.closeSession(c.companyId, c.user2, s.id, { countedCash: "0" }, NORMAL, meta)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(pos.closeSession(c.companyId, c.user, s.id, { countedCash: "-1" }, NORMAL, meta)).rejects.toThrow(/cannot be negative/);
      expect((await pos.closeSession(c.companyId, c.user2, s.id, { countedCash: "0" }, BOSS, meta)).status).toBe("CLOSED");
    });

    it("registers need their own cash drawer, and settings are validated", async () => {
      const c = await setup();
      await expect(pos.createRegister(c.companyId, c.admin, { name: "Till 3", cashAccountId: c.drawer.id }, meta)).rejects.toThrow(/already uses that cash account/);
      await expect(pos.createRegister(c.companyId, c.admin, { name: "Till 3", cashAccountId: c.momo.id }, meta)).rejects.toThrow(/cash payment account/);
      await expect(pos.createRegister(c.companyId, c.admin, { name: "Till 1", cashAccountId: c.safe.id }, meta)).rejects.toThrow(/already exists/);
      await expect(pos.updateSettings(c.companyId, c.admin, { momoPaymentAccountId: randomUUID() }, meta)).rejects.toThrow(/active payment account/);
      await expect(pos.updateSettings(c.companyId, c.admin, { maxDiscountPercent: "101" }, meta)).rejects.toThrow(/between 0 and 100/);
      const s = await open(c, "0");
      await expect(pos.updateRegister(c.companyId, c.admin, c.reg.id, { isActive: false }, meta)).rejects.toThrow(/open session/);
      await pos.closeSession(c.companyId, c.user, s.id, { countedCash: "0" }, NORMAL, meta);
      expect((await pos.updateRegister(c.companyId, c.admin, c.reg.id, { isActive: false }, meta)).isActive).toBe(false);
      await expect(open(c, "0")).rejects.toThrow(/active till/);
    });
  });

  // ─── sales ──────────────────────────────────────────────────────────────────

  describe("sale posting", () => {
    it("posts payment, sales, tax, cost of goods and stock in ONE balanced entry, and takes the stock out", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "feed", "2")], [cash("230")]);
      expect(sale).toMatchObject({ status: "COMPLETE", subtotal: "200.00", taxTotal: "30.00", total: "230.00", tendered: "230.00", changeGiven: "0.00", discountTotal: "0.00", customerName: null });
      expect(sale.number).toMatch(/^POS-\d{4}-0001$/);
      expect(sale.lines[0]).toMatchObject({ quantity: "2.000", unitPrice: "115.00", lineNet: "200.00", lineTax: "30.00", lineTotal: "230.00", taxRatePercent: "15.0000" });
      expect(await payBal(c, c.drawer)).toBe(230);
      expect(await bal(c, "4500")).toBe(-200); // General Sales
      expect(await bal(c, "2180")).toBe(-30); // tax payable
      expect(await bal(c, "5100")).toBe(120); // COGS: 2 x 60
      expect(await bal(c, "1390")).toBe(8_300 - 120); // inventory: 100 x 60 feed + 50 x 40 eggs + 10 x 30 plus = 6000+2000+300, less the 120 sold
      expect(await stockOf(c.feed.id)).toBe("98.000");
      const entries = await prisma.finJournalEntry.findMany({ where: { companyId: c.companyId, sourceModule: "FIN_POS_SALE" } });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(sale.journalEntryId);
      const move = await prisma.finStockMovement.findFirstOrThrow({ where: { itemId: c.feed.id, type: "SALE" } });
      expect(move).toMatchObject({ journalEntryId: sale.journalEntryId, sourceModule: "FIN_POS_SALE" });
      expect(Number(move.value)).toBe(-120);
      expect((await prisma.finPosSale.findUniqueOrThrow({ where: { id: sale.id } })).costTotal.toString()).toBe("120");
      await balanced(c);
    });

    it("adds tax on top of a tax-exclusive item, and sells an untaxed item with no tax line", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "plus", "1"), item(c, "eggs", "1")], [cash("170")]); // 100 + 15 tax, plus 55
      expect(sale).toMatchObject({ subtotal: "155.00", taxTotal: "15.00", total: "170.00" });
      expect(await bal(c, "2180")).toBe(-15);
      expect(await bal(c, "4500")).toBe(-155);
    });

    it("SPLIT PAYMENT: cash with change, MoMo and card each go to their own account", async () => {
      const c = await setup();
      await open(c, "0");
      // total 345 = 3 feed (115 each): cash 100 (customer hands over 150), MoMo 120, card 125
      const sale = await sell(c, [item(c, "feed", "3")], [cash("100", "150"), { method: "MOMO", amount: "120", reference: "MoMo 4471" }, { method: "CARD", amount: "125" }]);
      expect(sale).toMatchObject({ total: "345.00", tendered: "395.00", changeGiven: "50.00" });
      expect(sale.payments.map((p) => [p.method, p.amount, p.tendered, p.reference])).toEqual([["CASH", "100.00", "150.00", null], ["MOMO", "120.00", "120.00", "MoMo 4471"], ["CARD", "125.00", "125.00", null]]);
      expect(await payBal(c, c.drawer)).toBe(100); // only what stayed in the drawer: the change went back to the customer
      expect(await payBal(c, c.momo)).toBe(120);
      expect(await payBal(c, c.card)).toBe(125);
      await balanced(c);
    });

    it("refuses payments that do not add up, and a missing MoMo or card account, without changing anything", async () => {
      const c = await setup();
      await open(c, "0");
      await expect(sell(c, [item(c, "eggs")], [cash("50")])).rejects.toThrow(/less than the sale \(short by 5.00\)/);
      await expect(sell(c, [item(c, "eggs")], [cash("60")])).rejects.toThrow(/more than the sale/);
      await expect(sell(c, [item(c, "eggs")], [{ method: "MOMO", amount: "55", tendered: "60" }])).rejects.toThrow(/Only cash can be handed over in excess/);
      await prisma.finPosSettings.update({ where: { companyId: c.companyId }, data: { momoPaymentAccountId: null } });
      await expect(sell(c, [item(c, "eggs")], [{ method: "MOMO", amount: "55" }])).rejects.toThrow(/Choose the MoMo account under POS settings/);
      expect(await prisma.finPosSale.count({ where: { companyId: c.companyId } })).toBe(0);
      expect(await stockOf(c.eggs.id)).toBe("50.000");
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_POS_SALE" } })).toBe(0);
    });

    it("walk-in by default; a chosen customer is recorded; a switched-off customer is refused", async () => {
      const c = await setup();
      await open(c, "0");
      const customer = await prisma.finContact.create({ data: { companyId: c.companyId, code: "CUS-1", name: "Efua Asare", isCustomer: true, isSupplier: false } });
      const walk = await sell(c, [item(c, "eggs")], [cash("55")]);
      expect(walk).toMatchObject({ contactId: null, customerName: null });
      const named = await sell(c, [item(c, "eggs")], [cash("55")], { contactId: customer.id });
      expect(named).toMatchObject({ contactId: customer.id, customerName: "Efua Asare" });
      const typed = await sell(c, [item(c, "eggs")], [cash("55")], { customerName: "Mr Mensah, Kasoa" });
      expect(typed.customerName).toBe("Mr Mensah, Kasoa");
      await prisma.finContact.update({ where: { id: customer.id }, data: { isActive: false } });
      await expect(sell(c, [item(c, "eggs")], [cash("55")], { contactId: customer.id })).rejects.toThrow(/active customer/);
    });

    it("IDEMPOTENT: pressing Pay twice (same key) makes one sale, one stock movement and one ledger entry", async () => {
      const c = await setup();
      await open(c, "0");
      const k = key();
      const run = () => pos.sell(c.companyId, c.user, { clientKey: k, lines: [item(c, "feed", "1")], payments: [cash("115")] } as never, NORMAL, meta);
      const results = await Promise.allSettled([run(), run(), run()]);
      expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
      const again = await run();
      expect(await prisma.finPosSale.count({ where: { companyId: c.companyId } })).toBe(1);
      expect(await prisma.finStockMovement.count({ where: { itemId: c.feed.id, type: "SALE" } })).toBe(1);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_POS_SALE" } })).toBe(1);
      expect(again.id).toBe((await prisma.finPosSale.findFirstOrThrow({ where: { companyId: c.companyId } })).id);
      expect(await stockOf(c.feed.id)).toBe("99.000");
    });

    it("an extra charge (delivery) is a line with no stock; a service item has no stock to take out", async () => {
      const c = await setup();
      await open(c, "0");
      const svc = await items.create(c.companyId, c.admin, { sku: "DEL", name: "Delivery", kind: "SERVICE", unit: "each", sellPrice: "30" } as never, meta);
      const sale = await sell(c, [item(c, "eggs"), { description: "Delivery to Kasoa", quantity: "1", unitPrice: "20", isCharge: true }, { itemId: svc.id, quantity: "1" }], [cash("105")]);
      expect(sale.total).toBe("105.00");
      expect(sale.lines.map((l) => [l.description, l.isCharge, l.lineTotal])).toEqual([["Egg tray of 30", false, "55.00"], ["Delivery to Kasoa", true, "20.00"], ["Delivery", false, "30.00"]]);
      expect(await prisma.finStockMovement.count({ where: { companyId: c.companyId, type: "SALE" } })).toBe(1); // only the eggs
      await expect(sell(c, [{ description: "Nothing", quantity: "1", isCharge: true }], [cash("1")])).rejects.toThrow(/needs a price/);
      await expect(sell(c, [{ quantity: "1", unitPrice: "5" }], [cash("5")])).rejects.toThrow(/needs a description/);
    });
  });

  describe("pricing a cart before it is sold", () => {
    it("gives exactly the total the sale will have, with stock warnings, and changes nothing", async () => {
      const c = await setup();
      await open(c, "0");
      const cart = { lines: [item(c, "feed", "2", { discountPercent: "5" }), item(c, "plus", "1"), { description: "Delivery", quantity: "1", unitPrice: "20", isCharge: true }], discountAmount: "5" };
      const q = await pos.quote(c.companyId, cart as never, BOSS);
      const sale = await pos.sell(c.companyId, c.user, { clientKey: key(), ...cart, payments: [cash(q.total)] } as never, BOSS, meta);
      expect(sale.total).toBe(q.total);
      expect([sale.subtotal, sale.taxTotal, sale.discountTotal]).toEqual([q.subtotal, q.taxTotal, q.discountTotal]);
      expect(sale.lines.map((l) => l.lineTotal)).toEqual(q.lines.map((l) => l.total));
      expect(q.warnings).toEqual([]);
      const before = await prisma.finPosSale.count({ where: { companyId: c.companyId } });
      await pos.quote(c.companyId, { lines: [item(c, "eggs", "2")] } as never, NORMAL);
      expect(await prisma.finPosSale.count({ where: { companyId: c.companyId } })).toBe(before);
      expect(await stockOf(c.eggs.id)).toBe("50.000");
      const short = await pos.quote(c.companyId, { lines: [item(c, "plus", "20")] } as never, NORMAL);
      expect(short.warnings).toEqual(["Only 9.000 of Medicine (plus tax) in stock."]);
      await expect(pos.quote(c.companyId, { lines: [item(c, "eggs", "1", { unitPrice: "40" })] } as never, NORMAL)).rejects.toBeInstanceOf(ForbiddenException); // same rules as selling
    });
  });

  describe("stock deduction", () => {
    it("blocks selling more than is in stock and rolls the WHOLE sale back, including other lines", async () => {
      const c = await setup();
      await open(c, "0");
      await expect(sell(c, [item(c, "feed", "2"), item(c, "eggs", "51")], [cash("3035")])).rejects.toThrow(/Only 50.000 of Egg tray of 30 in stock/);
      expect(await stockOf(c.feed.id)).toBe("100.000"); // the feed line was not taken either
      expect(await stockOf(c.eggs.id)).toBe("50.000");
      expect(await prisma.finPosSale.count({ where: { companyId: c.companyId } })).toBe(0);
    });

    it("only a supervisor can let a sale go below zero stock, and the shortfall is costed at zero", async () => {
      const c = await setup();
      await open(c, "0");
      const lines = [item(c, "plus", "12")]; // 10 on hand
      await expect(sell(c, lines, [cash("1380")], { allowNegativeStock: true })).rejects.toThrow(/Only 10.000/); // a cashier asking is ignored
      const sale = await sell(c, lines, [cash("1380")], { allowNegativeStock: true }, c.user, BOSS); // 12 x 100 + 15% = 1380
      expect(sale.total).toBe("1380.00");
      expect(await stockOf(c.plus.id)).toBe("-2.000");
      expect(await bal(c, "5100")).toBe(300); // only the 10 we held were costed (10 x 30)
    });

    it("costs sales at the weighted average, line by line", async () => {
      const c = await setup();
      await open(c, "0");
      await items.adjust(c.companyId, c.admin, { itemId: c.eggs.id, date: dayString(new Date()), quantityChange: "50", unitCost: "50", reason: "second delivery" }, meta); // 50@40 + 50@50 -> avg 45
      const sale = await sell(c, [item(c, "eggs", "10")], [cash("550")]);
      expect((await prisma.finPosSaleLine.findFirstOrThrow({ where: { saleId: sale.id } })).cost.toString()).toBe("450"); // 10 x 45
      expect(await bal(c, "5100")).toBe(450);
    });

    it("two tills racing for the last unit: exactly one sale goes through", async () => {
      const c = await setup();
      await open(c, "0");
      await open(c, "0", c.user2, c.reg2);
      await prisma.$executeRawUnsafe(`UPDATE fin_items SET qtyOnHand = 1.000, stockValue = 40.00 WHERE id = '${c.eggs.id}'`);
      const results = await Promise.allSettled([sell(c, [item(c, "eggs")], [cash("55")]), sell(c, [item(c, "eggs")], [cash("55")], {}, c.user2), sell(c, [item(c, "eggs")], [cash("55")]), sell(c, [item(c, "eggs")], [cash("55")], {}, c.user2)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await stockOf(c.eggs.id)).toBe("0.000");
      expect(await prisma.finPosSale.count({ where: { companyId: c.companyId } })).toBe(1);
    });
  });

  describe("prices and discounts", () => {
    it("a cashier cannot change a price; a supervisor can, and it is written to the audit log", async () => {
      const c = await setup();
      await open(c, "0");
      await expect(sell(c, [item(c, "eggs", "1", { unitPrice: "40" })], [cash("40")])).rejects.toBeInstanceOf(ForbiddenException);
      await expect(sell(c, [item(c, "eggs", "1", { unitPrice: "40" })], [cash("40")])).rejects.toThrow(/supervisor must approve a different price/);
      const sale = await sell(c, [item(c, "eggs", "1", { unitPrice: "40" })], [cash("40")], {}, c.user, BOSS);
      expect(sale.total).toBe("40.00");
      const audit = await prisma.finAuditLog.findFirstOrThrow({ where: { companyId: c.companyId, action: "SALE", entityId: sale.id } });
      expect(JSON.stringify(audit.after)).toContain("EGG-30 55.00 -> 40.00");
      // quoting the shelf price is not an override
      expect((await sell(c, [item(c, "eggs", "1", { unitPrice: "55" })], [cash("55")])).total).toBe("55.00");
    });

    it("line and overall discounts reduce the net and the tax correctly", async () => {
      const c = await setup();
      await open(c, "0");
      // 2 feed (230) less 5% on the line (11.50) = 218.50 -> a further 8.50 off overall = 210.00
      const sale = await sell(c, [item(c, "feed", "2", { discountPercent: "5" })], [cash("210")], { discountAmount: "8.50" });
      expect(sale).toMatchObject({ total: "210.00", discountTotal: "20.00", subtotal: "182.61", taxTotal: "27.39" });
      expect(sale.lines[0]).toMatchObject({ discountAmount: "20.00", lineTotal: "210.00", lineNet: "182.61", lineTax: "27.39" });
      expect(await bal(c, "4500")).toBe(-182.61);
      expect(await bal(c, "2180")).toBe(-27.39);
      await balanced(c);
    });

    it("a discount above the limit needs a supervisor", async () => {
      const c = await setup();
      await open(c, "0");
      await expect(sell(c, [item(c, "eggs", "2")], [cash("88")], { discountPercent: "20" })).rejects.toThrow(/more than 10.00% needs a supervisor/);
      await expect(sell(c, [item(c, "eggs", "2", { discountPercent: "11" })], [cash("97.90")])).rejects.toBeInstanceOf(ForbiddenException);
      expect((await sell(c, [item(c, "eggs", "2")], [cash("99")], { discountPercent: "10" })).total).toBe("99.00"); // exactly at the limit
      expect((await sell(c, [item(c, "eggs", "2")], [cash("88")], { discountPercent: "20" }, c.user, BOSS)).total).toBe("88.00");
    });
  });

  // ─── refunds ────────────────────────────────────────────────────────────────

  describe("refunds", () => {
    it("REFUND: returns part of a sale, reverses sales, tax and cost proportionally, puts the stock back and pays from the till", async () => {
      const c = await setup();
      const s = await open(c, "0");
      const sale = await sell(c, [item(c, "feed", "2")], [cash("230")]); // net 200, tax 30, cost 120
      const line = sale.lines[0];
      const refunded = await pos.refund(c.companyId, c.user, { clientKey: key(), saleId: sale.id, reason: "Wrong feed", lines: [{ saleLineId: line.id, quantity: "1" }], payments: [{ method: "CASH", amount: "115" }] } as never, BOSS, meta); // 115 is over the 100.00 limit, so a supervisor approves
      expect(refunded.status).toBe("PART_REFUNDED");
      expect(refunded.refunds[0]).toMatchObject({ total: "115.00", reason: "Wrong feed", restock: true });
      expect(refunded.refunds[0].number).toMatch(/^RFD-\d{4}-0001$/);
      expect(refunded.lines[0]).toMatchObject({ refundedQuantity: "1.000", refundableQuantity: "1.000" });
      expect(await payBal(c, c.drawer)).toBe(115); // 230 in, 115 back out
      expect(await bal(c, "4900")).toBe(100); // Sales returns: net of the one unit
      expect(await bal(c, "2180")).toBe(-15); // half the tax is still owed
      expect(await bal(c, "5100")).toBe(60); // half the cost is still expensed
      expect(await stockOf(c.feed.id)).toBe("99.000"); // 98 + 1 back
      const back = await prisma.finStockMovement.findFirstOrThrow({ where: { itemId: c.feed.id, type: "SALE_RETURN" } });
      expect(Number(back.value)).toBe(60); // returned at what it cost, not at today's average
      expect(back.journalEntryId).toBe((await prisma.finPosRefund.findFirstOrThrow({ where: { saleId: sale.id } })).journalEntryId);
      expect((await pos.getSession(c.companyId, s.id)).expectedCash).toBe("115.00"); // the refund came out of the drawer
      await balanced(c);

      // the rest, and the sale becomes fully refunded; nothing is left to refund
      const rest = await pos.refund(c.companyId, c.user, { clientKey: key(), saleId: sale.id, reason: "Return the rest", lines: [{ saleLineId: line.id, quantity: "1" }], payments: [{ method: "CASH", amount: "115" }] } as never, BOSS, meta);
      expect(rest.status).toBe("REFUNDED");
      expect(await bal(c, "4900")).toBe(200);
      expect(await bal(c, "2180")).toBe(0);
      expect(await bal(c, "5100")).toBe(0);
      expect(await stockOf(c.feed.id)).toBe("100.000");
      await expect(pos.refund(c.companyId, c.user, { clientKey: key(), saleId: sale.id, reason: "Again", lines: [{ saleLineId: line.id, quantity: "1" }], payments: [{ method: "CASH", amount: "115" }] } as never, BOSS, meta)).rejects.toThrow(/only 0.000 can still be refunded/);
    });

    it("refunds to the way the customer paid: MoMo and card come from their accounts, not the drawer", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "eggs", "2")], [{ method: "MOMO", amount: "110" }]);
      await pos.refund(c.companyId, c.user, { clientKey: key(), saleId: sale.id, reason: "Cracked", restock: false, lines: [{ saleLineId: sale.lines[0].id, quantity: "2" }], payments: [{ method: "MOMO", amount: "110" }] } as never, BOSS, meta);
      expect(await payBal(c, c.momo)).toBe(0);
      expect(await payBal(c, c.drawer)).toBe(0);
      expect(await stockOf(c.eggs.id)).toBe("48.000"); // damaged goods are not put back
      expect(await bal(c, "5100")).toBe(80); // and their cost stays as an expense
      expect(await prisma.finStockMovement.count({ where: { itemId: c.eggs.id, type: "SALE_RETURN" } })).toBe(0);
      await balanced(c);
    });

    it("the last unit refunded takes whatever is left, so pesewas never go missing", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "feed", "3")], [cash("345")]); // net 300, tax 45
      const id = sale.lines[0].id;
      for (const [q, amt] of [["1", "115"], ["1", "115"], ["1", "115"]] as const) {
        await pos.refund(c.companyId, c.user, { clientKey: key(), saleId: sale.id, reason: "x1y", lines: [{ saleLineId: id, quantity: q }], payments: [{ method: "CASH", amount: amt }] } as never, BOSS, meta);
      }
      expect(await bal(c, "4900")).toBe(300);
      expect(await bal(c, "2180")).toBe(0);
      expect(await bal(c, "5100")).toBe(0);
      expect(await stockOf(c.feed.id)).toBe("100.000");
      const sums = await prisma.finPosRefundLine.aggregate({ where: { saleLineId: id }, _sum: { net: true, tax: true, total: true, costReturned: true } });
      expect(sums._sum.total!.toString()).toBe("345");
      expect(sums._sum.costReturned!.toString()).toBe("180");
    });

    it("needs a supervisor unless under the limit; payments must equal the refund; and a till must be open", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "feed", "2")], [cash("230")]);
      const l = sale.lines[0].id;
      const small = { clientKey: key(), saleId: sale.id, reason: "Changed mind", lines: [{ saleLineId: l, quantity: "0.5" }], payments: [{ method: "CASH", amount: "57.50" }] };
      expect((await pos.refund(c.companyId, c.user, small as never, NORMAL, meta)).refunds[0].total).toBe("57.50"); // under the 100.00 limit
      const big = { clientKey: key(), saleId: sale.id, reason: "Changed mind", lines: [{ saleLineId: l, quantity: "1" }], payments: [{ method: "CASH", amount: "115" }] };
      await expect(pos.refund(c.companyId, c.user, big as never, NORMAL, meta)).rejects.toThrow(/more than 100.00 needs a supervisor/);
      await expect(pos.refund(c.companyId, c.user, { ...big, payments: [{ method: "CASH", amount: "100" }] } as never, BOSS, meta)).rejects.toThrow(/add up to 100.00 but the refund is 115.00/);
      await prisma.finPosSettings.update({ where: { companyId: c.companyId }, data: { refundApprovalAbove: null } });
      await expect(pos.refund(c.companyId, c.user, { ...small, clientKey: key() } as never, NORMAL, meta)).rejects.toThrow(/needs a supervisor's approval/);
      await expect(pos.refund(c.companyId, c.user2, { ...big, clientKey: key() } as never, BOSS, meta)).rejects.toThrow(/Open your till before refunding/);
      await expect(pos.refund(c.companyId, c.user, { ...big, clientKey: key(), lines: [{ saleLineId: randomUUID(), quantity: "1" }] } as never, BOSS, meta)).rejects.toThrow(/does not belong to this sale/);
      await expect(pos.refund(c.companyId, c.user, { ...big, clientKey: key(), saleId: randomUUID() } as never, BOSS, meta)).rejects.toThrow(/does not exist/);
    });

    it("IDEMPOTENT: the same refund key never refunds twice", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "eggs", "2")], [cash("110")]);
      const dto = { clientKey: key(), saleId: sale.id, reason: "Retry safe", lines: [{ saleLineId: sale.lines[0].id, quantity: "1" }], payments: [{ method: "CASH", amount: "55" }] };
      await Promise.allSettled([pos.refund(c.companyId, c.user, dto as never, BOSS, meta), pos.refund(c.companyId, c.user, dto as never, BOSS, meta)]);
      await pos.refund(c.companyId, c.user, dto as never, BOSS, meta);
      expect(await prisma.finPosRefund.count({ where: { saleId: sale.id } })).toBe(1);
      expect(await stockOf(c.eggs.id)).toBe("49.000");
    });
  });

  // ─── permanence ─────────────────────────────────────────────────────────────

  describe("permanence", () => {
    it("the database refuses to edit or delete a sale, its lines, its payments, or a refund", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "eggs", "2")], [cash("110")]);
      const refunded = await pos.refund(c.companyId, c.user, { clientKey: key(), saleId: sale.id, reason: "Test", lines: [{ saleLineId: sale.lines[0].id, quantity: "1" }], payments: [{ method: "CASH", amount: "55" }] } as never, BOSS, meta);
      const refundId = refunded.refunds[0].id;
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_pos_sales SET total = 1 WHERE id = '${sale.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_pos_sales WHERE id = '${sale.id}'`)).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_pos_sale_lines SET quantity = 1 WHERE saleId = '${sale.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_pos_sale_lines WHERE saleId = '${sale.id}'`)).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_pos_payments SET amount = 1 WHERE saleId = '${sale.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_pos_payments WHERE saleId = '${sale.id}'`)).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_pos_refunds SET total = 1 WHERE id = '${refundId}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_pos_refunds WHERE id = '${refundId}'`)).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_pos_refund_lines WHERE refundId = '${refundId}'`)).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_pos_refund_payments SET amount = 1 WHERE refundId = '${refundId}'`)).rejects.toThrow(/cannot be edited/);
    });
  });

  // ─── receipts ───────────────────────────────────────────────────────────────

  describe("receipts", () => {
    it("makes an 80 mm PDF that grows with the sale, a public link, and a WhatsApp message", async () => {
      const c = await setup();
      await open(c, "0");
      await prisma.finContact.create({ data: { companyId: c.companyId, code: "CUS-9", name: "Efua Asare", phone: "+233244123456", isCustomer: true, isSupplier: false } });
      const customer = await prisma.finContact.findFirstOrThrow({ where: { companyId: c.companyId, code: "CUS-9" } });
      const small = await sell(c, [item(c, "eggs")], [cash("55", "60")]);
      const big = await sell(c, [item(c, "feed", "2"), item(c, "eggs", "3"), item(c, "plus", "1"), { description: "Delivery", quantity: "1", unitPrice: "10", isCharge: true }], [cash("200"), { method: "MOMO", amount: "320", reference: "MoMo 9" }], { contactId: customer.id });

      const a = await receipts.pdf(c.companyId, small.id);
      const b = await receipts.pdf(c.companyId, big.id);
      expect(a.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(a.filename).toBe(`${small.number}.pdf`);
      const box = (buf: Buffer) => /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(buf.toString("latin1"))!.slice(1).map(Number);
      const [wa, ha] = box(a.buffer);
      const [wb, hb] = box(b.buffer);
      expect(wa).toBeCloseTo(226.77, 1); // 80 mm wide
      expect(wb).toBeCloseTo(226.77, 1);
      expect(hb).toBeGreaterThan(ha); // a longer sale makes a longer roll

      const data = await receipts.data(c.companyId, big.id);
      expect(data.sale).toMatchObject({ number: big.number, customerName: "Efua Asare", total: "520.00", changeGiven: "0.00" });
      expect(data.business.businessName).toBeTruthy();

      const share = await receipts.share(c.companyId, big.id);
      expect(share.link).toMatch(/\/p\/pos\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
      expect(share.phone).toBe("+233244123456"); // the chosen customer's own number
      expect(share.whatsappUrl).toContain("https://wa.me/233244123456");
      expect(decodeURIComponent(share.whatsappUrl)).toContain(share.link);
      expect(decodeURIComponent(share.whatsappUrl)).toContain(big.number);
      const typed = await receipts.share(c.companyId, small.id, "0200111222"); // a walk-in: type the number at the till
      expect(typed.whatsappUrl).toContain("https://wa.me/0200111222");

      const token = share.link.split("/p/pos/")[1];
      const pub = await receipts.publicReceipt(token);
      expect(pub.sale.number).toBe(big.number);
      expect((await receipts.publicPdf(token)).buffer.subarray(0, 5).toString()).toBe("%PDF-");
    });

    it("a forged, mangled or foreign link is always the same \"not valid\"", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "eggs")], [cash("55")]);
      const token = links.posReceiptToken(sale.id);
      await expect(receipts.publicReceipt("garbage")).rejects.toThrow("This link is not valid.");
      await expect(receipts.publicReceipt(`${sale.id}.${"A".repeat(32)}`)).rejects.toThrow("This link is not valid.");
      await expect(receipts.publicReceipt(`${randomUUID()}.${token.split(".")[1]}`)).rejects.toThrow("This link is not valid.");
      await expect(receipts.publicPdf("garbage")).rejects.toThrow("This link is not valid.");
      // a link for an invoice receipt is not a till-receipt link
      expect(links.parsePosReceiptToken(links.receiptToken(sale.id))).toBeNull();
      await expect(receipts.data(randomUUID(), sale.id)).rejects.toThrow(/not found/); // another company
    });

    it("shows refunds on the receipt", async () => {
      const c = await setup();
      await open(c, "0");
      const sale = await sell(c, [item(c, "eggs", "2")], [cash("110")]);
      await pos.refund(c.companyId, c.user, { clientKey: key(), saleId: sale.id, reason: "Cracked", lines: [{ saleLineId: sale.lines[0].id, quantity: "1" }], payments: [{ method: "CASH", amount: "55" }] } as never, BOSS, meta);
      const data = await receipts.data(c.companyId, sale.id);
      expect(data.sale.status).toBe("PART_REFUNDED");
      expect(data.sale.refunds).toHaveLength(1);
      expect((await receipts.pdf(c.companyId, sale.id)).buffer.length).toBeGreaterThan(800);
    });
  });

  // ─── reports ────────────────────────────────────────────────────────────────

  describe("reports", () => {
    it("by day, cashier, item and payment method, net of refunds, and the totals tie to the ledger", async () => {
      const c = await setup();
      await open(c, "0");
      await open(c, "0", c.user2, c.reg2);
      const a = await sell(c, [item(c, "feed", "2"), item(c, "eggs", "2")], [cash("340")]); // 230 + 110, tax 30
      await sell(c, [item(c, "eggs", "1")], [{ method: "MOMO", amount: "55" }], {}, c.user2);
      await sell(c, [item(c, "feed", "1")], [{ method: "CARD", amount: "115" }], {}, c.user2);
      await pos.refund(c.companyId, c.user, { clientKey: key(), saleId: a.id, reason: "Return one egg tray", lines: [{ saleLineId: a.lines[1].id, quantity: "1" }], payments: [{ method: "CASH", amount: "55" }] } as never, BOSS, meta);

      const today = dayString(new Date());
      const day = await pos.report(c.companyId, { from: today, to: today, groupBy: "day" });
      expect(day.rows).toHaveLength(1);
      expect(day.rows[0]).toMatchObject({ label: today, count: 3, sales: "510.00", refunds: "55.00", net: "455.00", tax: "45.00", cost: "260.00", profit: "150.00" });
      expect(day.totals).toMatchObject({ count: 3, sales: "510.00", refunds: "55.00", net: "455.00", tax: "45.00", cost: "260.00" });

      const byCashier = await pos.report(c.companyId, { from: today, to: today, groupBy: "cashier" });
      expect(byCashier.rows.map((r) => [r.label, r.count, r.sales, r.refunds, r.net])).toEqual([["Ama Cashier", 1, "340.00", "55.00", "285.00"], ["Kojo Cashier", 2, "170.00", "0.00", "170.00"]]);

      const byItem = await pos.report(c.companyId, { from: today, to: today, groupBy: "item" });
      const feed = byItem.rows.find((r) => r.label === "Layer 1 C feed")!;
      const eggs = byItem.rows.find((r) => r.label === "Egg tray of 30")!;
      expect(feed).toMatchObject({ quantity: "3.000", sales: "345.00", refunds: "0.00", cost: "180.00" });
      expect(eggs).toMatchObject({ quantity: "2.000", sales: "165.00", refunds: "55.00", net: "110.00", cost: "80.00" }); // 3 sold, 1 returned

      const byMethod = await pos.report(c.companyId, { from: today, to: today, groupBy: "method" });
      expect(byMethod.rows.map((r) => [r.label, r.sales, r.refunds, r.net])).toEqual([["Cash", "340.00", "55.00", "285.00"], ["Card", "115.00", "0.00", "115.00"], ["MoMo", "55.00", "0.00", "55.00"]]);

      // TIE-OUT: the report is the ledger. Net sales excluding tax = Sales credit less Sales Returns debit; cost = COGS.
      expect(-(await bal(c, "4500")) - (await bal(c, "4900"))).toBe(410); // 455 net of refunds, less 45 tax
      expect(await bal(c, "5100")).toBe(260);
      expect(-(await bal(c, "2180"))).toBe(45);
      await balanced(c);

      // custom date ranges: a range with no sales is empty, and a range that ends yesterday does not include today
      const yesterday = dayString(new Date(Date.now() - 86_400_000));
      expect((await pos.report(c.companyId, { from: yesterday, to: yesterday })).rows).toHaveLength(0);
      expect((await pos.report(c.companyId, { from: yesterday, to: today, groupBy: "day" })).totals.sales).toBe("510.00");
    });

    it("lists sales and till sessions with filters", async () => {
      const c = await setup();
      const s1 = await open(c, "0");
      const a = await sell(c, [item(c, "eggs")], [cash("55")]);
      await sell(c, [item(c, "eggs")], [cash("55")], { customerName: "Kofi" });
      expect((await pos.listSales(c.companyId, {})).total).toBe(2);
      expect((await pos.listSales(c.companyId, { search: a.number })).rows.map((r) => r.id)).toEqual([a.id]);
      expect((await pos.listSales(c.companyId, { search: "Kofi" })).total).toBe(1);
      expect((await pos.listSales(c.companyId, { sessionId: s1.id })).total).toBe(2);
      expect((await pos.listSales(c.companyId, { cashierId: "someone-else" })).total).toBe(0);
      expect((await pos.sessions(c.companyId, { status: "OPEN" })).total).toBe(1);
      expect((await pos.sessions(c.companyId, { status: "CLOSED" })).total).toBe(0);
    });

    it("keeps companies apart", async () => {
      const one = await setup();
      const two = await setup();
      await open(one, "0");
      const sale = await sell(one, [item(one, "eggs")], [cash("55")]);
      await expect(pos.getSale(two.companyId, sale.id)).rejects.toThrow(/not found/);
      expect((await pos.listSales(two.companyId, {})).total).toBe(0);
      expect((await pos.report(two.companyId, {})).totals.sales).toBe("0.00");
      await expect(sell(two, [item(one, "eggs")], [cash("55")], {}, two.user)).rejects.toThrow(/Open your till before selling/);
    });
  });
});
