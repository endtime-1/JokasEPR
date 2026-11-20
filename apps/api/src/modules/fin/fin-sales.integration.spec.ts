/**
 * Finance v2 sales integration tests (real MySQL with all fin migrations applied, triggers included):
 *   FIN_TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3399/fintest npx jest --runInBand src/modules/fin
 * Every test builds its own company, so tests never see each other's data.
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { FinAccountsService } from "./fin-accounts.service";
import { FinAuditService } from "./fin-audit.service";
import { FinContactsService } from "./fin-contacts.service";
import { FinCreditNotesService } from "./fin-credit-notes.service";
import { FinCustomerPaymentsService } from "./fin-customer-payments.service";
import { FinInvoicesService } from "./fin-invoices.service";
import { FinLedgerService, dayString, parseDay } from "./fin-ledger.service";
import { FinLinksService } from "./fin-links.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinPdfService } from "./fin-pdf.service";
import { FinQuotesService } from "./fin-quotes.service";
import { FinRecurringService } from "./fin-recurring.service";
import { FinReminderService } from "./fin-reminders.service";
import { FinReportsService } from "./fin-reports.service";
import { FinSalesShareService } from "./fin-sales-share.service";
import { addDays } from "./fin-sales-math";
import { FinSettingsService } from "./fin-settings.service";
import { FinStatementService } from "./fin-statement.service";
import { FinTaxService } from "./fin-tax.service";

const URL = process.env.FIN_TEST_DATABASE_URL;
const maybe = URL ? describe : describe.skip;

maybe("finance v2 sales (real MySQL)", () => {
  let prisma: PrismaClient;
  let accounts: FinAccountsService;
  let contacts: FinContactsService;
  let tax: FinTaxService;
  let ledger: FinLedgerService;
  let reports: FinReportsService;
  let invoices: FinInvoicesService;
  let quotes: FinQuotesService;
  let payments: FinCustomerPaymentsService;
  let credits: FinCreditNotesService;
  let recurring: FinRecurringService;
  let statements: FinStatementService;
  let share: FinSalesShareService;
  let reminders: FinReminderService;
  let links: FinLinksService;
  const email = { isConfigured: true, send: jest.fn(), sendWithAttachment: jest.fn() };
  const user = "user-1";
  const meta = { ipAddress: "127.0.0.1", userAgent: "jest" };
  const priorSecret = process.env.FIN_LINK_SECRET;

  beforeAll(async () => {
    process.env.FIN_LINK_SECRET = "integration-test-secret-long-enough";
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$connect();
    const p = prisma as never;
    const audit = new FinAuditService(p);
    const numbering = new FinNumberingService(p, audit);
    const settings = new FinSettingsService(p, audit, numbering);
    accounts = new FinAccountsService(p, audit);
    contacts = new FinContactsService(p, audit, numbering);
    tax = new FinTaxService(p, audit);
    ledger = new FinLedgerService(p, numbering, audit);
    reports = new FinReportsService(p);
    invoices = new FinInvoicesService(p, audit, numbering, ledger, tax);
    quotes = new FinQuotesService(p, audit, numbering, invoices, tax);
    payments = new FinCustomerPaymentsService(p, audit, numbering, ledger, invoices);
    credits = new FinCreditNotesService(p, audit, numbering, ledger, invoices);
    recurring = new FinRecurringService(p, audit, invoices, tax);
    statements = new FinStatementService(p);
    links = new FinLinksService();
    share = new FinSalesShareService(p, audit, invoices, statements, settings, links, new FinPdfService(), email as never);
    reminders = new FinReminderService(p, email as never, links, settings);
  });
  afterAll(async () => {
    if (priorSecret === undefined) delete process.env.FIN_LINK_SECRET;
    else process.env.FIN_LINK_SECRET = priorSecret;
    await prisma.$disconnect();
  });
  beforeEach(() => {
    email.isConfigured = true;
    email.send.mockReset().mockResolvedValue(true);
    email.sendWithAttachment.mockReset().mockResolvedValue(true);
  });

  // ─── helpers ────────────────────────────────────────────────────────────────

  const ymd = (offset = 0) => dayString(addDays(parseDay(new Date()), offset));
  const line = (description: string, quantity: string | number, unitPrice: string | number, extra: Record<string, unknown> = {}) => ({ description, quantity, unitPrice, ...extra });
  let seq = 0;

  async function setup() {
    const companyId = randomUUID();
    await accounts.applyTemplate(companyId, user, meta);
    // The template ships the tax account switched off (the business charged no tax). Switch it on, add VAT 15%.
    await prisma.finAccount.updateMany({ where: { companyId, code: "2180" }, data: { isActive: true } });
    await tax.ensureDefaults(companyId);
    await tax.create(companyId, user, { code: "VAT", name: "VAT", ratePercent: "15", effectiveFrom: "2026-01-01" }, meta);
    const vat = (await tax.list(companyId)).find((t) => t.code === "VAT")!;
    const acc = async (code: string) => (await prisma.finAccount.findFirstOrThrow({ where: { companyId, code } })).id;
    seq++;
    const customer = await contacts.create(companyId, user, { name: `Customer ${seq}`, paymentTermsDays: 30, email: `c${seq}@example.com`, phone: `0244${String(100000 + seq)}` }, meta);
    return { companyId, vatId: vat.id, customer, cash: await acc("1110"), bank: await acc("1120"), revenue: await acc("4100"), salesGeneral: await acc("4500") };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  async function issue(c: Ctx, lines: ReturnType<typeof line>[], opts: { issueDate?: string; contactId?: string; terms?: string } = {}) {
    const d = await invoices.createDraft(c.companyId, user, { contactId: opts.contactId ?? c.customer.id, issueDate: opts.issueDate ?? ymd(0), lines }, meta);
    await invoices.send(c.companyId, user, d.id, meta);
    return invoices.get(c.companyId, d.id);
  }

  /** Net balance (debit positive) of an account code per the ledger. */
  async function ledgerBalance(c: Ctx, code: string) {
    const tb = await reports.trialBalance(c.companyId, { asOf: ymd(1) });
    const r = tb.rows.find((x) => x.code === code);
    return r ? Math.round((r.closingDebit - r.closingCredit) * 100) / 100 : 0;
  }
  async function trialBalanced(c: Ctx) {
    expect((await reports.trialBalance(c.companyId, { asOf: ymd(1) })).balanced).toBe(true);
  }
  const rawFails = (sql: string, text: RegExp) => expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow(text);

  // ─── invoices: drafting, posting ────────────────────────────────────────────

  describe("invoices: drafting and posting", () => {
    it("prices a draft exactly (discount, tax, an extra charge) and posts nothing yet", async () => {
      const c = await setup();
      const d = await invoices.createDraft(
        c.companyId, user,
        { contactId: c.customer.id, issueDate: ymd(0), lines: [line("Layer 1 C feed, 50 kg bag", 10, "336.00", { discountPercent: "5", taxCodeId: c.vatId }), line("Delivery", 1, "150.00", { isCharge: true, taxCodeId: c.vatId })] },
        meta
      );
      // 10 x 336 = 3,360.00; 5% off = 168.00; net 3,192.00; VAT 478.80 | delivery 150.00; VAT 22.50
      expect(d).toMatchObject({ status: "DRAFT", number: null, subtotal: "3510.00", discountTotal: "168.00", taxTotal: "501.30", total: "3843.30", balanceDue: "3843.30", displayStatus: "DRAFT" });
      expect(d.lines.map((l) => [l.lineNet, l.lineTax, l.lineTotal])).toEqual([["3192.00", "478.80", "3670.80"], ["150.00", "22.50", "172.50"]]);
      expect(d.dueDate).toBe(ymd(30)); // issue date + the customer's 30-day terms
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId } })).toBe(0);
    });

    it("issuing posts a balanced entry: Dr Receivables, Cr Sales by account, Cr Tax payable", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Eggs, tray of 30", 100, "55.00", { accountId: c.revenue, taxCodeId: c.vatId }), line("Spent hens", 10, "80.00"), line("Delivery", 1, "100.00", { isCharge: true })]);
      // 5,500.00 + VAT 825.00 | 800.00 | 100.00  => 7,225.00
      expect(inv).toMatchObject({ status: "SENT", paymentStatus: "UNPAID", displayStatus: "SENT", total: "7225.00", balanceDue: "7225.00", taxTotal: "825.00" });
      expect(inv.number).toMatch(/^INV-\d{4}-0001$/);
      const entry = await ledger.getEntry(c.companyId, inv.journalEntryId!);
      expect(entry.status).toBe("POSTED");
      expect(entry.lines.map((l) => [l.account.code, l.debit.toString(), l.credit.toString()])).toEqual([
        ["1210", "7225", "0"], // receivables
        ["4100", "0", "5500"], // the line's own income account (egg sales)
        ["4500", "0", "900"], // the two lines with no account fall back to the general sales role
        ["2180", "0", "825"] // tax payable
      ]);
      expect(await ledgerBalance(c, "1210")).toBe(7225);
      expect(await ledgerBalance(c, "4100")).toBe(-5500);
      expect(await ledgerBalance(c, "2180")).toBe(-825);
      await trialBalanced(c);
    });

    it("numbers invoices only when issued, in order, with no gaps from deleted drafts", async () => {
      const c = await setup();
      const a = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("A", 1, "10")] }, meta);
      await invoices.deleteDraft(c.companyId, user, a.id, meta);
      const one = await issue(c, [line("B", 1, "10")]);
      const two = await issue(c, [line("C", 1, "10")]);
      expect(one.number).toMatch(/-0001$/);
      expect(two.number).toMatch(/-0002$/);
    });

    it("refuses to issue: no value, a switched-off or supplier-only customer, a closed period, a missing tax account", async () => {
      const c = await setup();
      const free = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("Gift", 1, "50", { discountPercent: "100" })] }, meta);
      await expect(invoices.send(c.companyId, user, free.id, meta)).rejects.toThrow(/above zero/);

      const supplier = await contacts.create(c.companyId, user, { name: "Only A Supplier", isSupplier: true, isCustomer: false }, meta);
      await expect(invoices.createDraft(c.companyId, user, { contactId: supplier.id, issueDate: ymd(0), lines: [line("x", 1, "1")] }, meta)).rejects.toThrow(/supplier only/);

      const other = await contacts.create(c.companyId, user, { name: "Soon Off" }, meta);
      const draft = await invoices.createDraft(c.companyId, user, { contactId: other.id, issueDate: ymd(0), lines: [line("x", 1, "10")] }, meta);
      await contacts.update(c.companyId, user, other.id, { isActive: false }, meta);
      await expect(invoices.send(c.companyId, user, draft.id, meta)).rejects.toThrow(/switched off/);

      const old = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(-40), lines: [line("x", 1, "10")] }, meta);
      await ledger.setLock(c.companyId, user, ymd(-30), "Closed for the test", meta);
      await expect(invoices.send(c.companyId, user, old.id, meta)).rejects.toThrow(/books are closed/);

      const taxed = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("x", 1, "10", { taxCodeId: c.vatId })] }, meta);
      await prisma.finAccount.updateMany({ where: { companyId: c.companyId, code: "2180" }, data: { isActive: false } });
      await expect(invoices.send(c.companyId, user, taxed.id, meta)).rejects.toThrow(/inactive/);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId } })).toBe(0); // nothing leaked into the books
    });

    it("validates lines: tax code for purchases only, non-income account, bad amounts", async () => {
      const c = await setup();
      await tax.create(c.companyId, user, { code: "PIN", name: "Purchase tax", appliesTo: "PURCHASES", ratePercent: "5", effectiveFrom: "2026-01-01" }, meta);
      const pin = (await tax.list(c.companyId)).find((t) => t.code === "PIN")!;
      const bank = c.bank;
      const make = (l: ReturnType<typeof line>) => invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [l] }, meta);
      await expect(make(line("x", 1, "10", { taxCodeId: pin.id }))).rejects.toThrow(/purchases only/);
      await expect(make(line("x", 1, "10", { accountId: bank }))).rejects.toThrow(/not an income account/);
      await expect(make(line("x", 0, "10"))).rejects.toThrow(/Line 1/);
      await expect(make(line("x", 1, "-10"))).rejects.toThrow(/negative/);
      await expect(make(line("  ", 1, "10"))).rejects.toThrow(/description/);
      await expect(invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), dueDate: ymd(-1), lines: [line("x", 1, "1")] }, meta)).rejects.toThrow(/due date/);
    });

    it("a draft can be edited and re-priced; an issued invoice cannot, in the app or the database", async () => {
      const c = await setup();
      const d = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("A", 1, "100")] }, meta);
      const edited = await invoices.updateDraft(c.companyId, user, d.id, { lines: [line("A", 2, "100", { taxCodeId: c.vatId })], notes: "Thanks" }, meta);
      expect(edited).toMatchObject({ total: "230.00", notes: "Thanks" });
      await invoices.send(c.companyId, user, d.id, meta);
      await expect(invoices.updateDraft(c.companyId, user, d.id, { notes: "x" }, meta)).rejects.toThrow(/Only a draft/);
      await expect(invoices.deleteDraft(c.companyId, user, d.id, meta)).rejects.toThrow(/Only a draft/);
      await rawFails(`UPDATE fin_invoices SET total = 1 WHERE id = '${d.id}'`, /cannot be edited/);
      await rawFails(`UPDATE fin_invoices SET notes = 'changed' WHERE id = '${d.id}'`, /cannot be edited/);
      await rawFails(`UPDATE fin_invoice_lines SET unitPrice = 1 WHERE invoiceId = '${d.id}'`, /cannot be edited/);
      await rawFails(`DELETE FROM fin_invoice_lines WHERE invoiceId = '${d.id}'`, /cannot be deleted/);
      await rawFails(`DELETE FROM fin_invoices WHERE id = '${d.id}'`, /cannot be deleted/);
      await rawFails(`UPDATE fin_invoices SET balanceDue = 1 WHERE id = '${d.id}'`, /balance does not match/);
      await rawFails(`UPDATE fin_invoices SET paidAmount = 999, balanceDue = -769 WHERE id = '${d.id}'`, /Check constraint|balance/);
    });

    it("a later tax-rate change never alters an invoice that already exists", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 10, "100", { taxCodeId: c.vatId })]);
      await tax.addRate(c.companyId, user, c.vatId, { ratePercent: "20", effectiveFrom: ymd(1) }, meta);
      const again = await invoices.get(c.companyId, inv.id);
      expect(again).toMatchObject({ total: "1150.00", taxTotal: "150.00" });
      expect(again.lines[0].taxRatePercent).toBe("15.0000");
      const tomorrow = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(1), lines: [line("Feed", 10, "100", { taxCodeId: c.vatId })] }, meta);
      expect(tomorrow.taxTotal).toBe("200.00"); // a new invoice dated after the change uses the new rate
    });

    it("two people pressing Send at once issue the invoice exactly once", async () => {
      const c = await setup();
      const d = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("A", 1, "100")] }, meta);
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => invoices.send(c.companyId, user, d.id, meta)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_INVOICE" } })).toBe(1);
      expect(await ledgerBalance(c, "1210")).toBe(100);
    });

    it("gives 8 invoices issued at the same moment 8 different numbers", async () => {
      const c = await setup();
      const drafts = await Promise.all(Array.from({ length: 8 }, (_, i) => invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line(`L${i}`, 1, "10")] }, meta)));
      const sent = await Promise.all(drafts.map((d) => invoices.send(c.companyId, user, d.id, meta)));
      expect(new Set(sent.map((s) => s.number)).size).toBe(8);
      expect(await ledgerBalance(c, "1210")).toBe(80);
    });
  });

  // ─── receipts and partial payments ──────────────────────────────────────────

  describe("receipts and partial payments", () => {
    it("a part payment leaves the invoice partially paid; the rest completes it", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 10, "100.00")]); // 1,000.00
      const r1 = await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "MOBILE_MONEY", paidToAccountId: c.cash, reference: "MoMo 123", allocations: [{ invoiceId: inv.id, amount: "400" }] }, meta);
      expect(r1).toMatchObject({ amount: "400.00", status: "POSTED" });
      expect(r1.number).toMatch(/^RCT-\d{4}-0001$/);
      let now = await invoices.get(c.companyId, inv.id);
      expect(now).toMatchObject({ paidAmount: "400.00", balanceDue: "600.00", paymentStatus: "PARTIAL", displayStatus: "PARTIALLY_PAID" });
      expect(await ledgerBalance(c, "1110")).toBe(400);
      expect(await ledgerBalance(c, "1210")).toBe(600);

      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: "600" }] }, meta);
      now = await invoices.get(c.companyId, inv.id);
      expect(now).toMatchObject({ paidAmount: "1000.00", balanceDue: "0.00", paymentStatus: "PAID", displayStatus: "PAID" });
      expect(await ledgerBalance(c, "1210")).toBe(0);
      expect(now.allocations).toHaveLength(2);
      await trialBalanced(c);
    });

    it("one receipt can pay several invoices, all or nothing", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 1, "100")]);
      const b = await issue(c, [line("B", 1, "200")]);
      await expect(
        payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "BANK_TRANSFER", paidToAccountId: c.bank, allocations: [{ invoiceId: a.id, amount: "100" }, { invoiceId: b.id, amount: "999" }] }, meta)
      ).rejects.toThrow(/more than the invoice still owes/);
      expect((await invoices.get(c.companyId, a.id)).paymentStatus).toBe("UNPAID"); // the first allocation was rolled back too
      expect(await prisma.finReceipt.count({ where: { companyId: c.companyId } })).toBe(0);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_RECEIPT" } })).toBe(0);

      const r = await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "BANK_TRANSFER", paidToAccountId: c.bank, allocations: [{ invoiceId: a.id, amount: "100" }, { invoiceId: b.id, amount: "50.25" }] }, meta);
      expect(r.amount).toBe("150.25");
      expect((await invoices.get(c.companyId, a.id)).paymentStatus).toBe("PAID");
      expect(await invoices.get(c.companyId, b.id)).toMatchObject({ paymentStatus: "PARTIAL", balanceDue: "149.75" });
      expect(await ledgerBalance(c, "1120")).toBe(150.25);
    });

    it("refuses overpayment, other customers' invoices, drafts, bad accounts, repeats and impossible dates", async () => {
      const c = await setup();
      const inv = await issue(c, [line("A", 1, "100")]);
      const stranger = await contacts.create(c.companyId, user, { name: "Someone Else" }, meta);
      const strangerInv = await issue(c, [line("S", 1, "10")], { contactId: stranger.id });
      const draft = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("D", 1, "10")] }, meta);
      const pay = (allocations: { invoiceId: string; amount: string }[], extra: Record<string, unknown> = {}) =>
        payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations, ...extra } as never, meta);
      await expect(pay([{ invoiceId: inv.id, amount: "100.01" }])).rejects.toThrow(/more than the invoice still owes/);
      await expect(pay([{ invoiceId: strangerInv.id, amount: "5" }])).rejects.toThrow(/different customer/);
      await expect(pay([{ invoiceId: draft.id, amount: "5" }])).rejects.toThrow(/not open for payment/);
      await expect(pay([{ invoiceId: inv.id, amount: "0" }])).rejects.toThrow(/above zero/);
      await expect(pay([{ invoiceId: inv.id, amount: "5" }, { invoiceId: inv.id, amount: "5" }])).rejects.toThrow(/listed twice/);
      await expect(pay([{ invoiceId: inv.id, amount: "5.001" }])).rejects.toThrow(/2 decimal/);
      await expect(pay([{ invoiceId: inv.id, amount: "5" }], { paidToAccountId: c.revenue })).rejects.toThrow(/cannot receive money/);
      const receivable = (await prisma.finAccount.findFirstOrThrow({ where: { companyId: c.companyId, code: "1210" } })).id;
      await expect(pay([{ invoiceId: inv.id, amount: "5" }], { paidToAccountId: receivable })).rejects.toThrow(/not a cash or bank/);
      await expect(pay([{ invoiceId: inv.id, amount: "5" }], { receiptDate: ymd(-5) })).rejects.toThrow(/before .* was issued/);
      await expect(pay([{ invoiceId: randomUUID(), amount: "5" }])).rejects.toThrow(/does not exist/);
      expect((await invoices.get(c.companyId, inv.id)).paidAmount).toBe("0.00");
    });

    it("voiding a receipt reverses the books and reopens the invoice", async () => {
      const c = await setup();
      const inv = await issue(c, [line("A", 1, "500")]);
      const r = await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: "500" }] }, meta);
      expect((await invoices.get(c.companyId, inv.id)).paymentStatus).toBe("PAID");
      const voided = await payments.voidReceipt(c.companyId, user, r.id, "Cheque bounced", meta);
      expect(voided).toMatchObject({ status: "VOID", voidReason: "Cheque bounced" });
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paidAmount: "0.00", balanceDue: "500.00", paymentStatus: "UNPAID" });
      expect(await ledgerBalance(c, "1110")).toBe(0);
      expect(await ledgerBalance(c, "1210")).toBe(500);
      await expect(payments.voidReceipt(c.companyId, user, r.id, "again", meta)).rejects.toThrow(/already void/);
      await rawFails(`UPDATE fin_receipts SET amount = 1 WHERE id = '${r.id}'`, /can only be voided/);
      await rawFails(`DELETE FROM fin_receipts WHERE id = '${r.id}'`, /cannot be deleted/);
      await rawFails(`UPDATE fin_receipt_allocations SET amount = 1 WHERE receiptId = '${r.id}'`, /cannot be edited/);
      await trialBalanced(c);
    });

    it("lists receipts with totals (void ones excluded from the total)", async () => {
      const c = await setup();
      const inv = await issue(c, [line("A", 1, "300")]);
      const mk = (amt: string) => payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: amt }] }, meta);
      const r1 = await mk("100");
      await mk("50");
      await payments.voidReceipt(c.companyId, user, r1.id, "mistake", meta);
      const list = await payments.listReceipts(c.companyId, {});
      expect(list.total).toBe(2);
      expect(list.totals.received).toBe("50.00");
    });
  });

  // ─── customer deposits ──────────────────────────────────────────────────────

  describe("customer deposits", () => {
    it("a deposit is a liability until it is applied to an invoice", async () => {
      const c = await setup();
      const dep = await payments.recordDeposit(c.companyId, user, { contactId: c.customer.id, depositDate: ymd(-2), amount: "1000", method: "BANK_TRANSFER", paidToAccountId: c.bank, reference: "Advance for feed" }, meta);
      expect(dep).toMatchObject({ amount: "1000.00", appliedAmount: "0.00", remaining: "1000.00", status: "POSTED" });
      expect(dep.number).toMatch(/^DEP-\d{4}-0001$/);
      expect(await ledgerBalance(c, "1120")).toBe(1000);
      expect(await ledgerBalance(c, "2160")).toBe(-1000); // owed to the customer: a liability, not income
      expect(await ledgerBalance(c, "4500")).toBe(0);

      const inv = await issue(c, [line("Feed", 6, "100")]); // 600.00
      const after = await payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: inv.id, amount: "250" }, meta);
      expect(after).toMatchObject({ appliedAmount: "250.00", remaining: "750.00" });
      expect(after.applications).toHaveLength(1);
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paidAmount: "250.00", balanceDue: "350.00", paymentStatus: "PARTIAL" });
      expect(await ledgerBalance(c, "2160")).toBe(-750);
      expect(await ledgerBalance(c, "1210")).toBe(350);

      await payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: inv.id, amount: "350" }, meta);
      expect((await invoices.get(c.companyId, inv.id)).paymentStatus).toBe("PAID");
      expect(await ledgerBalance(c, "2160")).toBe(-400);
      expect(await ledgerBalance(c, "1210")).toBe(0);
      expect((await payments.listDeposits(c.companyId, { openOnly: true })).totals.unapplied).toBe("400.00");
      await trialBalanced(c);
    });

    it("refuses over-applying, other customers' invoices, drafts, and applying before the invoice or deposit existed", async () => {
      const c = await setup();
      const dep = await payments.recordDeposit(c.companyId, user, { contactId: c.customer.id, depositDate: ymd(0), amount: "100", method: "CASH", paidToAccountId: c.cash }, meta);
      const inv = await issue(c, [line("A", 1, "500")]);
      const stranger = await contacts.create(c.companyId, user, { name: "Stranger" }, meta);
      const other = await issue(c, [line("S", 1, "50")], { contactId: stranger.id });
      const draft = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("D", 1, "10")] }, meta);
      await expect(payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: inv.id, amount: "100.01" }, meta)).rejects.toThrow(/Only 100.00 is left/);
      await expect(payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: other.id, amount: "10" }, meta)).rejects.toThrow(/different customer/);
      await expect(payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: draft.id, amount: "10" }, meta)).rejects.toThrow(/not open for payment/);
      await expect(payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: inv.id, amount: "10", date: ymd(-3) }, meta)).rejects.toThrow(/cannot be before/);
      const small = await issue(c, [line("Small", 1, "30")]);
      await expect(payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: small.id, amount: "40" }, meta)).rejects.toThrow(/more than the invoice still owes/);
      expect((await payments.getDeposit(c.companyId, dep.id)).appliedAmount).toBe("0.00"); // nothing half-applied
    });

    it("an unused deposit can be voided; one that has been applied cannot", async () => {
      const c = await setup();
      const dep = await payments.recordDeposit(c.companyId, user, { contactId: c.customer.id, depositDate: ymd(0), amount: "200", method: "CASH", paidToAccountId: c.cash }, meta);
      const used = await payments.recordDeposit(c.companyId, user, { contactId: c.customer.id, depositDate: ymd(0), amount: "300", method: "CASH", paidToAccountId: c.cash }, meta);
      const inv = await issue(c, [line("A", 1, "100")]);
      await payments.applyDeposit(c.companyId, user, used.id, { invoiceId: inv.id, amount: "100" }, meta);
      await expect(payments.voidDeposit(c.companyId, user, used.id, "oops", meta)).rejects.toThrow(/has been applied/);
      const v = await payments.voidDeposit(c.companyId, user, dep.id, "Entered twice", meta);
      expect(v.status).toBe("VOID");
      expect(await ledgerBalance(c, "2160")).toBe(-200); // only the used deposit's remaining 200 is still owed
      await expect(payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: inv.id, amount: "1" }, meta)).rejects.toThrow(/void/);
      await rawFails(`UPDATE fin_customer_deposits SET amount = 5 WHERE id = '${dep.id}'`, /void deposit/);
      await rawFails(`DELETE FROM fin_customer_deposits WHERE id = '${used.id}'`, /cannot be deleted/);
      await rawFails(`DELETE FROM fin_deposit_applications WHERE depositId = '${used.id}'`, /cannot be deleted/);
      await trialBalanced(c);
    });
  });

  // ─── credit notes ───────────────────────────────────────────────────────────

  describe("credit notes", () => {
    it("a partial return reduces what the customer owes and reverses sales and tax in proportion", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 10, "100", { taxCodeId: c.vatId })]); // 1,000 + 150 VAT = 1,150
      const cn = await credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "3 bags damaged", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "3" }] }, meta);
      expect(cn).toMatchObject({ total: "345.00", taxTotal: "45.00", appliedToInvoice: "345.00", excessToDeposit: "0.00", status: "POSTED" });
      expect(cn.number).toMatch(/^CN-\d{4}-0001$/);
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ creditedAmount: "345.00", balanceDue: "805.00", paymentStatus: "PARTIAL" });
      expect(await ledgerBalance(c, "1210")).toBe(805);
      expect(await ledgerBalance(c, "4500")).toBe(-700); // sales net of the return
      expect(await ledgerBalance(c, "2180")).toBe(-105); // tax net of the return
      await trialBalanced(c);
    });

    it("tracks what is left to credit and uses the exact remainder, so no pesewa is ever stranded", async () => {
      const c = await setup();
      // 3 x 33.33 = 99.99; VAT 15.00 (14.9985 -> 15.00); total 114.99
      const inv = await issue(c, [line("Odd price", 3, "33.33", { taxCodeId: c.vatId })]);
      expect(inv.total).toBe("114.99");
      const first = await credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "one back", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "1" }] }, meta);
      await expect(credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "too many", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "2.0001" }] }, meta)).rejects.toThrow(/only 2.0000 .* left to credit/);
      const rest = await credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "the rest", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "2" }] }, meta);
      const sum = Math.round((Number(first.total) + Number(rest.total)) * 100) / 100;
      expect(sum).toBe(114.99); // the two credits add up to the invoice exactly
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ creditedAmount: "114.99", balanceDue: "0.00", paymentStatus: "PAID" });
      await expect(credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "nothing left", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "0.0001" }] }, meta)).rejects.toThrow(/left to credit/);
      expect(await ledgerBalance(c, "1210")).toBe(0);
      expect(await ledgerBalance(c, "4500")).toBe(0);
      expect(await ledgerBalance(c, "2180")).toBe(0);
      await trialBalanced(c);
    });

    it("crediting an invoice that is already paid turns the excess into customer credit, which can pay another invoice", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 4, "250")]); // 1,000
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: "1000" }] }, meta);
      const cn = await credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "Returned 2 bags", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "2" }] }, meta);
      expect(cn).toMatchObject({ total: "500.00", appliedToInvoice: "0.00", excessToDeposit: "500.00" });
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paymentStatus: "PAID", balanceDue: "0.00", creditedAmount: "0.00" });
      expect(await ledgerBalance(c, "2160")).toBe(-500); // we owe the customer 500
      expect(await ledgerBalance(c, "4500")).toBe(-500);
      const dep = (await payments.listDeposits(c.companyId, { openOnly: true })).rows[0];
      expect(dep).toMatchObject({ remaining: "500.00", sourceCreditNoteId: cn.id });

      const next = await issue(c, [line("More feed", 1, "300")]);
      await payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: next.id, amount: "300" }, meta);
      expect((await invoices.get(c.companyId, next.id)).paymentStatus).toBe("PAID");
      await expect(credits.voidCreditNote(c.companyId, user, cn.id, "changed my mind", meta)).rejects.toThrow(/already been used/);
      await trialBalanced(c);
    });

    it("a credit note can be voided, which restores the invoice and cancels its customer credit", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 4, "250", { taxCodeId: c.vatId })]); // 1,150
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: "1000" }] }, meta);
      // 150 still owed. Credit 2 bags = 575: 150 reduces the debt, 425 becomes customer credit.
      const cn = await credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "Returned", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "2" }] }, meta);
      expect(cn).toMatchObject({ total: "575.00", appliedToInvoice: "150.00", excessToDeposit: "425.00" });
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paymentStatus: "PAID", balanceDue: "0.00", creditedAmount: "150.00" });
      const v = await credits.voidCreditNote(c.companyId, user, cn.id, "Return refused", meta);
      expect(v.status).toBe("VOID");
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paymentStatus: "PARTIAL", balanceDue: "150.00", creditedAmount: "0.00" });
      expect(await ledgerBalance(c, "2160")).toBe(0);
      expect(await ledgerBalance(c, "1210")).toBe(150);
      expect((await payments.listDeposits(c.companyId, { openOnly: true })).total).toBe(0);
      await expect(credits.voidCreditNote(c.companyId, user, cn.id, "again", meta)).rejects.toThrow(/already void/);
      // the freed quantity can be credited again
      await expect(credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "again", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "4" }] }, meta)).resolves.toBeDefined();
      await trialBalanced(c);
    });

    it("refuses: draft or void invoices, foreign lines, repeated lines, a date before the invoice", async () => {
      const c = await setup();
      const draft = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("D", 1, "10")] }, meta);
      const inv = await issue(c, [line("A", 2, "10"), line("B", 1, "5")]);
      const other = await issue(c, [line("X", 1, "10")]);
      await expect(credits.create(c.companyId, user, { invoiceId: draft.id, creditDate: ymd(0), reason: "nope", lines: [{ invoiceLineId: draft.lines[0].id, quantity: "1" }] }, meta)).rejects.toThrow(/issued invoice/);
      await expect(credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "nope", lines: [{ invoiceLineId: other.lines[0].id, quantity: "1" }] }, meta)).rejects.toThrow(/not a line of this invoice/);
      await expect(credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "nope", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "1" }, { invoiceLineId: inv.lines[0].id, quantity: "1" }] }, meta)).rejects.toThrow(/listed twice/);
      await expect(credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(-3), reason: "nope", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "1" }] }, meta)).rejects.toThrow(/before the invoice date/);
      await invoices.voidInvoice(c.companyId, user, other.id, "wrong customer", meta);
      await expect(credits.create(c.companyId, user, { invoiceId: other.id, creditDate: ymd(0), reason: "nope", lines: [{ invoiceLineId: other.lines[0].id, quantity: "1" }] }, meta)).rejects.toThrow(/issued invoice/);
    });

    it("keeps credit notes immutable in the database", async () => {
      const c = await setup();
      const inv = await issue(c, [line("A", 2, "50")]);
      const cn = await credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "return", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "1" }] }, meta);
      await rawFails(`UPDATE fin_credit_notes SET total = 1 WHERE id = '${cn.id}'`, /can only be voided/);
      await rawFails(`DELETE FROM fin_credit_notes WHERE id = '${cn.id}'`, /cannot be deleted/);
      await rawFails(`UPDATE fin_credit_note_lines SET quantity = 9 WHERE creditNoteId = '${cn.id}'`, /cannot be edited/);
      await rawFails(`DELETE FROM fin_credit_note_lines WHERE creditNoteId = '${cn.id}'`, /cannot be deleted/);
    });
  });

  // ─── voiding invoices ───────────────────────────────────────────────────────

  describe("voiding invoices", () => {
    it("voids an unpaid invoice with an exact reversing entry and keeps the number", async () => {
      const c = await setup();
      const inv = await issue(c, [line("A", 3, "100", { taxCodeId: c.vatId })]);
      expect(await ledgerBalance(c, "1210")).toBe(345);
      const v = await invoices.voidInvoice(c.companyId, user, inv.id, "Wrong customer", meta);
      expect(v).toMatchObject({ status: "VOID", displayStatus: "VOID", balanceDue: "0.00", voidReason: "Wrong customer", number: inv.number });
      expect(await ledgerBalance(c, "1210")).toBe(0);
      expect(await ledgerBalance(c, "4500")).toBe(0);
      expect(await ledgerBalance(c, "2180")).toBe(0);
      const original = await ledger.getEntry(c.companyId, inv.journalEntryId!);
      expect(original.status).toBe("REVERSED");
      await trialBalanced(c);
      await expect(invoices.voidInvoice(c.companyId, user, inv.id, "again", meta)).rejects.toThrow(/already void/);
      await expect(payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: "1" }] }, meta)).rejects.toThrow(/not open for payment/);
      await rawFails(`UPDATE fin_invoices SET notes = 'x' WHERE id = '${inv.id}'`, /void invoice cannot be changed/);
    });

    it("cannot be voided once money or credit has touched it; works again after those are voided", async () => {
      const c = await setup();
      const inv = await issue(c, [line("A", 2, "100")]);
      const r = await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: "50" }] }, meta);
      await expect(invoices.voidInvoice(c.companyId, user, inv.id, "no", meta)).rejects.toThrow(/payments or credit notes/);
      const cn = await credits.create(c.companyId, user, { invoiceId: inv.id, creditDate: ymd(0), reason: "r", lines: [{ invoiceLineId: inv.lines[0].id, quantity: "1" }] }, meta);
      await payments.voidReceipt(c.companyId, user, r.id, "undo", meta);
      await expect(invoices.voidInvoice(c.companyId, user, inv.id, "no", meta)).rejects.toThrow(/payments or credit notes/); // the credit note is still there
      await credits.voidCreditNote(c.companyId, user, cn.id, "undo", meta);
      await expect(invoices.voidInvoice(c.companyId, user, inv.id, "Now fine", meta)).resolves.toMatchObject({ status: "VOID" });
      expect(await ledgerBalance(c, "1210")).toBe(0);
      expect(await ledgerBalance(c, "1110")).toBe(0);
      await trialBalanced(c);
    });

    it("a draft is deleted, not voided; an invoice in a closed period cannot be voided", async () => {
      const c = await setup();
      const d = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("A", 1, "10")] }, meta);
      await expect(invoices.voidInvoice(c.companyId, user, d.id, "no", meta)).rejects.toThrow(/deleted, not voided/);
      const old = await issue(c, [line("Old", 1, "10")], { issueDate: ymd(-20) });
      await ledger.setLock(c.companyId, user, ymd(-10), "closed", meta);
      // The reversal moves to today's date, which is open, so the void works and the closed period is untouched.
      const v = await invoices.voidInvoice(c.companyId, user, old.id, "late fix", meta);
      expect(v.status).toBe("VOID");
      expect(await ledgerBalance(c, "1210")).toBe(0);
    });
  });

  // ─── lists, filters, totals ─────────────────────────────────────────────────

  describe("invoice lists", () => {
    it("filters by status, customer, date and search, with totals that match", async () => {
      const c = await setup();
      const other = await contacts.create(c.companyId, user, { name: "Other Customer", paymentTermsDays: 0 }, meta);
      const overdue = await issue(c, [line("Old", 1, "100")], { issueDate: ymd(-60) }); // due 30 days ago
      const open = await issue(c, [line("Open", 1, "200")]);
      const partial = await issue(c, [line("Part", 1, "300")]);
      const paid = await issue(c, [line("Paid", 1, "400")], { contactId: other.id });
      const voided = await issue(c, [line("Void", 1, "500")]);
      const draft = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("Draft", 1, "600")] }, meta);
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: partial.id, amount: "100" }] }, meta);
      await payments.recordReceipt(c.companyId, user, { contactId: other.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: paid.id, amount: "400" }] }, meta);
      await invoices.voidInvoice(c.companyId, user, voided.id, "mistake", meta);

      const ids = async (q: object) => (await invoices.list(c.companyId, q)).rows.map((r) => r.id).sort();
      expect(await ids({ status: "draft" })).toEqual([draft.id]);
      expect(await ids({ status: "void" })).toEqual([voided.id]);
      expect(await ids({ status: "paid" })).toEqual([paid.id]);
      expect(await ids({ status: "partial" })).toEqual([partial.id]);
      expect(await ids({ status: "overdue" })).toEqual([overdue.id]);
      expect(await ids({ status: "open" })).toEqual([overdue.id, open.id, partial.id].sort());
      expect((await invoices.list(c.companyId, {})).total).toBe(6);
      expect(await ids({ contactId: other.id })).toEqual([paid.id]);
      expect(await ids({ from: ymd(-5) })).toHaveLength(5);
      expect(await ids({ search: "Other Customer" })).toEqual([paid.id]);
      expect(await ids({ search: overdue.number! })).toEqual([overdue.id]);

      const all = await invoices.list(c.companyId, {});
      expect(all.totals).toEqual({ invoiced: "1000.00", paid: "500.00", credited: "0.00", outstanding: "500.00", overdue: "100.00" });
      // the outstanding figure agrees with the ledger's receivables account
      expect(await ledgerBalance(c, "1210")).toBe(500);
    });
  });

  // ─── quotes ─────────────────────────────────────────────────────────────────

  describe("quotes", () => {
    it("goes draft -> sent (numbered) -> accepted, and expires only when sent and past its date", async () => {
      const c = await setup();
      const q = await quotes.create(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), validUntil: ymd(14), lines: [line("Feed", 20, "300", { taxCodeId: c.vatId })] }, meta);
      expect(q).toMatchObject({ status: "DRAFT", number: null, total: "6900.00", validUntil: ymd(14) });
      const sent = await quotes.send(c.companyId, user, q.id, meta);
      expect(sent.status).toBe("SENT");
      expect(sent.number).toMatch(/^QUO-\d{4}-0001$/);
      await expect(quotes.update(c.companyId, user, q.id, { notes: "x" }, meta)).rejects.toThrow(/Only a draft/);
      await expect(quotes.remove(c.companyId, user, q.id, meta)).rejects.toThrow(/Only a draft/);
      expect((await quotes.respond(c.companyId, user, q.id, "ACCEPTED", meta)).status).toBe("ACCEPTED");
      await expect(quotes.respond(c.companyId, user, q.id, "DECLINED", meta)).rejects.toThrow(/Only a quote that has been sent/);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId } })).toBe(0); // a quote never touches the books

      const stale = await quotes.create(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(-40), validUntil: ymd(-10), lines: [line("Old", 1, "10")] }, meta);
      await quotes.send(c.companyId, user, stale.id, meta);
      const draftOld = await quotes.create(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(-40), validUntil: ymd(-10), lines: [line("OldDraft", 1, "10")] }, meta);
      const fresh = await quotes.create(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("Fresh", 1, "10")] }, meta);
      await quotes.send(c.companyId, user, fresh.id, meta);
      expect(await quotes.expireDue(undefined, c.companyId)).toBe(1);
      expect((await quotes.get(c.companyId, stale.id)).status).toBe("EXPIRED");
      expect((await quotes.get(c.companyId, draftOld.id)).status).toBe("DRAFT");
      expect((await quotes.get(c.companyId, fresh.id)).status).toBe("SENT");
      expect((await quotes.get(c.companyId, q.id)).status).toBe("ACCEPTED");
    });

    it("converts to a draft invoice in one step: every line copied, both records linked, only once", async () => {
      const c = await setup();
      const q = await quotes.create(
        c.companyId, user,
        { contactId: c.customer.id, issueDate: ymd(-3), notes: "Delivery Friday", terms: "Cash on delivery", lines: [line("Layer feed", 10, "336", { discountPercent: "2.5", taxCodeId: c.vatId, accountId: c.revenue }), line("Delivery", 1, "120", { isCharge: true })] },
        meta
      );
      await quotes.send(c.companyId, user, q.id, meta);
      const { quote, invoice } = await quotes.convertToInvoice(c.companyId, user, q.id, meta);
      expect(quote).toMatchObject({ status: "ACCEPTED", invoiceId: invoice.id });
      expect(invoice).toMatchObject({ status: "DRAFT", quoteId: q.id, notes: "Delivery Friday", terms: "Cash on delivery", issueDate: ymd(0) });
      expect(invoice.lines.map((l) => [l.description, l.quantity, l.unitPrice, l.discountPercent, l.accountId, l.isCharge])).toEqual([
        ["Layer feed", "10.0000", "336.00", "2.50", c.revenue, false],
        ["Delivery", "1.0000", "120.00", "0.00", null, true]
      ]);
      const original = await quotes.get(c.companyId, q.id);
      expect(invoice.total).toBe(original.total); // same lines, same money
      await expect(quotes.convertToInvoice(c.companyId, user, q.id, meta)).rejects.toThrow(/already been converted/);
      // the invoice is a normal draft: it can be issued
      await invoices.send(c.companyId, user, invoice.id, meta);
      expect(await ledgerBalance(c, "1210")).toBe(Number(invoice.total));
    });

    it("will not convert a declined or expired quote, and a draft quote can be converted", async () => {
      const c = await setup();
      const mk = async () => quotes.create(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("A", 1, "10")] }, meta);
      const declined = await mk();
      await quotes.send(c.companyId, user, declined.id, meta);
      await quotes.respond(c.companyId, user, declined.id, "DECLINED", meta);
      await expect(quotes.convertToInvoice(c.companyId, user, declined.id, meta)).rejects.toThrow(/declined quote cannot be converted/);
      const draft = await mk();
      const r = await quotes.convertToInvoice(c.companyId, user, draft.id, meta);
      expect(r.invoice.status).toBe("DRAFT");
    });
  });

  // ─── recurring invoices ─────────────────────────────────────────────────────

  describe("recurring invoices", () => {
    it("creates each run once, advances the schedule, and is safe to run twice", async () => {
      const c = await setup();
      const r = await recurring.create(c.companyId, user, { name: "Weekly feed", contactId: c.customer.id, frequency: "WEEKLY", startDate: ymd(0), lines: [line("Feed", 5, "100", { taxCodeId: c.vatId })] }, meta);
      expect(r).toMatchObject({ nextRunDate: ymd(0), active: true, runCount: 0 });
      const first = await recurring.runDue(undefined, c.companyId);
      expect(first.created).toBeGreaterThanOrEqual(1);
      const again = await recurring.runDue(undefined, c.companyId);
      expect(again.created).toBe(0); // nothing is due any more
      const made = await prisma.finInvoice.findMany({ where: { recurringId: r.id } });
      expect(made).toHaveLength(1);
      expect(made[0]).toMatchObject({ status: "DRAFT" });
      expect(dayString(made[0].issueDate)).toBe(ymd(0));
      expect(Number(made[0].total)).toBe(575);
      const next = await recurring.get(c.companyId, r.id);
      expect(next).toMatchObject({ nextRunDate: ymd(7), runCount: 1 });
      // even if the schedule is wound back, the same run date can never produce a second invoice
      await prisma.finRecurringInvoice.update({ where: { id: r.id }, data: { nextRunDate: parseDay(ymd(0)), runCount: 0 } });
      await recurring.runDue(undefined, c.companyId);
      expect(await prisma.finInvoice.count({ where: { recurringId: r.id } })).toBe(1);
    });

    it("with auto-send the invoice is issued and posted; if issuing fails it stays a draft and the schedule still moves on", async () => {
      const c = await setup();
      const ok = await recurring.create(c.companyId, user, { name: "Auto", contactId: c.customer.id, frequency: "MONTHLY", startDate: ymd(0), autoSend: true, termsDays: 14, lines: [line("Subscription", 1, "250")] }, meta);
      await recurring.runDue(undefined, c.companyId);
      const inv = await prisma.finInvoice.findFirstOrThrow({ where: { recurringId: ok.id } });
      expect(inv).toMatchObject({ status: "SENT" });
      expect(inv.number).toMatch(/^INV-/);
      expect(dayString(inv.dueDate)).toBe(ymd(14));
      expect(await ledgerBalance(c, "1210")).toBe(250);

      const bad = await recurring.create(c.companyId, user, { name: "Will fail", contactId: c.customer.id, frequency: "WEEKLY", startDate: ymd(0), autoSend: true, lines: [line("X", 1, "10", { taxCodeId: c.vatId })] }, meta);
      await prisma.finAccount.updateMany({ where: { companyId: c.companyId, code: "2180" }, data: { isActive: false } }); // the books cannot take tax postings now
      const res = await recurring.runDue(undefined, c.companyId);
      expect(res.failed).toBeGreaterThanOrEqual(1);
      const draft = await prisma.finInvoice.findFirstOrThrow({ where: { recurringId: bad.id } });
      expect(draft.status).toBe("DRAFT");
      expect((await recurring.get(c.companyId, bad.id)).runCount).toBe(1);
    });

    it("catches up a missed backlog a few runs at a time, and stops at the end date", async () => {
      const c = await setup();
      const r = await recurring.create(c.companyId, user, { name: "Backlog", contactId: c.customer.id, frequency: "WEEKLY", startDate: ymd(0), endDate: ymd(60), lines: [line("A", 1, "10")] }, meta);
      await prisma.finRecurringInvoice.update({ where: { id: r.id }, data: { nextRunDate: parseDay(ymd(-70)), startDate: parseDay(ymd(-70)), endDate: parseDay(ymd(-30)) } });
      const first = await recurring.runDue(undefined, c.companyId);
      expect(first.created).toBe(FinRecurringService.MAX_CATCH_UP);
      await recurring.runDue(undefined, c.companyId);
      await recurring.runDue(undefined, c.companyId);
      const after = await recurring.get(c.companyId, r.id);
      expect(after.active).toBe(false); // passed its end date
      const dates = (await prisma.finInvoice.findMany({ where: { recurringId: r.id }, orderBy: { issueDate: "asc" } })).map((i) => dayString(i.issueDate));
      expect(dates[0]).toBe(ymd(-70));
      expect(dates[dates.length - 1] <= ymd(-30)).toBe(true);
      expect(new Set(dates).size).toBe(dates.length);
    });

    it("rejects a past start date or a bad template up front, and can be paused and resumed", async () => {
      const c = await setup();
      await expect(recurring.create(c.companyId, user, { name: "Past", contactId: c.customer.id, frequency: "WEEKLY", startDate: ymd(-1), lines: [line("A", 1, "10")] }, meta)).rejects.toThrow(/today or a future date/);
      await expect(recurring.create(c.companyId, user, { name: "Bad", contactId: c.customer.id, frequency: "WEEKLY", startDate: ymd(0), lines: [line("A", 0, "10")] }, meta)).rejects.toThrow(/Line 1/);
      await expect(recurring.create(c.companyId, user, { name: "End", contactId: c.customer.id, frequency: "WEEKLY", startDate: ymd(2), endDate: ymd(1), lines: [line("A", 1, "10")] }, meta)).rejects.toThrow(/end date/);
      const r = await recurring.create(c.companyId, user, { name: "Pausable", contactId: c.customer.id, frequency: "WEEKLY", startDate: ymd(0), lines: [line("A", 1, "10")] }, meta);
      await recurring.setActive(c.companyId, user, r.id, false, meta);
      await recurring.runDue(undefined, c.companyId);
      expect(await prisma.finInvoice.count({ where: { recurringId: r.id } })).toBe(0);
      await recurring.setActive(c.companyId, user, r.id, true, meta);
      await recurring.runDue(undefined, c.companyId);
      expect(await prisma.finInvoice.count({ where: { recurringId: r.id } })).toBe(1);
    });
  });

  // ─── statements ─────────────────────────────────────────────────────────────

  describe("customer statements", () => {
    it("shows opening balance, every movement in date order with a running balance, and closes to what is owed", async () => {
      const c = await setup();
      const inv1 = await issue(c, [line("Old order", 1, "1000")], { issueDate: ymd(-50) });
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(-45), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv1.id, amount: "300" }] }, meta);
      const inv2 = await issue(c, [line("This month", 2, "250", { taxCodeId: c.vatId })], { issueDate: ymd(-10) }); // 575
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(-5), method: "BANK_TRANSFER", paidToAccountId: c.bank, allocations: [{ invoiceId: inv2.id, amount: "200" }] }, meta);
      const dep = await payments.recordDeposit(c.companyId, user, { contactId: c.customer.id, depositDate: ymd(-4), amount: "100", method: "CASH", paidToAccountId: c.cash }, meta);
      await payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: inv1.id, amount: "60", date: ymd(-3) }, meta);
      await credits.create(c.companyId, user, { invoiceId: inv2.id, creditDate: ymd(-2), reason: "Returned a bag", lines: [{ invoiceLineId: inv2.lines[0].id, quantity: "1" }] }, meta);
      const voided = await issue(c, [line("Mistake", 1, "999")], { issueDate: ymd(-6) });
      await invoices.voidInvoice(c.companyId, user, voided.id, "oops", meta);

      const s = await statements.build(c.companyId, c.customer.id, ymd(-30), ymd(0));
      // before the window: +1000 - 300 = 700
      expect(s.openingBalance).toBe("700.00");
      expect(s.rows.map((r) => [r.type, r.debit, r.credit, r.balance])).toEqual([
        ["INVOICE", "575.00", "", "1275.00"],
        ["RECEIPT", "", "200.00", "1075.00"],
        ["DEPOSIT_APPLIED", "", "60.00", "1015.00"],
        ["CREDIT_NOTE", "", "287.50", "727.50"]
      ]);
      expect(s).toMatchObject({ totalDebits: "575.00", totalCredits: "547.50", closingBalance: "727.50", unappliedDeposits: "40.00" });
      // the statement closes to exactly what the invoices say is owed, and to the ledger
      const owed = (await invoices.list(c.companyId, { contactId: c.customer.id })).totals.outstanding;
      expect(owed).toBe("727.50");
      expect(await ledgerBalance(c, "1210")).toBe(727.5);

      const wide = await statements.build(c.companyId, c.customer.id, ymd(-100), ymd(0));
      expect(wide.openingBalance).toBe("0.00");
      expect(wide.closingBalance).toBe("727.50");
      expect(wide.rows).toHaveLength(6);
      const early = await statements.build(c.companyId, c.customer.id, ymd(-100), ymd(-20));
      expect(early.closingBalance).toBe("700.00");
      await expect(statements.build(c.companyId, c.customer.id, ymd(0), ymd(-1))).rejects.toThrow(/after the end date/);
      await expect(statements.build(c.companyId, randomUUID(), ymd(-1), ymd(0))).rejects.toThrow(/not found/);
    });
  });

  // ─── sharing: pdf, whatsapp, email, public links ────────────────────────────

  describe("sharing", () => {
    it("makes PDFs of an invoice and a statement", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Layer feed", 10, "336", { taxCodeId: c.vatId }), line("Delivery", 1, "100", { isCharge: true })]);
      await prisma.finSettings.upsert({ where: { companyId: c.companyId }, update: { businessName: "Jokas Farms", tin: "C0012345678" }, create: { companyId: c.companyId, businessName: "Jokas Farms", tin: "C0012345678" } });
      const pdf = await share.invoicePdf(c.companyId, inv.id);
      expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.buffer.length).toBeGreaterThan(1500);
      expect(pdf.filename).toBe(`${inv.number}.pdf`);
      const st = await share.statementPdf(c.companyId, c.customer.id, ymd(-30), ymd(0));
      expect(st.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      // a long invoice paginates without error
      const many = await issue(c, Array.from({ length: 60 }, (_, i) => line(`Item number ${i + 1} with a reasonably long description to wrap`, 1, "10")));
      expect((await share.invoicePdf(c.companyId, many.id)).buffer.length).toBeGreaterThan(3000);
    });

    it("gives an unguessable public link, a WhatsApp link, and lets the customer open it with no login", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "100")]);
      const info = await share.invoiceShare(c.companyId, inv.id);
      expect(info.link).toMatch(/\/p\/invoice\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
      expect(info.whatsappUrl).toContain("https://wa.me/233244");
      expect(decodeURIComponent(info.whatsappUrl!)).toContain(info.link!);
      const token = info.link!.split("/p/invoice/")[1];
      const pub = await share.publicInvoice(token);
      expect(pub.invoice).toMatchObject({ number: inv.number, total: "100.00", displayStatus: "SENT" });
      expect(pub.invoice.contact.name).toBe(c.customer.name);
      expect((await share.publicInvoicePdf(token)).buffer.subarray(0, 5).toString()).toBe("%PDF-");
    });

    it("answers every wrong token the same way, and a drafts or a switched-off link does not open", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "100")]);
      const token = (await share.invoiceShare(c.companyId, inv.id)).link!.split("/p/invoice/")[1];
      const [id, mac] = token.split(".");
      for (const bad of ["", "nonsense", `${id}.${"A".repeat(32)}`, `${randomUUID()}.${mac}`, `${id}.${mac}.x`]) {
        await expect(share.publicInvoice(bad)).rejects.toThrow("This link is not valid.");
      }
      const draft = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("D", 1, "10")] }, meta);
      await expect(share.publicInvoice(`${draft.id}.${links.invoiceToken(draft.id, 1).split(".")[1]}`)).rejects.toThrow("This link is not valid.");
      await expect(share.invoiceShare(c.companyId, draft.id)).rejects.toThrow(/Issue the invoice first/);

      await invoices.setLink(c.companyId, user, inv.id, "disable", meta);
      await expect(share.publicInvoice(token)).rejects.toThrow("This link is not valid.");
      expect((await share.invoiceShare(c.companyId, inv.id)).link).toBeNull();
      await invoices.setLink(c.companyId, user, inv.id, "enable", meta);
      await expect(share.publicInvoice(token)).resolves.toBeDefined();
    });

    it("regenerating the link kills the old one at once", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "100")]);
      const oldToken = (await share.invoiceShare(c.companyId, inv.id)).link!.split("/p/invoice/")[1];
      await invoices.setLink(c.companyId, user, inv.id, "regenerate", meta);
      const newToken = (await share.invoiceShare(c.companyId, inv.id)).link!.split("/p/invoice/")[1];
      expect(newToken).not.toBe(oldToken);
      await expect(share.publicInvoice(oldToken)).rejects.toThrow("This link is not valid.");
      await expect(share.publicInvoice(newToken)).resolves.toBeDefined();
      // a link keeps working after the invoice is paid (the customer can still download a receipt-style copy)
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: inv.id, amount: "100" }] }, meta);
      expect((await share.publicInvoice(newToken)).invoice.displayStatus).toBe("PAID");
    });

    it("emails an invoice with the PDF and link, and reports a failed send honestly", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "100")]);
      const r = await share.emailInvoice(c.companyId, user, inv.id, { message: "Thanks for your order" }, meta);
      expect(r.sentTo).toBe(c.customer.email);
      expect(email.sendWithAttachment).toHaveBeenCalledTimes(1);
      const [to, subject, html, attachment] = email.sendWithAttachment.mock.calls[0];
      expect(to).toBe(c.customer.email);
      expect(subject).toContain(inv.number);
      expect(html).toContain("Thanks for your order");
      expect(html).toContain("/p/invoice/");
      expect(attachment.content.subarray(0, 5).toString()).toBe("%PDF-");
      expect(await prisma.finAuditLog.count({ where: { companyId: c.companyId, action: "EMAIL_INVOICE" } })).toBe(1);

      expect((await share.emailInvoice(c.companyId, user, inv.id, { to: "accounts@example.org" }, meta)).sentTo).toBe("accounts@example.org");
      email.sendWithAttachment.mockResolvedValueOnce(false);
      await expect(share.emailInvoice(c.companyId, user, inv.id, {}, meta)).rejects.toThrow(/could not be sent/);
      const noEmail = await contacts.create(c.companyId, user, { name: "No Email Ltd" }, meta);
      const inv2 = await issue(c, [line("A", 1, "10")], { contactId: noEmail.id });
      await expect(share.emailInvoice(c.companyId, user, inv2.id, {}, meta)).rejects.toThrow(/no email address/);
      const draft = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("D", 1, "10")] }, meta);
      await expect(share.emailInvoice(c.companyId, user, draft.id, {}, meta)).rejects.toThrow(/before emailing/);
    });

    it("shares a statement by public link, PDF, WhatsApp and email, and the link covers only its own date range", async () => {
      const c = await setup();
      await issue(c, [line("Feed", 1, "100")]);
      const info = await share.statementShare(c.companyId, c.customer.id, ymd(-30), ymd(0));
      expect(info.link).toContain("/p/statement/");
      const token = info.link.split("/p/statement/")[1];
      const pub = await share.publicStatement(token);
      expect(pub.statement).toMatchObject({ closingBalance: "100.00", from: ymd(-30), to: ymd(0) });
      expect((await share.publicStatementPdf(token)).buffer.subarray(0, 5).toString()).toBe("%PDF-");
      const parts = token.split(".");
      await expect(share.publicStatement(`${parts[0]}.${ymd(-300)}.${parts[2]}.${parts[3]}`)).rejects.toThrow("This link is not valid.");
      expect((await share.emailStatement(c.companyId, user, c.customer.id, ymd(-30), ymd(0), {}, meta)).sentTo).toBe(c.customer.email);
    });
  });

  // ─── overdue reminders ──────────────────────────────────────────────────────

  describe("overdue reminders", () => {
    async function overdueInvoice(c: Ctx, daysOverdue: number, contactId?: string) {
      // issued far enough back that it is `daysOverdue` days past its 30-day due date today
      return issue(c, [line("Feed", 1, "100")], { issueDate: ymd(-(30 + daysOverdue)), contactId });
    }
    const logs = (invoiceId: string) => prisma.finReminderLog.findMany({ where: { invoiceId }, orderBy: { step: "asc" } });

    it("sends one reminder per step and never repeats it", async () => {
      const c = await setup();
      const inv = await overdueInvoice(c, 1);
      const r1 = await reminders.run(undefined, c.companyId);
      expect(r1.sent).toBeGreaterThanOrEqual(1);
      expect(email.send).toHaveBeenCalledWith(c.customer.email, expect.stringContaining("1 day overdue"), expect.stringContaining("/p/invoice/"));
      expect((await logs(inv.id)).map((l) => [l.step, l.status])).toEqual([[1, "SENT"]]);
      email.send.mockClear();
      await reminders.run(undefined, c.companyId);
      expect(email.send).not.toHaveBeenCalledWith(c.customer.email, expect.anything(), expect.anything()); // same day, same step: nothing

      // a week later the next step goes out
      const week = parseDay(ymd(7));
      await reminders.run(week, c.companyId);
      expect((await logs(inv.id)).map((l) => l.step)).toEqual([1, 7]);
      // and two weeks after the due date, the last one
      await reminders.run(parseDay(ymd(14)), c.companyId);
      expect((await logs(inv.id)).map((l) => l.step)).toEqual([1, 7, 14]);
      const sentCount = (await logs(inv.id)).filter((l) => l.status === "SENT").length;
      await reminders.run(parseDay(ymd(60)), c.companyId);
      expect((await logs(inv.id)).filter((l) => l.status === "SENT")).toHaveLength(sentCount); // no fourth reminder
    });

    it("when several steps were missed it sends only the latest and records the earlier ones as skipped", async () => {
      const c = await setup();
      const inv = await overdueInvoice(c, 20);
      await reminders.run(undefined, c.companyId);
      const rows = await logs(inv.id);
      expect(rows.map((l) => [l.step, l.status])).toEqual([[1, "SKIPPED"], [7, "SKIPPED"], [14, "SENT"]]);
      expect(email.send.mock.calls.filter((call) => call[0] === c.customer.email)).toHaveLength(1);
    });

    it("skips paid invoices, invoices not yet due, and customers with no email; and retries a failed send", async () => {
      const c = await setup();
      const paid = await overdueInvoice(c, 5);
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paidToAccountId: c.cash, allocations: [{ invoiceId: paid.id, amount: "100" }] }, meta);
      const notDue = await issue(c, [line("Fresh", 1, "50")]);
      const noEmail = await contacts.create(c.companyId, user, { name: "Silent Ltd", paymentTermsDays: 30 }, meta);
      const silent = await overdueInvoice(c, 3, noEmail.id);
      const flaky = await overdueInvoice(c, 2);
      email.send.mockImplementation(async (to: string) => to !== c.customer.email);
      await reminders.run(undefined, c.companyId);
      expect(await logs(paid.id)).toHaveLength(0);
      expect(await logs(notDue.id)).toHaveLength(0);
      expect((await logs(silent.id)).map((l) => [l.step, l.status])).toEqual([[1, "SKIPPED"]]);
      expect(await logs(flaky.id)).toHaveLength(0); // the send failed, so nothing is logged...
      email.send.mockResolvedValue(true);
      await reminders.run(undefined, c.companyId);
      expect((await logs(flaky.id)).map((l) => [l.step, l.status])).toEqual([[1, "SENT"]]); // ...and it is tried again next time
    });

    it("sends nothing and logs nothing while email is not set up, then works once it is", async () => {
      const c = await setup();
      const inv = await overdueInvoice(c, 2);
      email.isConfigured = false;
      const r = await reminders.run(undefined, c.companyId);
      expect(r.sent).toBe(0);
      expect(await logs(inv.id)).toHaveLength(0);
      email.isConfigured = true;
      await reminders.run(undefined, c.companyId);
      expect((await logs(inv.id)).map((l) => l.status)).toEqual(["SENT"]);
    });

    it("has a hook for more channels (SMS later) that shares the same once-only log", async () => {
      const c = await setup();
      const inv = await overdueInvoice(c, 1);
      const sms = { name: "SMS", isConfigured: () => true, address: (x: { phone: string | null }) => x.phone, send: jest.fn().mockResolvedValue(true) };
      reminders.addChannel(sms);
      await reminders.run(undefined, c.companyId);
      await reminders.run(undefined, c.companyId);
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send.mock.calls[0][0].to).toBe(c.customer.phone);
      expect((await logs(inv.id)).map((l) => l.channel).sort()).toEqual(["EMAIL", "SMS"]);
    });
  });

  // ─── the books as a whole ───────────────────────────────────────────────────

  describe("the books stay in balance", () => {
    it("after a busy mix of invoices, payments, deposits, credits and voids, the trial balance balances and receivables tie to the invoices", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 10, "100", { taxCodeId: c.vatId })]);
      const b = await issue(c, [line("B", 5, "80", { accountId: c.revenue })]);
      const d = await issue(c, [line("C", 1, "999")]);
      await payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "BANK_TRANSFER", paidToAccountId: c.bank, allocations: [{ invoiceId: a.id, amount: "400" }, { invoiceId: b.id, amount: "400" }] }, meta);
      const dep = await payments.recordDeposit(c.companyId, user, { contactId: c.customer.id, depositDate: ymd(0), amount: "300", method: "CASH", paidToAccountId: c.cash }, meta);
      await payments.applyDeposit(c.companyId, user, dep.id, { invoiceId: a.id, amount: "150" }, meta);
      await credits.create(c.companyId, user, { invoiceId: a.id, creditDate: ymd(0), reason: "return", lines: [{ invoiceLineId: a.lines[0].id, quantity: "2" }] }, meta);
      const cn2 = await credits.create(c.companyId, user, { invoiceId: b.id, creditDate: ymd(0), reason: "return", lines: [{ invoiceLineId: b.lines[0].id, quantity: "5" }] }, meta);
      await credits.voidCreditNote(c.companyId, user, cn2.id, "changed mind", meta);
      await invoices.voidInvoice(c.companyId, user, d.id, "duplicate", meta);

      await trialBalanced(c);
      const outstanding = Number((await invoices.list(c.companyId, {})).totals.outstanding);
      expect(await ledgerBalance(c, "1210")).toBe(outstanding);
      // every posted entry in the company balances on its own
      const entries = await prisma.finJournalEntry.findMany({ where: { companyId: c.companyId, status: { in: ["POSTED", "REVERSED"] } } });
      for (const e of entries) expect(e.totalDebit.toString()).toBe(e.totalCredit.toString());
      // the AR account also ties to the customer statement
      const st = await statements.build(c.companyId, c.customer.id, ymd(-365), ymd(0));
      expect(Number(st.closingBalance)).toBe(outstanding);
    });
  });
});
