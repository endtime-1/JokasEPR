/**
 * Finance v2 banking integration tests (real MySQL with all fin migrations applied, triggers included):
 *   FIN_TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3399/fintest npx jest --runInBand src/modules/fin
 * Every test builds its own company, so tests never see each other's data.
 */
import { createHmac, randomUUID } from "crypto";
import { UnauthorizedException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { FinAccountsService } from "./fin-accounts.service";
import { FinAuditService } from "./fin-audit.service";
import { FinBankPaymentsService } from "./fin-bank-payments.service";
import { FinContactsService } from "./fin-contacts.service";
import { FinCustomerPaymentsService } from "./fin-customer-payments.service";
import { FinInvoicesService } from "./fin-invoices.service";
import { FinLedgerService, dayString, parseDay } from "./fin-ledger.service";
import { FinLinksService } from "./fin-links.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinOnlinePaymentsService, FinPaymentProviders } from "./fin-online-payments.service";
import { FinPaymentAccountsService } from "./fin-payment-accounts.service";
import { CheckoutRequest, PaystackProvider, VerifiedTransaction } from "./fin-payment-provider";
import { FinPdfService } from "./fin-pdf.service";
import { FinReconciliationService } from "./fin-reconciliation.service";
import { FinReportsService } from "./fin-reports.service";
import { FinSalesShareService } from "./fin-sales-share.service";
import { addDays } from "./fin-sales-math";
import { FinSettingsService } from "./fin-settings.service";
import { FinStatementService } from "./fin-statement.service";
import { FinTaxService } from "./fin-tax.service";

const URL = process.env.FIN_TEST_DATABASE_URL;
const maybe = URL ? describe : describe.skip;

/** A payment provider we control: we decide what "verify" says, without any network. Signature rules are the real Paystack ones. */
class TestPaystack extends PaystackProvider {
  results = new Map<string, VerifiedTransaction>();
  initialize = jest.fn(async (req: CheckoutRequest) => ({ url: `https://checkout.example/${req.reference}`, providerReference: "AC_test" }));
  verify = jest.fn(async (reference: string): Promise<VerifiedTransaction> => this.results.get(reference) ?? { reference, status: "pending", amountPesewas: 0, feePesewas: 0, currency: "GHS", channel: null, providerReference: null, paidAt: null });
}

maybe("finance v2 banking (real MySQL)", () => {
  let prisma: PrismaClient;
  let chart: FinAccountsService;
  let contacts: FinContactsService;
  let ledger: FinLedgerService;
  let reports: FinReportsService;
  let invoices: FinInvoicesService;
  let payments: FinCustomerPaymentsService;
  let accounts: FinPaymentAccountsService;
  let bank: FinBankPaymentsService;
  let online: FinOnlinePaymentsService;
  let recon: FinReconciliationService;
  let share: FinSalesShareService;
  let links: FinLinksService;
  const provider = new TestPaystack();
  const SECRET = "sk_test_integration_secret_12345";
  const user = "user-1";
  const meta = { ipAddress: "127.0.0.1", userAgent: "jest" };
  const keep = { link: process.env.FIN_LINK_SECRET, key: process.env.PAYSTACK_SECRET_KEY, prov: process.env.ONLINE_PAYMENT_PROVIDER };
  const email = { isConfigured: true, send: jest.fn().mockResolvedValue(true), sendWithAttachment: jest.fn().mockResolvedValue(true) };

  beforeAll(async () => {
    process.env.FIN_LINK_SECRET = "integration-test-secret-long-enough";
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    delete process.env.ONLINE_PAYMENT_PROVIDER;
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$connect();
    const p = prisma as never;
    const audit = new FinAuditService(p);
    const numbering = new FinNumberingService(p, audit);
    const settings = new FinSettingsService(p, audit, numbering);
    const tax = new FinTaxService(p, audit);
    chart = new FinAccountsService(p, audit);
    contacts = new FinContactsService(p, audit, numbering);
    ledger = new FinLedgerService(p, numbering, audit);
    reports = new FinReportsService(p);
    invoices = new FinInvoicesService(p, audit, numbering, ledger, tax);
    payments = new FinCustomerPaymentsService(p, audit, numbering, ledger, invoices);
    accounts = new FinPaymentAccountsService(p, audit);
    bank = new FinBankPaymentsService(p, audit, numbering, ledger, accounts);
    links = new FinLinksService();
    const providers = new FinPaymentProviders();
    providers.register(provider);
    online = new FinOnlinePaymentsService(p, audit, providers, payments, ledger, links);
    recon = new FinReconciliationService(p, audit, ledger, accounts);
    share = new FinSalesShareService(p, audit, invoices, new FinStatementService(p), settings, links, new FinPdfService(), email as never);
  });
  afterAll(async () => {
    for (const [k, v] of [["FIN_LINK_SECRET", keep.link], ["PAYSTACK_SECRET_KEY", keep.key], ["ONLINE_PAYMENT_PROVIDER", keep.prov]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await prisma.$disconnect();
  });
  beforeEach(() => {
    provider.results.clear();
    provider.initialize.mockClear();
    provider.verify.mockClear();
  });

  // ─── helpers ────────────────────────────────────────────────────────────────

  const ymd = (offset = 0) => dayString(addDays(parseDay(new Date()), offset));
  const line = (description: string, quantity: string | number, unitPrice: string | number) => ({ description, quantity, unitPrice });
  let seq = 0;

  async function setup() {
    const companyId = randomUUID();
    await chart.applyTemplate(companyId, user, meta);
    seq++;
    const customer = await contacts.create(companyId, user, { name: `Customer ${seq}`, email: `c${seq}@example.com`, phone: `0244${String(200000 + seq)}`, paymentTermsDays: 30 }, meta);
    const pa = (name: string, type: "CASH" | "BANK" | "MOBILE_MONEY" | "PROVIDER", extra: object = {}) => accounts.create(companyId, user, { name, type, createLedgerAccount: true, ...extra }, meta);
    const cash = await pa("Cash box", "CASH");
    const bankAcc = await pa("GCB Bank", "BANK", { bankName: "GCB", accountNumber: "1234567890" });
    const momo = await pa("MTN MoMo", "MOBILE_MONEY", { provider: "MTN_MOMO" });
    const code = async (c: string) => (await prisma.finAccount.findFirstOrThrow({ where: { companyId, code: c } })).id;
    return { companyId, customer, cash, bank: bankAcc, momo, acc: code };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  async function issue(c: Ctx, lines: ReturnType<typeof line>[], opts: { issueDate?: string } = {}) {
    const d = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: opts.issueDate ?? ymd(0), lines }, meta);
    await invoices.send(c.companyId, user, d.id, meta);
    return invoices.get(c.companyId, d.id);
  }
  async function balance(c: Ctx, code: string) {
    const tb = await reports.trialBalance(c.companyId, { asOf: ymd(1) });
    const r = tb.rows.find((x) => x.code === code);
    return r ? Math.round((r.closingDebit - r.closingCredit) * 100) / 100 : 0;
  }
  const trialBalanced = async (c: Ctx) => expect((await reports.trialBalance(c.companyId, { asOf: ymd(1) })).balanced).toBe(true);
  const paBalance = async (c: Ctx, id: string) => Number((await accounts.get(c.companyId, id)).balance);
  const rawFails = (sql: string, text: RegExp) => expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow(text);
  const receive = (c: Ctx, over: Record<string, unknown>) =>
    payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", paymentAccountId: c.cash.id, ...over } as never, meta);

  // ─── payment accounts ───────────────────────────────────────────────────────

  describe("payment accounts", () => {
    it("creates cash, bank and mobile money accounts, each with its own ledger account, and shows live balances", async () => {
      const c = await setup();
      expect([c.cash.ledgerAccount.code, c.bank.ledgerAccount.code, c.momo.ledgerAccount.code]).toEqual(["1121", "1122", "1123"]);
      expect(c.momo).toMatchObject({ type: "MOBILE_MONEY", provider: "MTN_MOMO", balance: "0.00" });
      expect(c.bank).toMatchObject({ bankName: "GCB", accountNumber: "1234567890" });
      const inv = await issue(c, [line("Feed", 1, "500")]);
      await receive(c, { paymentAccountId: c.momo.id, method: "MOBILE_MONEY", allocations: [{ invoiceId: inv.id, amount: "500" }] });
      expect(await paBalance(c, c.momo.id)).toBe(500);
      const list = await accounts.list(c.companyId);
      expect(list.find((a) => a.id === c.momo.id)!.balance).toBe("500.00");
      expect(await balance(c, "1123")).toBe(500); // the balance IS the ledger account's balance, never a separate figure
    });

    it("takes a free ledger account or makes one, never shares one, and gives a provider account the clearing account", async () => {
      const c = await setup();
      const bankLedger = c.bank.ledgerAccount.id;
      await expect(accounts.create(c.companyId, user, { name: "Duplicate", type: "BANK", ledgerAccountId: bankLedger }, meta)).rejects.toThrow(/already belongs to/);
      const free = await c.acc("1115"); // petty cash
      const petty = await accounts.create(c.companyId, user, { name: "Petty cash", type: "CASH", ledgerAccountId: free }, meta);
      expect(petty.ledgerAccount.code).toBe("1115");
      await expect(accounts.create(c.companyId, user, { name: "Receivables", type: "BANK", ledgerAccountId: await c.acc("1210") }, meta)).rejects.toThrow(/not a cash or bank/);
      await expect(accounts.create(c.companyId, user, { name: "Sales", type: "BANK", ledgerAccountId: await c.acc("4500") }, meta)).rejects.toThrow(/cannot hold money/);
      await expect(accounts.create(c.companyId, user, { name: "Nothing", type: "BANK" }, meta)).rejects.toThrow(/Choose a ledger account/);
      await expect(accounts.create(c.companyId, user, { name: "Odd", type: "BANK", provider: "MTN_MOMO", createLedgerAccount: true }, meta)).rejects.toThrow(/only applies to a mobile money/);
      const settle = await accounts.create(c.companyId, user, { name: "Paystack settlement", type: "PROVIDER", createLedgerAccount: true }, meta);
      expect(settle.ledgerAccount.code).toBe("1140");
    });

    it("cannot be switched off while it holds money, and its start date is fixed once reconciled", async () => {
      const c = await setup();
      await receive(c, { amount: "100" }); // customer credit, cash +100
      await expect(accounts.update(c.companyId, user, c.cash.id, { isActive: false }, meta)).rejects.toThrow(/still holds 100.00/);
      await accounts.update(c.companyId, user, c.bank.id, { isActive: false, name: "Old bank" }, meta);
      expect((await accounts.get(c.companyId, c.bank.id)).isActive).toBe(false);
      await expect(receive(c, { paymentAccountId: c.bank.id, amount: "10" })).rejects.toThrow(/switched off/);
    });
  });

  // ─── receive payment ────────────────────────────────────────────────────────

  describe("receive payment: allocation and overpayment", () => {
    it("allocates one payment across several invoices, partly or fully", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 1, "100")]);
      const b = await issue(c, [line("B", 1, "200")]);
      const r = await receive(c, { paymentAccountId: c.bank.id, method: "BANK_TRANSFER", reference: "TT 8841", allocations: [{ invoiceId: a.id, amount: "100" }, { invoiceId: b.id, amount: "50" }] });
      expect(r).toMatchObject({ amount: "150.00", status: "POSTED", reference: "TT 8841" });
      expect((await invoices.get(c.companyId, a.id)).paymentStatus).toBe("PAID");
      expect(await invoices.get(c.companyId, b.id)).toMatchObject({ paymentStatus: "PARTIAL", balanceDue: "150.00" });
      expect(await paBalance(c, c.bank.id)).toBe(150);
      expect(await balance(c, "1210")).toBe(150);
      await trialBalanced(c);
    });

    it("an overpayment becomes customer credit that can pay a later invoice", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 1, "100")]);
      const b = await issue(c, [line("B", 1, "200")]);
      const r = await receive(c, { amount: "400", allocations: [{ invoiceId: a.id, amount: "100" }, { invoiceId: b.id, amount: "200" }] });
      expect(r.amount).toBe("400.00");
      expect(await paBalance(c, c.cash.id)).toBe(400); // everything received went into the cash box
      expect(await balance(c, "1210")).toBe(0); // the invoices are fully paid
      expect(await balance(c, "2160")).toBe(-100); // the extra 100 is owed back to the customer (a liability, not income)
      expect(await balance(c, "4500")).toBe(-300); // sales are only the two invoices
      const credit = (await payments.listDeposits(c.companyId, { openOnly: true })).rows[0];
      expect(credit).toMatchObject({ remaining: "100.00", sourceReceiptId: r.id });
      expect(credit.number).toMatch(/^DEP-/);

      const next = await issue(c, [line("C", 1, "60")]);
      await payments.applyDeposit(c.companyId, user, credit.id, { invoiceId: next.id, amount: "60" }, meta);
      expect((await invoices.get(c.companyId, next.id)).paymentStatus).toBe("PAID");
      expect(await balance(c, "2160")).toBe(-40);
      await trialBalanced(c);
    });

    it("money with no invoice chosen is kept entirely as customer credit", async () => {
      const c = await setup();
      const r = await receive(c, { amount: "250", reference: "advance" });
      expect(r.allocations).toHaveLength(0);
      expect(await balance(c, "2160")).toBe(-250);
      const deposits = await payments.listDeposits(c.companyId, {});
      expect(deposits.rows[0]).toMatchObject({ amount: "250.00", sourceReceiptId: r.id, notes: expect.stringContaining("advance") });
      await trialBalanced(c);
    });

    it("refuses an amount smaller than the invoices being paid, a missing amount, and an unknown or switched-off account", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 1, "100")]);
      await expect(receive(c, { amount: "50", allocations: [{ invoiceId: a.id, amount: "100" }] })).rejects.toThrow(/less than the invoices being paid/);
      await expect(receive(c, { allocations: [] })).rejects.toThrow(/Enter the amount received/);
      await expect(receive(c, { paymentAccountId: randomUUID(), amount: "10" })).rejects.toThrow(/does not exist/);
      await expect(payments.recordReceipt(c.companyId, user, { contactId: c.customer.id, receiptDate: ymd(0), method: "CASH", amount: "10" } as never, meta)).rejects.toThrow(/Choose the payment account/);
      expect(await prisma.finReceipt.count({ where: { companyId: c.companyId } })).toBe(0);
    });

    it("voiding a receipt undoes the invoices and its customer credit, unless that credit was already used", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 1, "100")]);
      const r = await receive(c, { amount: "150", allocations: [{ invoiceId: a.id, amount: "100" }] });
      const v = await payments.voidReceipt(c.companyId, user, r.id, "Entered twice", meta);
      expect(v.status).toBe("VOID");
      expect(await invoices.get(c.companyId, a.id)).toMatchObject({ paymentStatus: "UNPAID", paidAmount: "0.00" });
      expect(await paBalance(c, c.cash.id)).toBe(0);
      expect(await balance(c, "2160")).toBe(0);
      expect((await payments.listDeposits(c.companyId, { openOnly: true })).total).toBe(0);

      const r2 = await receive(c, { amount: "150", allocations: [{ invoiceId: a.id, amount: "100" }] });
      const credit = (await payments.listDeposits(c.companyId, { openOnly: true })).rows[0];
      const b = await issue(c, [line("B", 1, "30")]);
      await payments.applyDeposit(c.companyId, user, credit.id, { invoiceId: b.id, amount: "30" }, meta);
      await expect(payments.voidReceipt(c.companyId, user, r2.id, "no", meta)).rejects.toThrow(/already been used/);
      await expect(payments.voidDeposit(c.companyId, user, credit.id, "no", meta)).rejects.toThrow(/applied to invoices/);
      await trialBalanced(c);
    });
  });

  // ─── make payment ───────────────────────────────────────────────────────────

  describe("make payment", () => {
    it("pays out of a payment account, charged to the account you choose, and can be voided", async () => {
      const c = await setup();
      await receive(c, { paymentAccountId: c.bank.id, amount: "1000" });
      const p = await bank.makePayment(c.companyId, user, { payeeName: "ECG", paymentDate: ymd(0), amount: "320.50", method: "BANK_TRANSFER", paidFromPaymentAccountId: c.bank.id, debitAccountId: await c.acc("6300"), reference: "Oct bill" }, meta);
      expect(p).toMatchObject({ amount: "320.50", status: "POSTED", payeeName: "ECG" });
      expect(p.number).toMatch(/^PAY-\d{4}-0001$/);
      expect(await paBalance(c, c.bank.id)).toBe(679.5);
      expect(await balance(c, "6300")).toBe(320.5); // electricity
      const v = await bank.voidPayment(c.companyId, user, p.id, "Wrong amount", meta);
      expect(v.status).toBe("VOID");
      expect(await paBalance(c, c.bank.id)).toBe(1000);
      expect(await balance(c, "6300")).toBe(0);
      await expect(bank.voidPayment(c.companyId, user, p.id, "again", meta)).rejects.toThrow(/already void/);
      await rawFails(`UPDATE fin_payments SET amount = 1 WHERE id = '${p.id}'`, /can only be voided/);
      await rawFails(`DELETE FROM fin_payments WHERE id = '${p.id}'`, /cannot be deleted/);
      await trialBalanced(c);
    });

    it("refuses bad payments", async () => {
      const c = await setup();
      const base = { payeeName: "Supplier", paymentDate: ymd(0), amount: "10", method: "CASH" as const, paidFromPaymentAccountId: c.cash.id, debitAccountId: await c.acc("6900") };
      await expect(bank.makePayment(c.companyId, user, { ...base, amount: "0" }, meta)).rejects.toThrow(/above zero/);
      await expect(bank.makePayment(c.companyId, user, { ...base, amount: "1.005" }, meta)).rejects.toThrow(/2 decimal/);
      await expect(bank.makePayment(c.companyId, user, { ...base, debitAccountId: c.cash.ledgerAccount.id }, meta)).rejects.toThrow(/same account/);
      await expect(bank.makePayment(c.companyId, user, { ...base, debitAccountId: await c.acc("6000") }, meta)).rejects.toThrow(/cannot be posted to/);
      await expect(bank.makePayment(c.companyId, user, { ...base, paidFromPaymentAccountId: randomUUID() }, meta)).rejects.toThrow(/does not exist/);
      await expect(bank.makePayment(c.companyId, user, { ...base, contactId: randomUUID() }, meta)).rejects.toThrow(/supplier does not exist/);
      await ledger.setLock(c.companyId, user, ymd(-1), "closed", meta);
      await expect(bank.makePayment(c.companyId, user, { ...base, paymentDate: ymd(-5) }, meta)).rejects.toThrow(/books are closed/);
      expect(await prisma.finPayment.count({ where: { companyId: c.companyId } })).toBe(0);
    });
  });

  // ─── transfers ──────────────────────────────────────────────────────────────

  describe("transfers", () => {
    it("moves money between accounts, charging the fee to bank charges, and voids cleanly", async () => {
      const c = await setup();
      await receive(c, { paymentAccountId: c.momo.id, method: "MOBILE_MONEY", amount: "1000" });
      const t = await bank.transfer(c.companyId, user, { transferDate: ymd(0), fromPaymentAccountId: c.momo.id, toPaymentAccountId: c.bank.id, amount: "300", chargeAmount: "4.50", reference: "MoMo to bank" }, meta);
      expect(t).toMatchObject({ amount: "300.00", chargeAmount: "4.50", status: "POSTED" });
      expect(t.number).toMatch(/^TRF-\d{4}-0001$/);
      expect(await paBalance(c, c.momo.id)).toBe(695.5); // 1000 - 300 - 4.50
      expect(await paBalance(c, c.bank.id)).toBe(300);
      expect(await balance(c, "6700")).toBe(4.5);
      const entry = await ledger.getEntry(c.companyId, t.journalEntryId!);
      expect(entry.lines.map((l) => [l.account.code, l.debit.toString(), l.credit.toString()])).toEqual([["1122", "300", "0"], ["6700", "4.5", "0"], ["1123", "0", "304.5"]]);
      await trialBalanced(c);

      const v = await bank.voidTransfer(c.companyId, user, t.id, "Wrong account", meta);
      expect(v.status).toBe("VOID");
      expect(await paBalance(c, c.momo.id)).toBe(1000);
      expect(await paBalance(c, c.bank.id)).toBe(0);
      expect(await balance(c, "6700")).toBe(0);
      await rawFails(`UPDATE fin_transfers SET amount = 1 WHERE id = '${t.id}'`, /can only be voided/);
      await rawFails(`DELETE FROM fin_transfers WHERE id = '${t.id}'`, /cannot be deleted/);
    });

    it("a transfer with no charge posts two lines, and a custom charge account is honoured", async () => {
      const c = await setup();
      await receive(c, { amount: "500" });
      const plain = await bank.transfer(c.companyId, user, { transferDate: ymd(0), fromPaymentAccountId: c.cash.id, toPaymentAccountId: c.bank.id, amount: "200" }, meta);
      expect((await ledger.getEntry(c.companyId, plain.journalEntryId!)).lines).toHaveLength(2);
      const custom = await bank.transfer(c.companyId, user, { transferDate: ymd(0), fromPaymentAccountId: c.cash.id, toPaymentAccountId: c.momo.id, amount: "100", chargeAmount: "2", chargeAccountId: await c.acc("6900") }, meta);
      expect(custom.chargeAccountId).toBe(await c.acc("6900"));
      expect(await balance(c, "6900")).toBe(2);
      expect(await paBalance(c, c.cash.id)).toBe(198); // 500 - 200 - 100 - 2
    });

    it("refuses the same account, bad amounts, a charge with nowhere to post it, and closed periods", async () => {
      const c = await setup();
      await receive(c, { amount: "500" });
      const base = { transferDate: ymd(0), fromPaymentAccountId: c.cash.id, toPaymentAccountId: c.bank.id, amount: "10" };
      await expect(bank.transfer(c.companyId, user, { ...base, toPaymentAccountId: c.cash.id }, meta)).rejects.toThrow(/two different accounts/);
      await expect(bank.transfer(c.companyId, user, { ...base, amount: "0" }, meta)).rejects.toThrow(/above zero/);
      await expect(bank.transfer(c.companyId, user, { ...base, chargeAmount: "-1" }, meta)).rejects.toThrow(/negative/);
      await prisma.finAccount.updateMany({ where: { companyId: c.companyId, code: "6700" }, data: { systemRole: null } });
      await expect(bank.transfer(c.companyId, user, { ...base, chargeAmount: "1" }, meta)).rejects.toThrow(/Choose the account for the transfer charge/);
      await accounts.update(c.companyId, user, c.bank.id, { isActive: false }, meta);
      await expect(bank.transfer(c.companyId, user, base, meta)).rejects.toThrow(/switched off/);
      expect(await prisma.finTransfer.count({ where: { companyId: c.companyId } })).toBe(0);
    });
  });

  // ─── online payments ────────────────────────────────────────────────────────

  describe("online payments and the webhook", () => {
    const ok = (ref: string, pesewas: number, fee = 150, channel = "mobile_money"): VerifiedTransaction => ({ reference: ref, status: "success", amountPesewas: pesewas, feePesewas: fee, currency: "GHS", channel, providerReference: "9001", paidAt: new Date() });
    const tokenOf = (inv: { id: string }) => links.invoiceToken(inv.id, 1);
    const hook = (reference: string, over: { signature?: string; event?: string } = {}) => {
      const raw = Buffer.from(JSON.stringify({ event: over.event ?? "charge.success", data: { reference } }));
      const signature = over.signature ?? createHmac("sha512", SECRET).update(raw).digest("hex");
      return online.handleWebhook(raw, { "x-paystack-signature": signature }, JSON.parse(raw.toString()));
    };
    const receiptsFor = (c: Ctx, reference: string) => prisma.finReceipt.findMany({ where: { companyId: c.companyId, reference } });

    async function checkout(c: Ctx, total = "1000", amount?: string) {
      const inv = await issue(c, [line("Feed", 1, total)]);
      const r = await online.createCheckout(tokenOf(inv), amount ? { amount } : {});
      return { inv, ...r };
    }

    it("starts a checkout for the whole balance or a part, and returns the provider page", async () => {
      const c = await setup();
      const { inv, url, reference } = await checkout(c, "1000");
      expect(url).toBe(`https://checkout.example/${reference}`);
      const req = provider.initialize.mock.calls[0][0];
      expect(req).toMatchObject({ reference, amountPesewas: 100_000, email: c.customer.email, currency: "GHS" });
      expect(req.callbackUrl).toContain(`/p/invoice/${tokenOf(inv)}?online=${reference}`);
      const row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      expect(row).toMatchObject({ status: "PENDING", invoiceId: inv.id });
      expect(Number(row.amount)).toBe(1000);
      const part = await online.createCheckout(tokenOf(inv), { amount: "250.50", email: "other@example.com" });
      expect(provider.initialize.mock.calls[1][0]).toMatchObject({ amountPesewas: 25_050, email: "other@example.com" });
      expect(part.reference).not.toBe(reference);
    });

    it("refuses nonsense: bad link, draft, more than owed, under GHS 1, no email, nothing left, no provider keys", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "100")]);
      await expect(online.createCheckout("garbage", {})).rejects.toThrow("This link is not valid.");
      const draft = await invoices.createDraft(c.companyId, user, { contactId: c.customer.id, issueDate: ymd(0), lines: [line("D", 1, "10")] }, meta);
      await expect(online.createCheckout(`${draft.id}.${links.invoiceToken(draft.id, 1).split(".")[1]}`, {})).rejects.toThrow("This link is not valid.");
      await expect(online.createCheckout(tokenOf(inv), { amount: "100.01" })).rejects.toThrow(/more than the invoice still owes/);
      await expect(online.createCheckout(tokenOf(inv), { amount: "0.50" })).rejects.toThrow(/smallest payment is GHS 1.00/);
      const noEmail = await contacts.create(c.companyId, user, { name: "No Email" }, meta);
      const inv2 = await invoices.createDraft(c.companyId, user, { contactId: noEmail.id, issueDate: ymd(0), lines: [line("X", 1, "50")] }, meta);
      await invoices.send(c.companyId, user, inv2.id, meta);
      await expect(online.createCheckout(tokenOf(inv2), {})).rejects.toThrow(/enter your email/);
      await receive(c, { allocations: [{ invoiceId: inv.id, amount: "100" }] });
      await expect(online.createCheckout(tokenOf(inv), {})).rejects.toThrow(/nothing left to pay/);
      delete process.env.PAYSTACK_SECRET_KEY;
      expect(online.config().enabled).toBe(false);
      await expect(online.createCheckout(tokenOf(inv2), { email: "a@b.co" })).rejects.toThrow(/not available/);
      process.env.PAYSTACK_SECRET_KEY = SECRET;
      expect(online.config()).toEqual({ enabled: true, provider: "paystack" });
    });

    it("limits how many unfinished checkouts one invoice can have, and records a failed start", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "100")]);
      for (let i = 0; i < 5; i++) await online.createCheckout(tokenOf(inv), {});
      await expect(online.createCheckout(tokenOf(inv), {})).rejects.toThrow(/Too many payment attempts/);
      const inv2 = await issue(c, [line("More", 1, "100")]);
      provider.initialize.mockRejectedValueOnce(new Error("provider is down"));
      await expect(online.createCheckout(tokenOf(inv2), {})).rejects.toThrow(/provider is down/);
      const failed = await prisma.finOnlinePayment.findFirstOrThrow({ where: { invoiceId: inv2.id } });
      expect(failed).toMatchObject({ status: "FAILED", failureReason: "provider is down" });
    });

    it("a valid webhook posts the receipt: clearing account, provider fee, receivables, invoice paid", async () => {
      const c = await setup();
      const { inv, reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 100_000, 150));
      const res = await hook(reference);
      expect(res).toEqual({ received: true, handled: true });

      const [receipt] = await receiptsFor(c, reference);
      expect(receipt).toMatchObject({ method: "MOBILE_MONEY", status: "POSTED" });
      expect(Number(receipt.amount)).toBe(1000);
      expect(receipt.number).toMatch(/^RCT-/);
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paymentStatus: "PAID", paidAmount: "1000.00", balanceDue: "0.00" });
      expect(await balance(c, "1140")).toBe(998.5); // what the provider owes us: the payment less its fee
      expect(await balance(c, "6720")).toBe(1.5); // the provider's fee, as an expense
      expect(await balance(c, "1210")).toBe(0);
      const row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      expect(row).toMatchObject({ status: "PAID", receiptId: receipt.id, channel: "mobile_money", providerReference: "9001" });
      expect([Number(row.amountPaid), Number(row.fee)]).toEqual([1000, 1.5]);
      expect(await prisma.finAuditLog.count({ where: { companyId: c.companyId, action: "ONLINE_PAYMENT" } })).toBe(1);
      await trialBalanced(c);
    });

    it("IDEMPOTENT: the same webhook delivered again posts nothing more", async () => {
      const c = await setup();
      const { reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 100_000));
      await hook(reference);
      provider.verify.mockClear();
      for (let i = 0; i < 3; i++) await hook(reference);
      expect(await receiptsFor(c, reference)).toHaveLength(1);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_RECEIPT" } })).toBe(1);
      expect(provider.verify).not.toHaveBeenCalled(); // an already-paid checkout is not even re-verified
      expect(await balance(c, "1140")).toBe(998.5);
    });

    it("IDEMPOTENT: six identical webhooks arriving at the same moment post exactly one receipt", async () => {
      const c = await setup();
      const { inv, reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 100_000));
      const results = await Promise.allSettled(Array.from({ length: 6 }, () => hook(reference)));
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      expect(await receiptsFor(c, reference)).toHaveLength(1);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_RECEIPT" } })).toBe(1);
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paidAmount: "1000.00", paymentStatus: "PAID" });
      expect(await balance(c, "1140")).toBe(998.5);
      await trialBalanced(c);
    });

    it("IDEMPOTENT: the customer's page checking status, the webhook and a staff retry all land on the same single receipt", async () => {
      const c = await setup();
      const { inv, reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 100_000));
      expect(await online.checkStatus(tokenOf(inv), reference)).toMatchObject({ status: "PAID" }); // the page catches up before the webhook
      await hook(reference);
      const row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      expect((await online.retry(c.companyId, row.id)).status).toBe("ALREADY_PAID");
      expect(await receiptsFor(c, reference)).toHaveLength(1);
    });

    it("the database itself refuses to change a paid online payment", async () => {
      const c = await setup();
      const { reference } = await checkout(c, "100");
      provider.results.set(reference, ok(reference, 10_000, 0));
      await hook(reference);
      const row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      await rawFails(`UPDATE fin_online_payments SET status = 'FAILED' WHERE id = '${row.id}'`, /paid online payment is final/);
      await rawFails(`UPDATE fin_online_payments SET fee = 0 WHERE id = '${row.id}'`, /paid online payment is final/);
      await rawFails(`DELETE FROM fin_online_payments WHERE id = '${row.id}'`, /cannot be deleted/);
    });

    it("rejects a webhook with a wrong, missing, or recomputed-from-tampered-body signature, and posts nothing", async () => {
      const c = await setup();
      const { reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 100_000));
      await expect(hook(reference, { signature: "deadbeef" })).rejects.toThrow(UnauthorizedException);
      await expect(online.handleWebhook(Buffer.from("{}"), {}, {})).rejects.toThrow(UnauthorizedException);
      await expect(online.handleWebhook(undefined, { "x-paystack-signature": "x" }, {})).rejects.toThrow(UnauthorizedException);
      // a signature that is valid for one body cannot be replayed on another
      const good = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "someone-elses" } }));
      const sig = createHmac("sha512", SECRET).update(good).digest("hex");
      const forged = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference } }));
      await expect(online.handleWebhook(forged, { "x-paystack-signature": sig }, JSON.parse(forged.toString()))).rejects.toThrow(UnauthorizedException);
      expect(await receiptsFor(c, reference)).toHaveLength(0);
      expect(provider.verify).not.toHaveBeenCalled();
    });

    it("acknowledges other events and references that are not ours, without touching anything", async () => {
      const c = await setup();
      const { reference } = await checkout(c, "100");
      expect(await hook(reference, { event: "transfer.success" })).toEqual({ received: true, handled: false });
      expect(await hook("some-other-app-reference")).toEqual({ received: true, handled: false });
      expect((await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } })).status).toBe("PENDING");
    });

    it("never trusts the webhook alone: it asks the provider, and a payment the provider says is unpaid or failed is not posted", async () => {
      const c = await setup();
      const a = await checkout(c, "100");
      await hook(a.reference); // provider says "pending"
      expect((await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference: a.reference } })).status).toBe("PENDING");
      provider.results.set(a.reference, { ...ok(a.reference, 10_000), status: "failed" });
      await hook(a.reference);
      expect((await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference: a.reference } })).status).toBe("FAILED");
      expect(await receiptsFor(c, a.reference)).toHaveLength(0);
      expect(await balance(c, "1210")).toBe(100);
    });

    it("holds a payment for review when the amount or currency does not match, then posts it after a retry", async () => {
      const c = await setup();
      const { inv, reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 90_000)); // the provider received 900, not 1,000
      expect(await hook(reference)).toEqual({ received: true, handled: true });
      let row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      expect(row).toMatchObject({ status: "REVIEW" });
      expect(row.failureReason).toMatch(/Amount mismatch: expected 1000.00, the provider received 900.00/);
      expect(await receiptsFor(c, reference)).toHaveLength(0);
      provider.results.set(reference, { ...ok(reference, 100_000), currency: "USD" });
      await online.retry(c.companyId, row.id);
      row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      expect(row.failureReason).toMatch(/Currency mismatch/);
      provider.results.set(reference, ok(reference, 100_000));
      expect((await online.retry(c.companyId, row.id)).status).toBe("PAID");
      expect((await invoices.get(c.companyId, inv.id)).paymentStatus).toBe("PAID");
    });

    it("holds a payment when the clearing or fee account is not set up, and posts it once it is", async () => {
      const c = await setup();
      const { reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 100_000, 150));
      await prisma.finAccount.updateMany({ where: { companyId: c.companyId, code: "1140" }, data: { systemRole: null } });
      await hook(reference);
      let row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      expect(row.status).toBe("REVIEW");
      expect(row.failureReason).toMatch(/Online payments clearing/);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c.companyId, sourceModule: "FIN_RECEIPT" } })).toBe(0); // nothing half-posted
      await prisma.finAccount.updateMany({ where: { companyId: c.companyId, code: "1140" }, data: { systemRole: "payment_clearing" } });
      await prisma.finAccount.updateMany({ where: { companyId: c.companyId, code: "6720" }, data: { systemRole: null } });
      await online.retry(c.companyId, row.id);
      row = await prisma.finOnlinePayment.findFirstOrThrow({ where: { reference } });
      expect(row.failureReason).toMatch(/Payment provider fees/);
      await prisma.finAccount.updateMany({ where: { companyId: c.companyId, code: "6720" }, data: { systemRole: "provider_fees" } });
      expect((await online.retry(c.companyId, row.id)).status).toBe("PAID");
      expect(await balance(c, "1140")).toBe(998.5);
      expect(await receiptsFor(c, reference)).toHaveLength(1);
    });

    it("a part payment leaves the invoice partly paid and a second one completes it", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "1000")]);
      const one = await online.createCheckout(tokenOf(inv), { amount: "400" });
      provider.results.set(one.reference, ok(one.reference, 40_000, 100));
      await hook(one.reference);
      expect(await invoices.get(c.companyId, inv.id)).toMatchObject({ paymentStatus: "PARTIAL", balanceDue: "600.00" });
      const two = await online.createCheckout(tokenOf(inv), {});
      expect(provider.initialize.mock.calls[1][0].amountPesewas).toBe(60_000); // the balance now
      provider.results.set(two.reference, ok(two.reference, 60_000, 150, "card"));
      await hook(two.reference);
      expect((await invoices.get(c.companyId, inv.id)).paymentStatus).toBe("PAID");
      expect((await receiptsFor(c, two.reference))[0].method).toBe("CARD");
      expect(await balance(c, "6720")).toBe(2.5); // both fees
      await trialBalanced(c);
    });

    it("if the invoice was paid another way while the customer was paying, the online money becomes customer credit", async () => {
      const c = await setup();
      const { inv, reference } = await checkout(c, "1000");
      await receive(c, { allocations: [{ invoiceId: inv.id, amount: "1000" }] }); // someone paid cash in the meantime
      provider.results.set(reference, ok(reference, 100_000));
      await hook(reference);
      const [receipt] = await receiptsFor(c, reference);
      expect(await prisma.finReceiptAllocation.count({ where: { receiptId: receipt.id } })).toBe(0);
      expect(await balance(c, "2160")).toBe(-1000); // owed back to the customer, not lost
      expect(await balance(c, "1210")).toBe(0);
      expect((await invoices.get(c.companyId, inv.id)).paidAmount).toBe("1000.00");
      await trialBalanced(c);
    });

    it("the provider's money can be moved to the bank with a settlement transfer, leaving the clearing account at zero", async () => {
      const c = await setup();
      const settle = await accounts.create(c.companyId, user, { name: "Paystack settlement", type: "PROVIDER", createLedgerAccount: true }, meta);
      const { reference } = await checkout(c, "1000");
      provider.results.set(reference, ok(reference, 100_000, 150));
      await hook(reference);
      expect(await paBalance(c, settle.id)).toBe(998.5);
      await bank.transfer(c.companyId, user, { transferDate: ymd(0), fromPaymentAccountId: settle.id, toPaymentAccountId: c.bank.id, amount: "998.50", reference: "Settlement" }, meta);
      expect(await paBalance(c, settle.id)).toBe(0);
      expect(await paBalance(c, c.bank.id)).toBe(998.5);
      await trialBalanced(c);
    });

    it("shows online payments to staff, newest first, with totals, and the public page can read its own status only", async () => {
      const c = await setup();
      const { inv, reference } = await checkout(c, "100");
      provider.results.set(reference, ok(reference, 10_000, 100));
      await hook(reference);
      const other = await checkout(c, "50");
      const list = await online.list(c.companyId, {});
      expect(list.total).toBe(2);
      expect(list.totals).toEqual({ received: "100.00", fees: "1.00" });
      expect(list.rows.find((r) => r.reference === reference)).toMatchObject({ status: "PAID", customer: c.customer.name, invoiceNumber: inv.number });
      expect((await online.list(c.companyId, { status: "PENDING" })).total).toBe(1);
      await expect(online.checkStatus(tokenOf(inv), other.reference)).rejects.toThrow("This link is not valid."); // another invoice's checkout
      await expect(online.checkStatus("garbage", reference)).rejects.toThrow("This link is not valid.");
    });
  });

  // ─── receipts as documents ──────────────────────────────────────────────────

  describe("receipt PDFs and sharing", () => {
    it("makes a PDF, a public link, a WhatsApp link and an email, and the public page opens with no login", async () => {
      const c = await setup();
      const inv = await issue(c, [line("Feed", 1, "300")]);
      const r = await receive(c, { amount: "350", reference: "MoMo 551", method: "MOBILE_MONEY", allocations: [{ invoiceId: inv.id, amount: "300" }] });
      const pdf = await share.receiptPdf(c.companyId, r.id);
      expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.filename).toBe(`${r.number}.pdf`);
      const info = await share.receiptShare(c.companyId, r.id);
      expect(info.link).toMatch(/\/p\/receipt\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
      expect(decodeURIComponent(info.whatsappUrl)).toContain(info.link);
      expect(info.whatsappUrl).toContain("https://wa.me/233244");
      const token = info.link.split("/p/receipt/")[1];
      const pub = await share.publicReceipt(token);
      expect(pub.receipt).toMatchObject({ number: r.number, amount: "350.00", creditKept: "50.00", status: "POSTED" });
      expect(pub.receipt.allocations).toEqual([{ invoiceNumber: inv.number, amount: "300.00" }]);
      expect((await share.publicReceiptPdf(token)).buffer.subarray(0, 5).toString()).toBe("%PDF-");
      await expect(share.publicReceipt(`${r.id}.${"A".repeat(32)}`)).rejects.toThrow("This link is not valid.");
      await expect(share.publicReceipt("garbage")).rejects.toThrow("This link is not valid.");
      await expect(share.publicReceipt(`${randomUUID()}.${token.split(".")[1]}`)).rejects.toThrow("This link is not valid.");
      expect((await share.emailReceipt(c.companyId, user, r.id, {}, meta)).sentTo).toBe(c.customer.email);
      await payments.voidReceipt(c.companyId, user, r.id, "test", meta);
      expect((await share.publicReceipt(token)).receipt.status).toBe("VOID"); // the link keeps working and shows it was voided
      expect((await share.receiptPdf(c.companyId, r.id)).buffer.length).toBeGreaterThan(1000);
    });
  });

  // ─── statement import and reconciliation ────────────────────────────────────

  describe("statement import and reconciliation", () => {
    const map = { date: 0, description: 1, reference: 2, moneyOut: 3, moneyIn: 4, balance: 5 };
    const csv = (rows: string[][]) => ["Date,Narration,Ref,Debit,Credit,Balance", ...rows.map((r) => r.map((x) => (/[,"]/.test(x) ? `"${x}"` : x)).join(","))].join("\n");
    const importCsv = (c: Ctx, paymentAccountId: string, rows: string[][], extra: object = {}) => recon.commitImport(c.companyId, user, { paymentAccountId, csv: csv(rows), fileName: "stmt.csv", mapping: map, ...extra } as never, meta);
    const lines = async (c: Ctx, paymentAccountId: string, status: "UNMATCHED" | "MATCHED" | "IGNORED" | "all" = "all") => (await recon.listLines(c.companyId, { paymentAccountId, status })).rows;
    const dmy = (offset: number) => ymd(offset).split("-").reverse().join("/");

    /** A bank account with a realistic mix of entries in the books. */
    async function bankWithBooks() {
      const c = await setup();
      const inv1 = await issue(c, [line("Feed", 1, "500")], { issueDate: ymd(-8) });
      const inv2 = await issue(c, [line("Eggs", 1, "250")], { issueDate: ymd(-8) });
      const r1 = await receive(c, { paymentAccountId: c.bank.id, method: "BANK_TRANSFER", receiptDate: ymd(-5), allocations: [{ invoiceId: inv1.id, amount: "500" }] });
      const r2 = await receive(c, { paymentAccountId: c.bank.id, method: "BANK_TRANSFER", receiptDate: ymd(-4), allocations: [{ invoiceId: inv2.id, amount: "250" }] });
      const p1 = await bank.makePayment(c.companyId, user, { payeeName: "ECG", paymentDate: ymd(-3), amount: "120", method: "BANK_TRANSFER", paidFromPaymentAccountId: c.bank.id, debitAccountId: await c.acc("6300") }, meta);
      await receive(c, { paymentAccountId: c.momo.id, method: "MOBILE_MONEY", receiptDate: ymd(-6), amount: "400" });
      const t1 = await bank.transfer(c.companyId, user, { transferDate: ymd(-2), fromPaymentAccountId: c.momo.id, toPaymentAccountId: c.bank.id, amount: "300" }, meta);
      return { c, inv1, inv2, r1, r2, p1, t1 };
    }

    it("imports a CSV, skips lines already imported, and sets where reconciliation starts", async () => {
      const { c } = await bankWithBooks();
      const rows = [[dmy(-5), "TRANSFER FROM KOFI", "RCT-X", "", "500.00", "500.00"], [dmy(-4), "TRANSFER FROM AMA", "", "", "250.00", "750.00"], [dmy(-3), "ECG PAYMENT", "", "120.00", "", "630.00"]];
      const preview = await recon.previewImport(c.companyId, { paymentAccountId: c.bank.id, csv: csv(rows), mapping: map } as never);
      expect(preview).toMatchObject({ totalLines: 3, newLines: 3, alreadyImported: 0, moneyIn: "750.00", moneyOut: "120.00", canImport: true, from: ymd(-5), to: ymd(-3), lastBalance: 63_000 });
      expect(await lines(c, c.bank.id)).toHaveLength(0); // a preview saves nothing
      const first = await importCsv(c, c.bank.id, rows);
      expect(first).toMatchObject({ added: 3, alreadyImported: 0 });
      expect((await accounts.get(c.companyId, c.bank.id)).reconcileFrom).toBe(ymd(-5));
      const again = await importCsv(c, c.bank.id, rows);
      expect(again).toMatchObject({ added: 0, alreadyImported: 3 });
      expect(await lines(c, c.bank.id)).toHaveLength(3);
      const overlap = await importCsv(c, c.bank.id, [...rows, [dmy(-2), "TRANSFER IN", "", "", "300.00", "930.00"]]);
      expect(overlap).toMatchObject({ added: 1, alreadyImported: 3 });
      await rawFails(`UPDATE fin_statement_lines SET amount = 1 WHERE paymentAccountId = '${c.bank.id}'`, /keeps its original data/);
      await rawFails(`DELETE FROM fin_statement_lines WHERE paymentAccountId = '${c.bank.id}'`, /cannot be deleted/);
    });

    it("reads Excel statements, reports unreadable lines, and imports the readable ones only when told to", async () => {
      const c = await setup();
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("S");
      ws.addRow(["Date", "Narration", "Ref", "Debit", "Credit", "Balance"]);
      ws.addRow([new Date(`${ymd(-3)}T00:00:00Z`), "DEPOSIT", "R1", null, 100, 100]);
      ws.addRow(["garbled", "BROKEN", "", 5, null, 95]);
      const fileBase64 = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
      const dto = { paymentAccountId: c.bank.id, fileBase64, fileName: "s.xlsx", mapping: map };
      const preview = await recon.previewImport(c.companyId, dto as never);
      expect(preview).toMatchObject({ totalLines: 1, newLines: 1, canImport: false });
      expect(preview.errors).toHaveLength(1);
      await expect(recon.commitImport(c.companyId, user, dto as never, meta)).rejects.toThrow(/1 line cannot be read, so nothing was imported/);
      expect(await lines(c, c.bank.id)).toHaveLength(0);
      const done = await recon.commitImport(c.companyId, user, { ...dto, skipBadRows: true } as never, meta);
      expect(done).toMatchObject({ added: 1, badLinesSkipped: 1 });
      await expect(recon.previewImport(c.companyId, { paymentAccountId: randomUUID(), csv: "a", mapping: map } as never)).rejects.toThrow(/not found/);
    });

    it("peeks at a file and guesses its columns", async () => {
      const p = await recon.peek({ csv: csv([[dmy(-1), "X", "", "", "1.00", "1.00"]]) });
      expect(p.rows).toHaveLength(2);
      expect(p.guess).toMatchObject({ date: 0, description: 1, reference: 2, moneyOut: 3, moneyIn: 4, balance: 5 });
    });

    it("auto-matches by amount, date and reference, and leaves the unmatched and the ambiguous alone", async () => {
      const { c, r1 } = await bankWithBooks();
      const res = await importCsv(c, c.bank.id, [
        [dmy(-5), `TRANSFER FROM KOFI ${r1.number}`, "", "", "500.00", "500.00"],
        [dmy(-4), "TRANSFER FROM AMA", "", "", "250.00", "750.00"],
        [dmy(-3), "ECG BILL", "", "120.00", "", "630.00"],
        [dmy(-2), "FROM MTN MOMO", "", "", "300.00", "930.00"],
        [dmy(-1), "MONTHLY ACCOUNT FEE", "", "15.00", "", "915.00"],
        [dmy(0), "INTEREST", "", "", "4.00", "919.00"]
      ]);
      expect(res).toMatchObject({ added: 6, autoMatched: 4 });
      const all = await lines(c, c.bank.id);
      expect(all.filter((l) => l.status === "MATCHED").map((l) => l.matchMethod)).toEqual(["AUTO", "AUTO", "AUTO", "AUTO"]);
      expect(all.filter((l) => l.status === "UNMATCHED").map((l) => l.description).sort()).toEqual(["INTEREST", "MONTHLY ACCOUNT FEE"]);
      const matchedRef = all.find((l) => l.description.includes(r1.number));
      expect(matchedRef!.ledger).toMatchObject({ reference: expect.stringMatching(/^JE-/), voided: false });
    });

    it("never guesses between equally good candidates, and a person can match them by hand", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 1, "100")], { issueDate: ymd(-5) });
      const b = await issue(c, [line("B", 1, "100")], { issueDate: ymd(-5) });
      await receive(c, { paymentAccountId: c.bank.id, receiptDate: ymd(-2), allocations: [{ invoiceId: a.id, amount: "100" }] });
      await receive(c, { paymentAccountId: c.bank.id, receiptDate: ymd(-2), allocations: [{ invoiceId: b.id, amount: "100" }] });
      const res = await importCsv(c, c.bank.id, [[dmy(-2), "CASH DEPOSIT", "", "", "100.00", "100.00"]]);
      expect(res.autoMatched).toBe(0);
      const [line1] = await lines(c, c.bank.id);
      const sugg = await recon.suggestions(c.companyId, line1.id);
      expect(sugg.filter((s) => s.sameAmount)).toHaveLength(2);
      const done = await recon.match(c.companyId, user, line1.id, sugg[0].journalLineId, meta);
      expect(done).toMatchObject({ status: "MATCHED", matchMethod: "MANUAL" });
      // the matched ledger entry is no longer offered
      expect((await recon.ledgerCandidates(c.companyId, c.bank.id)).map((x) => x.journalLineId)).not.toContain(sugg[0].journalLineId);
    });

    it("manual matching refuses different amounts, other accounts' entries, voided entries and double matches; unmatch undoes one", async () => {
      const { c, r1, r2 } = await bankWithBooks();
      await importCsv(c, c.bank.id, [[dmy(-5), "ONE", "", "", "500.00", "500.00"], [dmy(-5), "TWO", "", "", "999.00", "1499.00"]]);
      const all = await lines(c, c.bank.id);
      const one = all.find((l) => l.description === "ONE")!;
      const two = all.find((l) => l.description === "TWO")!;
      expect(one.status).toBe("MATCHED"); // auto
      const cands = await recon.ledgerCandidates(c.companyId, c.bank.id);
      const r2Line = cands.find((x) => x.amount === "250.00")!;
      await expect(recon.match(c.companyId, user, two.id, r2Line.journalLineId, meta)).rejects.toThrow(/amounts differ/);
      await expect(recon.match(c.companyId, user, two.id, randomUUID(), meta)).rejects.toThrow(/not on this account/);
      await expect(recon.match(c.companyId, user, one.id, r2Line.journalLineId, meta)).rejects.toThrow(/already matched/);
      await recon.unmatch(c.companyId, user, one.id, meta);
      expect((await lines(c, c.bank.id, "UNMATCHED")).map((l) => l.description).sort()).toEqual(["ONE", "TWO"]);
      await expect(recon.unmatch(c.companyId, user, one.id, meta)).rejects.toThrow(/not matched/);
      await payments.voidReceipt(c.companyId, user, r1.id, "voided", meta);
      const after = await recon.ledgerCandidates(c.companyId, c.bank.id);
      expect(after.map((x) => x.amount)).not.toContain("500.00"); // a voided receipt and its reversal cancel out of the list
      expect(r2.id).toBeDefined();
    });

    it("turns an unmatched line into a transaction (a bank charge, interest) and matches it in one step", async () => {
      const { c } = await bankWithBooks();
      await importCsv(c, c.bank.id, [[dmy(-1), "MONTHLY ACCOUNT FEE", "", "15.00", "", "-15.00"], [dmy(0), "INTEREST", "", "", "4.00", "4.00"]]);
      const all = await lines(c, c.bank.id);
      const feeLine = all.find((l) => l.description === "MONTHLY ACCOUNT FEE")!;
      const intLine = all.find((l) => l.description === "INTEREST")!;
      const before = await paBalance(c, c.bank.id);
      const made = await recon.createFromLine(c.companyId, user, feeLine.id, { counterAccountId: await c.acc("6700") }, meta);
      expect(made).toMatchObject({ status: "MATCHED", matchMethod: "CREATED" });
      expect(await balance(c, "6700")).toBe(15);
      expect(await paBalance(c, c.bank.id)).toBe(before - 15);
      await recon.createFromLine(c.companyId, user, intLine.id, { counterAccountId: await c.acc("4800"), description: "Savings interest" }, meta);
      expect(await balance(c, "4800")).toBe(-4);
      expect(await paBalance(c, c.bank.id)).toBe(before - 15 + 4);
      await expect(recon.createFromLine(c.companyId, user, feeLine.id, { counterAccountId: await c.acc("6700") }, meta)).rejects.toThrow(/unmatched line/);
      await trialBalanced(c);
    });

    it("refuses to create a transaction against the bank's own account, a heading or a closed period", async () => {
      const { c } = await bankWithBooks();
      await importCsv(c, c.bank.id, [[dmy(-1), "FEE", "", "15.00", "", "0.00"]]);
      const l = (await lines(c, c.bank.id))[0];
      await expect(recon.createFromLine(c.companyId, user, l.id, { counterAccountId: c.bank.ledgerAccount.id }, meta)).rejects.toThrow(/different account/);
      await expect(recon.createFromLine(c.companyId, user, l.id, { counterAccountId: await c.acc("6000") }, meta)).rejects.toThrow(/cannot be posted to/);
      await ledger.setLock(c.companyId, user, ymd(-1), "closed", meta);
      await expect(recon.createFromLine(c.companyId, user, l.id, { counterAccountId: await c.acc("6700") }, meta)).rejects.toThrow(/books are closed/);
    });

    it("ignores lines that need no entry, and brings them back", async () => {
      const c = await setup();
      await importCsv(c, c.bank.id, [[dmy(-1), "DUPLICATE MEMO", "", "", "10.00", "10.00"]]);
      const l = (await lines(c, c.bank.id))[0];
      expect((await recon.setIgnored(c.companyId, user, l.id, true, meta)).status).toBe("IGNORED");
      await expect(recon.setIgnored(c.companyId, user, l.id, true, meta)).rejects.toThrow(/Only an unmatched line/);
      expect((await recon.setIgnored(c.companyId, user, l.id, false, meta)).status).toBe("UNMATCHED");
      const r = await recon.report(c.companyId, c.bank.id, ymd(0), "0");
      expect(r.statementLinesNotInLedger.count).toBe(1);
    });

    it("the report shows statement balance against the books, with timing differences on both sides, and reaches zero", async () => {
      const { c } = await bankWithBooks();
      await importCsv(c, c.bank.id, [
        [dmy(-5), "TRANSFER FROM KOFI", "", "", "500.00", "500.00"],
        [dmy(-4), "TRANSFER FROM AMA", "", "", "250.00", "750.00"],
        [dmy(-3), "ECG BILL", "", "120.00", "", "630.00"],
        [dmy(-2), "FROM MTN MOMO", "", "", "300.00", "930.00"],
        [dmy(-1), "ACCOUNT FEE", "", "15.00", "", "915.00"]
      ]);
      // the books hold 930 (500 + 250 - 120 + 300); the statement is 915 because of a fee the books do not have yet
      let r = await recon.report(c.companyId, c.bank.id, ymd(0), "915");
      expect(r).toMatchObject({ ledgerBalance: "930.00", statementBalance: "915.00", difference: "0.00", reconciled: true, canClose: false });
      expect(r.statementLinesNotInLedger).toMatchObject({ count: 1, net: "-15.00" });
      expect(r.adjustedLedgerBalance).toBe("915.00");
      const fee = (await lines(c, c.bank.id, "UNMATCHED"))[0];
      await recon.createFromLine(c.companyId, user, fee.id, { counterAccountId: await c.acc("6700") }, meta);
      // a cheque banked in the books but not yet on the statement
      const inv = await issue(c, [line("Late", 1, "700")]);
      await receive(c, { paymentAccountId: c.bank.id, receiptDate: ymd(0), allocations: [{ invoiceId: inv.id, amount: "700" }] });
      r = await recon.report(c.companyId, c.bank.id, ymd(0), "915");
      expect(r).toMatchObject({ ledgerBalance: "1615.00", difference: "0.00", reconciled: true, canClose: true });
      expect(r.outstandingLedgerEntries).toMatchObject({ count: 1, net: "700.00" });
      expect(r.matchedLines).toBe(5);
      // a wrong statement balance is shown as a difference, never hidden
      expect(await recon.report(c.companyId, c.bank.id, ymd(0), "900")).toMatchObject({ difference: "-15.00", reconciled: false, canClose: false });
    });

    it("closing a reconciliation locks its matches until it is reopened, and only closes when everything agrees", async () => {
      const { c } = await bankWithBooks();
      await importCsv(c, c.bank.id, [[dmy(-5), "A", "", "", "500.00", "500.00"], [dmy(-4), "B", "", "", "250.00", "750.00"], [dmy(-3), "C", "", "120.00", "", "630.00"], [dmy(-2), "D", "", "", "300.00", "930.00"]]);
      await expect(recon.close(c.companyId, user, { paymentAccountId: c.bank.id, statementDate: ymd(-2), statementBalance: "999" }, meta)).rejects.toThrow(/does not reconcile yet: the difference/);
      const closed = await recon.close(c.companyId, user, { paymentAccountId: c.bank.id, statementDate: ymd(-2), statementBalance: "930", note: "November" }, meta);
      expect(closed.reconciledThrough).toBe(ymd(-2));
      expect((await accounts.get(c.companyId, c.bank.id)).reconciledThrough).toBe(ymd(-2));
      const matchedLine = (await lines(c, c.bank.id, "MATCHED"))[0];
      await expect(recon.unmatch(c.companyId, user, matchedLine.id, meta)).rejects.toThrow(/reconciled through/);
      await expect(recon.close(c.companyId, user, { paymentAccountId: c.bank.id, statementDate: ymd(-3), statementBalance: "630" }, meta)).rejects.toThrow(/already reconciled through/);
      await expect(accounts.update(c.companyId, user, c.bank.id, { reconcileFrom: ymd(-30) }, meta)).rejects.toThrow(/starting date can no longer change/);
      await expect(recon.reopen(c.companyId, user, { paymentAccountId: c.bank.id, reason: "Fix", reconciledThrough: ymd(0) }, meta)).rejects.toThrow(/earlier than/);
      await recon.reopen(c.companyId, user, { paymentAccountId: c.bank.id, reason: "Found a mistake" }, meta);
      expect((await accounts.get(c.companyId, c.bank.id)).reconciledThrough).toBeNull();
      await expect(recon.unmatch(c.companyId, user, matchedLine.id, meta)).resolves.toMatchObject({ status: "UNMATCHED" });
      const history = await recon.history(c.companyId, c.bank.id);
      expect(history.map((h) => [h.reconciledThrough, h.note.startsWith("Reopened")])).toEqual([[null, true], [ymd(-2), false]]);
      await rawFails(`UPDATE fin_recon_locks SET note = 'x' WHERE paymentAccountId = '${c.bank.id}'`, /append-only/);
      await rawFails(`DELETE FROM fin_recon_locks WHERE paymentAccountId = '${c.bank.id}'`, /append-only/);
      await expect(recon.reopen(c.companyId, user, { paymentAccountId: c.cash.id, reason: "nothing" }, meta)).rejects.toThrow(/Nothing is reconciled/);
    });

    it("notices a matched entry that was voided afterwards, so the books and statement never silently drift", async () => {
      const { c, r1 } = await bankWithBooks();
      await importCsv(c, c.bank.id, [[dmy(-5), "KOFI", "", "", "500.00", "500.00"]]);
      expect((await lines(c, c.bank.id))[0].status).toBe("MATCHED");
      await payments.voidReceipt(c.companyId, user, r1.id, "Wrong customer", meta);
      const r = await recon.report(c.companyId, c.bank.id, ymd(0), "500");
      expect(r.statementLinesNotInLedger.items[0]).toMatchObject({ staleMatch: true, amount: "500.00" });
      expect(r.canClose).toBe(false);
      const l = (await recon.listLines(c.companyId, { paymentAccountId: c.bank.id, status: "all" })).rows[0];
      expect(l.ledger).toMatchObject({ voided: true });
    });

    it("ignores books entries from before the first statement (the opening position) and keeps companies apart", async () => {
      const c = await setup();
      const old = await issue(c, [line("Old", 1, "800")], { issueDate: ymd(-60) });
      await receive(c, { paymentAccountId: c.bank.id, receiptDate: ymd(-50), allocations: [{ invoiceId: old.id, amount: "800" }] });
      await importCsv(c, c.bank.id, [[dmy(-10), "NEW DEPOSIT", "", "", "100.00", "900.00"]]);
      const other = await setup();
      const r = await recon.report(c.companyId, c.bank.id, ymd(0), "900");
      expect(r.outstandingLedgerEntries.count).toBe(0); // the 800 from before the statement is the opening balance, not an outstanding item
      expect(r.statementLinesNotInLedger.count).toBe(1);
      expect(r.account.reconcileFrom).toBe(ymd(-10));
      await expect(recon.listLines(other.companyId, { paymentAccountId: c.bank.id })).rejects.toThrow(/not found/);
    });
  });

  // ─── the whole books ────────────────────────────────────────────────────────

  describe("the books stay in balance", () => {
    it("after receipts, overpayments, payments, transfers, an online payment and voids, everything balances", async () => {
      const c = await setup();
      const a = await issue(c, [line("A", 2, "250")]);
      const b = await issue(c, [line("B", 1, "300")]);
      await receive(c, { paymentAccountId: c.bank.id, amount: "900", allocations: [{ invoiceId: a.id, amount: "500" }] });
      const r2 = await receive(c, { paymentAccountId: c.momo.id, method: "MOBILE_MONEY", allocations: [{ invoiceId: b.id, amount: "300" }] });
      await bank.makePayment(c.companyId, user, { payeeName: "Vet", paymentDate: ymd(0), amount: "80", method: "BANK_TRANSFER", paidFromPaymentAccountId: c.bank.id, debitAccountId: await c.acc("6110") }, meta);
      const t = await bank.transfer(c.companyId, user, { transferDate: ymd(0), fromPaymentAccountId: c.momo.id, toPaymentAccountId: c.bank.id, amount: "100", chargeAmount: "1" }, meta);
      const online1 = await issue(c, [line("Online", 1, "400")]);
      const out = await online.createCheckout(links.invoiceToken(online1.id, 1), {});
      provider.results.set(out.reference, { reference: out.reference, status: "success", amountPesewas: 40_000, feePesewas: 200, currency: "GHS", channel: "card", providerReference: "1", paidAt: new Date() });
      await online.processReference(out.reference);
      await payments.voidReceipt(c.companyId, user, r2.id, "bounced", meta);
      await bank.voidTransfer(c.companyId, user, t.id, "wrong", meta);

      await trialBalanced(c);
      const entries = await prisma.finJournalEntry.findMany({ where: { companyId: c.companyId, status: { in: ["POSTED", "REVERSED"] } } });
      for (const e of entries) expect(e.totalDebit.toString()).toBe(e.totalCredit.toString());
      // payment account balances equal their ledger accounts, always
      for (const pa of await accounts.list(c.companyId)) expect(Number(pa.balance)).toBe(await balance(c, pa.ledgerAccount.code));
      // receivables tie to what the invoices still owe
      const owed = Number((await invoices.list(c.companyId, {})).totals.outstanding);
      expect(await balance(c, "1210")).toBe(owed);
    });
  });
});
