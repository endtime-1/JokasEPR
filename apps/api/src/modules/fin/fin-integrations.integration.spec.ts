/**
 * Finance v2 cross-module link tests (real MySQL/MariaDB with all fin migrations applied, triggers included):
 *   FIN_TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3398/fintest npx jest --runInBand src/modules/fin
 * The Sales module is replaced by a fake order source, so no Sales tables are needed. Every test builds its own company.
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { FinAccountsService } from "./fin-accounts.service";
import { FinAuditService } from "./fin-audit.service";
import { FinContactsService } from "./fin-contacts.service";
import { FinIntegrationsService, SALES_ORDER_LINK } from "./fin-integrations.service";
import { SalesOrderSource, SourceOrder, decimalToPesewasRounded, quantityString } from "./fin-integration-source";
import { FinInvoicesService } from "./fin-invoices.service";
import { FinLedgerService } from "./fin-ledger.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinTaxService } from "./fin-tax.service";

const URL = process.env.FIN_TEST_DATABASE_URL;
const maybe = URL ? describe : describe.skip;

/** Stands in for the Sales module: holds orders and answers the same two questions the real adapter does. */
class FakeSource implements SalesOrderSource {
  orders: SourceOrder[] = [];
  calls = 0;
  async listConfirmed(_companyId: string, since: Date, excludeIds: string[], limit: number) {
    this.calls++;
    return this.orders.filter((o) => ["APPROVED", "FULFILLED"].includes(o.status) && o.approvedAt.getTime() >= since.getTime() && !excludeIds.includes(o.id)).slice(0, limit);
  }
  async statuses(_companyId: string, ids: string[]) {
    return new Map(this.orders.filter((o) => ids.includes(o.id)).map((o) => [o.id, o.status]));
  }
}

describe("source value helpers", () => {
  it("rounds Decimal(18,4) to pesewas half up", () => {
    expect(decimalToPesewasRounded("12.3450")).toBe(1235);
    expect(decimalToPesewasRounded("12.3449")).toBe(1234);
    expect(decimalToPesewasRounded("0.0050")).toBe(1);
    expect(decimalToPesewasRounded("0.0049")).toBe(0);
    expect(decimalToPesewasRounded("-3.3350")).toBe(-334);
    expect(decimalToPesewasRounded(null)).toBe(0);
    expect(decimalToPesewasRounded("1700")).toBe(170_000);
  });
  it("tidies quantities", () => {
    expect(quantityString("10.0000")).toBe("10");
    expect(quantityString("2.5000")).toBe("2.5");
    expect(quantityString("0.12345")).toBe("0.1234");
    expect(quantityString("abc")).toBe("0");
  });
});

maybe("finance v2 links to other modules (real database)", () => {
  let prisma: PrismaClient;
  let chart: FinAccountsService;
  let contacts: FinContactsService;
  let invoices: FinInvoicesService;
  let tax: FinTaxService;
  let ledger: FinLedgerService;
  let audit: FinAuditService;
  let numbering: FinNumberingService;
  const source = new FakeSource();
  let links: FinIntegrationsService;
  const user = "user-1";
  const meta = { ipAddress: "127.0.0.1", userAgent: "jest" };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$connect();
    const p = prisma as never;
    audit = new FinAuditService(p);
    numbering = new FinNumberingService(p, audit);
    tax = new FinTaxService(p, audit);
    chart = new FinAccountsService(p, audit);
    contacts = new FinContactsService(p, audit, numbering);
    ledger = new FinLedgerService(p, numbering, audit);
    invoices = new FinInvoicesService(p, audit, numbering, ledger, tax);
    links = new FinIntegrationsService(p, audit, contacts, invoices, source);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(() => {
    source.orders = [];
    source.calls = 0;
  });

  // ─── helpers ────────────────────────────────────────────────────────────────

  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
  let seq = 0;

  async function setup() {
    const companyId = randomUUID();
    await chart.applyTemplate(companyId, user, meta);
    seq++;
    const customer = await contacts.create(companyId, user, { name: `Kofi Mensah ${seq}`, externalRef: `CUST:cust-${seq}`, paymentTermsDays: 14 }, meta);
    return { companyId, customer, srcCustomerId: `cust-${seq}` };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  const order = (c: { srcCustomerId: string }, over: Partial<SourceOrder> = {}): SourceOrder => {
    const id = over.id ?? randomUUID();
    return {
      id,
      orderNumber: `SO-${1000 + ++seq}`,
      orderDate: new Date(),
      approvedAt: new Date(Date.now() + 1000),
      status: "APPROVED",
      customerId: c.srcCustomerId,
      customerName: "Kofi Mensah",
      customerPhone: "0244000111",
      customerEmail: "kofi@example.com",
      notes: null,
      discountPesewas: 0,
      taxPesewas: 0,
      totalPesewas: 336_000,
      lines: [{ description: "Layer 1 C feed (FD-L1C)", quantity: "10", lineTotalPesewas: 336_000 }],
      ...over
    };
  };

  const turnOn = (c: Ctx, extra: object = {}) => links.update(c.companyId, user, SALES_ORDER_LINK, { enabled: true, ...extra }, meta);
  const invoicesOf = (c: Ctx) => prisma.finInvoice.findMany({ where: { companyId: c.companyId } });
  const logOf = (c: Ctx, sourceId: string) => prisma.finIntegrationLog.findFirst({ where: { companyId: c.companyId, sourceId } });
  const tick = () => new Promise((r) => setTimeout(r, 15)); // so "approved after switch-on" is strictly after

  // ─── settings: everything is OFF ────────────────────────────────────────────

  describe("settings", () => {
    it("every link is OFF by default, and a link that is not built cannot be switched on", async () => {
      const c = await setup();
      const list = await links.links(c.companyId);
      expect(list.map((l) => [l.key, l.enabled, l.available])).toEqual([[SALES_ORDER_LINK, false, true], ["goods_received_to_bill", false, false]]);
      await expect(links.update(c.companyId, user, "goods_received_to_bill", { enabled: true }, meta)).rejects.toThrow(/Purchases/);
      await expect(links.update(c.companyId, user, "nonsense", { enabled: true }, meta)).rejects.toThrow(/does not exist/);
      expect((await links.links(c.companyId))[1].enabled).toBe(false);
    });

    it("does nothing while OFF, even when approved orders are waiting", async () => {
      const c = await setup();
      source.orders = [order(c), order(c)];
      expect(await links.sync(c.companyId)).toBeNull();
      expect(source.calls).toBe(0); // it does not even look at the other module
      expect(await invoicesOf(c)).toHaveLength(0);
      expect(await prisma.finIntegrationLog.count({ where: { companyId: c.companyId } })).toBe(0);
    });

    it("switching ON starts from now and is written to the audit log; switching OFF stops it", async () => {
      const c = await setup();
      const before = Date.now();
      const on = await turnOn(c);
      expect(on.enabled).toBe(true);
      expect(on.enabledAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      await links.update(c.companyId, user, SALES_ORDER_LINK, { enabled: false }, meta);
      source.orders = [order(c)];
      expect(await links.sync(c.companyId)).toBeNull();
      const actions = (await prisma.finAuditLog.findMany({ where: { companyId: c.companyId, area: "settings" }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
      expect(actions).toEqual(["LINK_ON", "LINK_OFF"]);
    });

    it("validates the default tax code and income account", async () => {
      const c = await setup();
      const purchases = await tax.create(c.companyId, user, { code: "PIN", name: "Purchase tax", appliesTo: "PURCHASES", ratePercent: "5", effectiveFrom: "2026-01-01" }, meta);
      await expect(links.update(c.companyId, user, SALES_ORDER_LINK, { defaultTaxCodeId: purchases.id }, meta)).rejects.toThrow(/applies to sales/);
      await expect(links.update(c.companyId, user, SALES_ORDER_LINK, { defaultTaxCodeId: randomUUID() }, meta)).rejects.toThrow(/applies to sales/);
      const expense = await prisma.finAccount.findFirstOrThrow({ where: { companyId: c.companyId, code: "6900" } });
      await expect(links.update(c.companyId, user, SALES_ORDER_LINK, { defaultAccountId: expense.id }, meta)).rejects.toThrow(/income account/);
      const sales = await prisma.finAccount.findFirstOrThrow({ where: { companyId: c.companyId, code: "4500" } });
      const ok = await links.update(c.companyId, user, SALES_ORDER_LINK, { defaultAccountId: sales.id }, meta);
      expect(ok.defaultAccountId).toBe(sales.id);
    });
  });

  // ─── importing orders ───────────────────────────────────────────────────────

  describe("sales order -> draft invoice", () => {
    it("creates one DRAFT invoice from an approved order, with its source reference, and posts nothing", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const o = order(c, { notes: "Deliver Tuesday", lines: [{ description: "Layer 1 C feed (FD-L1C)", quantity: "10", lineTotalPesewas: 336_000 }, { description: "Broiler starter (FD-BS)", quantity: "2.5", lineTotalPesewas: 80_000 }], totalPesewas: 416_000 });
      source.orders = [o];
      const res = await links.sync(c.companyId);
      expect(res).toMatchObject({ created: 1, needsMapping: 0, errors: 0 });

      const [inv] = await invoicesOf(c);
      expect(inv).toMatchObject({ status: "DRAFT", number: null, journalEntryId: null, contactId: c.customer.id, externalRef: `SO:${o.id}`, sourceLabel: `Sales order ${o.orderNumber}` });
      expect(Number(inv.total)).toBe(4160);
      expect(Number(inv.sourceTotal)).toBe(4160);
      expect(inv.notes).toBe(`From Sales order ${o.orderNumber}: Deliver Tuesday`);
      const lines = await prisma.finInvoiceLine.findMany({ where: { invoiceId: inv.id }, orderBy: { lineNo: "asc" } });
      expect(lines.map((l) => [l.description, Number(l.quantity), Number(l.unitPrice), Number(l.lineTotal)])).toEqual([
        ["Layer 1 C feed (FD-L1C)", 10, 336, 3360],
        ["Broiler starter (FD-BS)", 2.5, 320, 800]
      ]);
      // due date follows the customer's terms (14 days)
      expect(Math.round((inv.dueDate.getTime() - inv.issueDate.getTime()) / 86_400_000)).toBe(14);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId } })).toBe(0); // NOTHING is posted
      expect(await logOf(c, o.id)).toMatchObject({ status: "CREATED", invoiceId: inv.id, message: null });
      expect(await prisma.finAuditLog.count({ where: { companyId: c.companyId, action: "CREATE_DRAFT" } })).toBe(1);
    });

    it("a finance user can review, edit and post the draft as normal", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const o = order(c);
      source.orders = [o];
      await links.sync(c.companyId);
      const [inv] = await invoicesOf(c);
      const edited = await invoices.updateDraft(c.companyId, user, inv.id, { notes: "Reviewed by finance" }, meta);
      expect(edited.notes).toBe("Reviewed by finance");
      const sent = await invoices.send(c.companyId, user, inv.id, meta);
      expect(sent.number).toMatch(/^INV-/);
      const posted = await prisma.finInvoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(posted.status).toBe("SENT");
      expect(posted.externalRef).toBe(`SO:${o.id}`); // the link to the order survives posting
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId } })).toBe(1);
    });

    it("applies the default tax code and income account", async () => {
      const c = await setup();
      const vat = await tax.create(c.companyId, user, { code: "VAT", name: "VAT", ratePercent: "15", effectiveFrom: "2026-01-01" }, meta);
      const sales = await prisma.finAccount.findFirstOrThrow({ where: { companyId: c.companyId, code: "4800" } });
      await turnOn(c, { defaultTaxCodeId: vat.id, defaultAccountId: sales.id });
      await tick();
      source.orders = [order(c, { totalPesewas: 100_000, lines: [{ description: "Feed", quantity: "1", lineTotalPesewas: 100_000 }] })];
      await links.sync(c.companyId);
      const [inv] = await invoicesOf(c);
      const [line] = await prisma.finInvoiceLine.findMany({ where: { invoiceId: inv.id } });
      expect(line).toMatchObject({ taxCodeId: vat.id, accountId: sales.id });
      expect(Number(inv.taxTotal)).toBe(150);
      expect(Number(inv.total)).toBe(1150);
      // the order's own total was 1000.00, so finance is told to look
      expect((await prisma.finIntegrationLog.findFirstOrThrow({ where: { companyId: c.companyId } })).message).toMatch(/Check this draft: it totals 1150.00 but the order totals 1000.00/);
    });

    it("ignores orders approved before the link was switched on, and picks up later ones", async () => {
      const c = await setup();
      const old = order(c, { approvedAt: ago(60) });
      source.orders = [old];
      await turnOn(c);
      await tick();
      expect(await links.sync(c.companyId)).toMatchObject({ created: 0 });
      expect(await invoicesOf(c)).toHaveLength(0);
      const fresh = order(c);
      source.orders = [old, fresh];
      expect(await links.sync(c.companyId)).toMatchObject({ created: 1 });
      const refs = (await invoicesOf(c)).map((i) => i.externalRef);
      expect(refs).toEqual([`SO:${fresh.id}`]);
      // switching off and on again moves the start line forward: nothing approved during the gap is back-filled
      await links.update(c.companyId, user, SALES_ORDER_LINK, { enabled: false }, meta);
      const gap = order(c, { approvedAt: new Date(Date.now() + 10) });
      source.orders = [old, fresh, gap];
      await new Promise((r) => setTimeout(r, 50));
      await turnOn(c);
      await links.sync(c.companyId);
      expect(await invoicesOf(c)).toHaveLength(1);
    });

    it("one order makes one draft: repeated runs and two runs at the same moment never duplicate it", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      source.orders = [order(c), order(c), order(c)];
      await links.sync(c.companyId);
      await links.sync(c.companyId);
      expect(await invoicesOf(c)).toHaveLength(3);
      // a second app process, started at the same moment as this one
      const other = new FinIntegrationsService(prisma as never, audit, contacts, invoices, source);
      source.orders = [...source.orders, order(c), order(c), order(c), order(c)];
      await Promise.all([links.sync(c.companyId), other.sync(c.companyId), other.sync(c.companyId)]);
      const refs = (await invoicesOf(c)).map((i) => i.externalRef);
      expect(refs).toHaveLength(7);
      expect(new Set(refs).size).toBe(7);
      expect(await prisma.finIntegrationLog.count({ where: { companyId: c.companyId, status: "CREATED" } })).toBe(7);
    });

    it("the database refuses a second invoice for the same order, and refuses to change a source reference", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const o = order(c);
      source.orders = [o];
      await links.sync(c.companyId);
      const [inv] = await invoicesOf(c);
      await expect(invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: "2026-11-20", lines: [{ description: "x", quantity: "1", unitPrice: "10" }] } as never, meta, { externalRef: `SO:${o.id}` })).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_invoices SET externalRef = 'SO:other' WHERE id = '${inv.id}'`)).rejects.toThrow(/source an invoice came from cannot be changed/);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_invoices SET externalRef = NULL WHERE id = '${inv.id}'`)).rejects.toThrow(/cannot be changed/);
      const log = await logOf(c, o.id);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_integration_log WHERE id = '${log!.id}'`)).rejects.toThrow(/cannot be deleted/);
    });

    it("a draft finance discarded is not made again", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const o = order(c);
      source.orders = [o];
      await links.sync(c.companyId);
      const [inv] = await invoicesOf(c);
      await invoices.deleteDraft(c.companyId, user, inv.id, meta);
      await links.sync(c.companyId);
      expect(await invoicesOf(c)).toHaveLength(0);
      const incoming = await links.incoming(c.companyId, {});
      expect(incoming.rows[0]).toMatchObject({ status: "CREATED", review: "DISCARDED", invoice: null });
    });

    it("fulfilled orders count as confirmed, and cancelled or unconfirmed orders are never imported", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      source.orders = [order(c, { status: "FULFILLED" }), order(c, { status: "CANCELLED" }), order(c, { status: "PENDING_STOCK_APPROVAL" }), order(c, { status: "DRAFT" })];
      expect(await links.sync(c.companyId)).toMatchObject({ created: 1 });
      expect(await invoicesOf(c)).toHaveLength(1);
    });

    it("an order with nothing to invoice is logged as a problem, and imported once it is fixed", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const o = order(c, { lines: [{ description: "Sample", quantity: "1", lineTotalPesewas: 0 }], totalPesewas: 0 });
      source.orders = [o];
      expect(await links.sync(c.companyId)).toMatchObject({ created: 0, errors: 1 });
      expect(await logOf(c, o.id)).toMatchObject({ status: "ERROR", message: expect.stringMatching(/nothing to invoice/) });
      source.orders = [{ ...o, lines: [{ description: "Sample", quantity: "1", lineTotalPesewas: 5000 }], totalPesewas: 5000 }];
      expect(await links.sync(c.companyId)).toMatchObject({ created: 1, errors: 0 });
      expect(await logOf(c, o.id)).toMatchObject({ status: "CREATED", message: null });
    });

    it("keeps going when one order cannot be matched, and imports the others", async () => {
      const c = await setup();
      await prisma.finContact.update({ where: { id: c.customer.id }, data: { isActive: false } });
      const second = await contacts.create(c.companyId, user, { name: "Ama Owusu", externalRef: "CUST:ama" }, meta);
      await turnOn(c);
      await tick();
      const bad = order(c); // its customer is switched off in finance, so it is parked, not an error
      const good = order({ srcCustomerId: "ama" }, { customerName: "Ama Owusu" });
      source.orders = [bad, good];
      const res = await links.sync(c.companyId);
      expect(res).toMatchObject({ created: 1, needsMapping: 1 });
      expect((await invoicesOf(c))[0].contactId).toBe(second.id);
    });
  });

  // ─── customers ──────────────────────────────────────────────────────────────

  describe("matching customers", () => {
    it("parks an order whose customer is not matched yet, and imports it once the customer is mapped", async () => {
      const c = await setup();
      const walkIn = await contacts.create(c.companyId, user, { name: "Yaw Boateng" }, meta);
      await turnOn(c);
      await tick();
      const o = order({ srcCustomerId: "cust-new" }, { customerName: "Yaw Boateng (Sales)" });
      source.orders = [o];
      expect(await links.sync(c.companyId)).toMatchObject({ created: 0, needsMapping: 1 });
      expect(await invoicesOf(c)).toHaveLength(0);
      expect(await logOf(c, o.id)).toMatchObject({ status: "NEEDS_MAPPING", sourceCustomerId: "cust-new", sourceCustomerName: "Yaw Boateng (Sales)" });
      expect((await links.links(c.companyId))[0].counts.needsMapping).toBe(1);

      const res = await links.mapCustomer(c.companyId, user, { sourceCustomerId: "cust-new", contactId: walkIn.id }, meta);
      expect(res).toMatchObject({ created: 1, needsMapping: 0 });
      expect((await prisma.finContact.findUniqueOrThrow({ where: { id: walkIn.id } })).externalRef).toBe("CUST:cust-new");
      expect((await invoicesOf(c))[0].contactId).toBe(walkIn.id);
      expect(await logOf(c, o.id)).toMatchObject({ status: "CREATED" });
    });

    it("refuses a mapping that would clash", async () => {
      const c = await setup();
      const other = await contacts.create(c.companyId, user, { name: "Someone Else" }, meta);
      await expect(links.mapCustomer(c.companyId, user, { sourceCustomerId: c.srcCustomerId, contactId: other.id }, meta)).rejects.toThrow(/already matched to Kofi Mensah/);
      await expect(links.mapCustomer(c.companyId, user, { sourceCustomerId: "x", contactId: c.customer.id }, meta)).rejects.toThrow(/already matched to a different record/);
      await expect(links.mapCustomer(c.companyId, user, { sourceCustomerId: "x", contactId: randomUUID() }, meta)).rejects.toThrow(/Choose a finance customer/);
      const supplierOnly = await contacts.create(c.companyId, user, { name: "Feed Supplier", isCustomer: false, isSupplier: true }, meta);
      await expect(links.mapCustomer(c.companyId, user, { sourceCustomerId: "y", contactId: supplierOnly.id }, meta)).rejects.toThrow(/Choose a finance customer/);
    });

    it("creates the finance customer itself only when told to, and reuses it for the next order", async () => {
      const c = await setup();
      await turnOn(c, { autoCreateContacts: true });
      await tick();
      const a = order({ srcCustomerId: "cust-auto" }, { customerName: "Efua Asare", customerPhone: "0200000000", customerEmail: "not an email" });
      const b = order({ srcCustomerId: "cust-auto" }, { customerName: "Efua Asare" });
      source.orders = [a, b];
      expect(await links.sync(c.companyId)).toMatchObject({ created: 2, needsMapping: 0 });
      const made = await prisma.finContact.findMany({ where: { companyId: c.companyId, externalRef: "CUST:cust-auto" } });
      expect(made).toHaveLength(1);
      expect(made[0]).toMatchObject({ name: "Efua Asare", phone: "+233200000000", email: null, isCustomer: true });
      expect((await invoicesOf(c)).filter((i) => i.contactId === made[0].id)).toHaveLength(2);
    });
  });

  // ─── when the source changes ────────────────────────────────────────────────

  describe("when the order changes afterwards", () => {
    it("flags a still-draft invoice whose order was cancelled, and never deletes it", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const o = order(c);
      source.orders = [o];
      await links.sync(c.companyId);
      source.orders = [{ ...o, status: "CANCELLED" }];
      expect(await links.sync(c.companyId)).toMatchObject({ cancelled: 1 });
      expect(await logOf(c, o.id)).toMatchObject({ status: "SOURCE_CANCELLED", message: expect.stringMatching(/cancelled/) });
      expect(await invoicesOf(c)).toHaveLength(1);
      expect((await invoicesOf(c))[0].status).toBe("DRAFT");
      // and it is not made again
      await links.sync(c.companyId);
      expect(await invoicesOf(c)).toHaveLength(1);
    });

    it("never touches an invoice that finance has already posted", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const o = order(c);
      source.orders = [o];
      await links.sync(c.companyId);
      const [inv] = await invoicesOf(c);
      await invoices.send(c.companyId, user, inv.id, meta);
      source.orders = [{ ...o, status: "CANCELLED" }];
      expect(await links.sync(c.companyId)).toMatchObject({ cancelled: 0 });
      expect(await logOf(c, o.id)).toMatchObject({ status: "CREATED" });
      expect((await prisma.finInvoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("SENT");
    });
  });

  // ─── what finance sees ──────────────────────────────────────────────────────

  describe("the review list", () => {
    it("shows drafts to review, posted and parked orders, newest first, with filters", async () => {
      const c = await setup();
      await turnOn(c);
      await tick();
      const a = order(c);
      const b = order(c);
      const parked = order({ srcCustomerId: "stranger" }, { customerName: "Stranger" });
      source.orders = [a, b, parked];
      await links.sync(c.companyId);
      const posted = (await invoicesOf(c)).find((i) => i.externalRef === `SO:${a.id}`)!;
      await invoices.send(c.companyId, user, posted.id, meta);

      const all = await links.incoming(c.companyId, {});
      expect(all.total).toBe(3);
      const byLabel = (label: string | null) => all.rows.find((r) => r.sourceLabel === label)!;
      expect(byLabel(`Sales order ${a.orderNumber}`)).toMatchObject({ review: "POSTED", invoice: { status: "SENT", customer: c.customer.name } });
      expect(byLabel(`Sales order ${b.orderNumber}`)).toMatchObject({ review: "TO_REVIEW", invoice: { status: "DRAFT", total: "3360.00", sourceTotal: "3360.00" } });
      expect(byLabel(`Sales order ${parked.orderNumber}`)).toMatchObject({ status: "NEEDS_MAPPING", review: null, invoice: null });
      expect((await links.incoming(c.companyId, { status: "NEEDS_MAPPING" })).total).toBe(1);
      expect((await links.incoming(c.companyId, { status: "CREATED", take: 1 })).rows).toHaveLength(1);
      const summary = (await links.links(c.companyId))[0];
      expect(summary.counts).toEqual({ created: 2, needsMapping: 1, errors: 0, cancelled: 0 });
      expect(summary.lastRunSummary).toMatch(/2 draft\(s\) created/);
    });

    it("keeps companies apart", async () => {
      const one = await setup();
      const two = await setup();
      await turnOn(one);
      await tick();
      source.orders = [order(one)];
      await links.sync(one.companyId);
      expect((await links.incoming(two.companyId, {})).total).toBe(0);
      expect(await links.sync(two.companyId)).toBeNull(); // company two never switched it on
      expect(await invoicesOf(two)).toHaveLength(0);
    });
  });
});
