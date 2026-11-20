/**
 * Finance v2 integration tests. They run against a REAL MySQL that already has the fin_* migrations applied
 * (the DB triggers are part of what is being tested), so they only run when FIN_TEST_DATABASE_URL is set:
 *
 *   FIN_TEST_DATABASE_URL=mysql://root:pw@127.0.0.1:3399/fintest npx jest src/modules/fin
 *
 * Every test uses a fresh company id, so tests never see each other's data.
 */
import { randomUUID } from "crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { FinAccountsService } from "./fin-accounts.service";
import { FinAuditService } from "./fin-audit.service";
import { FinLedgerService } from "./fin-ledger.service";
import { FinNumberingService } from "./fin-numbering.service";
import { FinReportsService } from "./fin-reports.service";
import { FinSettingsService } from "./fin-settings.service";

const URL = process.env.FIN_TEST_DATABASE_URL;
const maybe = URL ? describe : describe.skip;

maybe("finance v2 ledger (real MySQL)", () => {
  let prisma: PrismaClient;
  let audit: FinAuditService;
  let numbering: FinNumberingService;
  let ledger: FinLedgerService;
  let accounts: FinAccountsService;
  let reports: FinReportsService;
  let settings: FinSettingsService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: URL } } });
    await prisma.$connect();
    audit = new FinAuditService(prisma as never);
    numbering = new FinNumberingService(prisma as never, audit);
    ledger = new FinLedgerService(prisma as never, numbering, audit);
    accounts = new FinAccountsService(prisma as never, audit);
    reports = new FinReportsService(prisma as never);
    settings = new FinSettingsService(prisma as never, audit, numbering);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const user = "user-1";
  const meta = { ipAddress: "127.0.0.1", userAgent: "jest" };

  /** A fresh company with the poultry chart applied. */
  async function company() {
    const companyId = randomUUID();
    await accounts.applyTemplate(companyId, user, meta);
    return companyId;
  }
  const idOf = async (companyId: string, code: string) => (await prisma.finAccount.findFirstOrThrow({ where: { companyId, code } })).id;
  const sale = (companyId: string, amount: string, on = "2026-11-10", src?: string) =>
    ledger.post({ companyId, userId: user, entryDate: on, description: "Cash sale", sourceModule: src ? "TEST" : undefined, sourceId: src, lines: [{ role: "cash", debit: amount }, { role: "sales", credit: amount }] });

  describe("posting", () => {
    it("posts a balanced entry by role, numbers it, and writes an audit row", async () => {
      const c = await company();
      const e = await sale(c, "150.50");
      expect(e.created).toBe(true);
      expect(e.reference).toMatch(/^JE-\d{4}-0001$/);
      const entry = await ledger.getEntry(c, e.id);
      expect(entry.status).toBe("POSTED");
      expect(entry.totalDebit.toString()).toBe("150.5");
      expect(entry.lines.map((l) => l.account.code)).toEqual(["1110", "4500"]);
      const log = await prisma.finAuditLog.findMany({ where: { companyId: c, entityId: e.id } });
      expect(log.map((l) => l.action)).toContain("POST");
    });

    it("refuses an unbalanced entry and writes nothing", async () => {
      const c = await company();
      await expect(
        ledger.post({ companyId: c, userId: user, entryDate: "2026-11-10", description: "bad", lines: [{ role: "cash", debit: "100" }, { role: "sales", credit: "99.99" }] })
      ).rejects.toThrow(/does not balance/);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c } })).toBe(0);
    });

    it("refuses bad lines: both sides, zero, negative, 3 decimals, one line only", async () => {
      const c = await company();
      const post = (lines: object[]) => ledger.post({ companyId: c, userId: user, entryDate: "2026-11-10", description: "x", lines: lines as never });
      await expect(post([{ role: "cash", debit: "5", credit: "5" }, { role: "sales", credit: "5" }])).rejects.toThrow(/either a debit or a credit/);
      await expect(post([{ role: "cash", debit: "0" }, { role: "sales", credit: "0" }])).rejects.toThrow(/enter an amount/);
      await expect(post([{ role: "cash", debit: "-5" }, { role: "sales", credit: "5" }])).rejects.toThrow(/negative/);
      await expect(post([{ role: "cash", debit: "5.001" }, { role: "sales", credit: "5.001" }])).rejects.toThrow(/2 decimal/);
      await expect(post([{ role: "cash", debit: "5" }])).rejects.toThrow(/at least two lines/);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c } })).toBe(0);
    });

    it("refuses headings, inactive accounts, other companies' accounts and unset roles", async () => {
      const c = await company();
      const other = await company();
      const heading = await idOf(c, "1000");
      const cash = await idOf(c, "1110");
      const tax = await idOf(c, "2180"); // inactive in the template
      const foreign = await idOf(other, "4500");
      const post = (credit: { accountId?: string; role?: string }) =>
        ledger.post({ companyId: c, userId: user, entryDate: "2026-11-10", description: "x", lines: [{ accountId: cash, debit: "10" }, { ...credit, credit: "10" }] });
      await expect(post({ accountId: heading })).rejects.toThrow(/heading/);
      await expect(post({ accountId: tax })).rejects.toThrow(/inactive/);
      await expect(post({ accountId: foreign })).rejects.toThrow(/does not exist/);
      await expect(post({ role: "no_such_role" })).rejects.toThrow(/No account is set up/);
    });

    it("is idempotent per source event: posting twice returns the first entry", async () => {
      const c = await company();
      const a = await sale(c, "10", "2026-11-10", "inv-1");
      const b = await sale(c, "10", "2026-11-10", "inv-1");
      expect(a.created).toBe(true);
      expect(b.created).toBe(false);
      expect(b.id).toBe(a.id);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c } })).toBe(1);
    });

    it("gives 12 concurrent posts 12 different, gapless numbers", async () => {
      const c = await company();
      const res = await Promise.all(Array.from({ length: 12 }, (_, i) => sale(c, String(i + 1))));
      const refs = res.map((r) => r.reference).sort();
      expect(new Set(refs).size).toBe(12);
      expect(refs[0]).toMatch(/-0001$/);
      expect(refs[11]).toMatch(/-0012$/);
    });

    it("survives 12 simultaneous FIRST postings when the company has no numbering rows yet", async () => {
      const c = await company();
      await prisma.finNumberSequence.deleteMany({ where: { companyId: c } });
      const res = await Promise.all(Array.from({ length: 12 }, (_, i) => sale(c, String(i + 1))));
      expect(new Set(res.map((r) => r.reference)).size).toBe(12);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c, status: "POSTED" } })).toBe(12);
    });

    it("rolls back completely, number included, when the surrounding transaction fails", async () => {
      const c = await company();
      await expect(
        prisma.$transaction(async (tx) => {
          await ledger.post({ companyId: c, userId: user, entryDate: "2026-11-10", description: "doomed", lines: [{ role: "cash", debit: "5" }, { role: "sales", credit: "5" }] }, tx);
          throw new Error("later step failed");
        })
      ).rejects.toThrow("later step failed");
      expect(await prisma.finJournalEntry.count({ where: { companyId: c } })).toBe(0);
      const next = await sale(c, "5");
      expect(next.reference).toMatch(/-0001$/); // the number was not burned
    });
  });

  describe("period lock", () => {
    it("blocks posting into a closed period, allows after it, and reopening is audited history", async () => {
      const c = await company();
      await sale(c, "10", "2026-10-15");
      await ledger.setLock(c, user, "2026-10-31", "October closed", meta);
      await expect(sale(c, "10", "2026-10-31")).rejects.toThrow(/closed through 2026-10-31/);
      await expect(sale(c, "10", "2026-10-01")).rejects.toThrow(/closed through/);
      await expect(sale(c, "10", "2026-11-01")).resolves.toMatchObject({ created: true });
      await ledger.setLock(c, user, null, "Reopened to fix a mistake", meta);
      await expect(sale(c, "10", "2026-10-20")).resolves.toMatchObject({ created: true });
      const status = await ledger.periodStatus(c);
      expect(status.lockedThrough).toBeNull();
      expect(status.history).toHaveLength(2);
    });

    it("cannot close a future date, and cannot edit or delete lock history in the database", async () => {
      const c = await company();
      await expect(ledger.setLock(c, user, "2099-01-01", "future", meta)).rejects.toThrow(BadRequestException);
      await ledger.setLock(c, user, "2026-01-31", "January", meta);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_period_locks SET reason='x' WHERE companyId='${c}'`)).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_period_locks WHERE companyId='${c}'`)).rejects.toThrow(/append-only/);
    });
  });

  describe("immutability (database triggers)", () => {
    it("refuses to edit or delete a posted entry or its lines, and to add lines to it", async () => {
      const c = await company();
      const e = await sale(c, "100");
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_journal_entries SET description='changed' WHERE id='${e.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_journal_entries SET totalDebit=1 WHERE id='${e.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_journal_entries WHERE id='${e.id}'`)).rejects.toThrow(/cannot be deleted/);
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_journal_lines SET debit=1 WHERE journalEntryId='${e.id}'`)).rejects.toThrow(/cannot be edited/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_journal_lines WHERE journalEntryId='${e.id}'`)).rejects.toThrow(/cannot be deleted/);
      const cash = await idOf(c, "1110");
      await expect(
        prisma.$executeRawUnsafe(`INSERT INTO fin_journal_lines (id, journalEntryId, accountId, lineNo, debit, credit) VALUES (UUID(), '${e.id}', '${cash}', 9, 1, 0)`)
      ).rejects.toThrow(/draft/);
    });

    it("refuses to post an unbalanced draft even if the app is bypassed", async () => {
      const c = await company();
      const cash = await idOf(c, "1110");
      const entryId = randomUUID();
      await prisma.finJournalEntry.create({ data: { id: entryId, companyId: c, reference: "DRAFT-x", entryDate: new Date("2026-11-10"), description: "bypass", status: "DRAFT", totalDebit: "10.00", totalCredit: "10.00" } });
      await prisma.finJournalLine.create({ data: { journalEntryId: entryId, accountId: cash, lineNo: 1, debit: "10.00", credit: "0.00" } });
      await expect(prisma.finJournalEntry.update({ where: { id: entryId }, data: { status: "POSTED" } })).rejects.toThrow(/must balance/);
    });

    it("makes the audit log append-only", async () => {
      const c = await company();
      const log = await prisma.finAuditLog.findFirstOrThrow({ where: { companyId: c } });
      await expect(prisma.$executeRawUnsafe(`UPDATE fin_audit_logs SET summary='tampered' WHERE id='${log.id}'`)).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM fin_audit_logs WHERE id='${log.id}'`)).rejects.toThrow(/append-only/);
    });
  });

  describe("reversal", () => {
    it("posts the opposite entry, marks the original reversed, and nets the books to zero", async () => {
      const c = await company();
      const e = await sale(c, "250");
      const r = await ledger.reverse(c, user, e.id, "Posted to wrong account", meta);
      const original = await ledger.getEntry(c, e.id);
      const reversal = await ledger.getEntry(c, r.id);
      expect(original.status).toBe("REVERSED");
      expect(original.reversedById).toBe(r.id);
      expect(reversal.type).toBe("REVERSAL");
      expect(reversal.reversalOf).toBe(e.id);
      expect(reversal.lines.map((l) => [l.account.code, l.debit.toString(), l.credit.toString()])).toEqual([
        ["1110", "0", "250"],
        ["4500", "250", "0"]
      ]);
      const tb = await reports.trialBalance(c, { asOf: "2026-12-31" });
      expect(tb.balanced).toBe(true);
      expect(tb.rows.every((row) => row.closingDebit === 0 && row.closingCredit === 0)).toBe(true);
    });

    it("cannot reverse twice, reverse a reversal, or reverse a draft", async () => {
      const c = await company();
      const e = await sale(c, "40");
      const r = await ledger.reverse(c, user, e.id, "oops", meta);
      await expect(ledger.reverse(c, user, e.id, "again", meta)).rejects.toThrow(/already been reversed/);
      await expect(ledger.reverse(c, user, r.id, "undo the undo", meta)).rejects.toThrow(/cannot itself be reversed/);
      const draft = await ledger.createDraft(c, user, { entryDate: "2026-11-10", description: "draft", lines: [{ role: "cash", debit: "1" }, { role: "sales", credit: "1" }] }, meta);
      await expect(ledger.reverse(c, user, draft.id, "x", meta)).rejects.toThrow(/not been posted/);
    });

    it("reverses into today when the original period is closed", async () => {
      const c = await company();
      const e = await sale(c, "75", "2026-09-10");
      await ledger.setLock(c, user, "2026-09-30", "Sept closed", meta);
      const r = await ledger.reverse(c, user, e.id, "late fix", meta);
      const reversal = await ledger.getEntry(c, r.id);
      expect(reversal.entryDate.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    });

    it("keeps the original's date when its period is open", async () => {
      const c = await company();
      const e = await sale(c, "75", "2026-09-10");
      const r = await ledger.reverse(c, user, e.id, "fix", meta);
      expect((await ledger.getEntry(c, r.id)).entryDate.toISOString().slice(0, 10)).toBe("2026-09-10");
    });
  });

  describe("manual journals: draft to post", () => {
    it("creates, edits, posts a draft, then refuses further edits", async () => {
      const c = await company();
      const cash = await idOf(c, "1110");
      const sales = await idOf(c, "4500");
      const d = await ledger.createDraft(c, user, { entryDate: "2026-11-10", description: "Manual", lines: [{ accountId: cash, debit: "10" }, { accountId: sales, credit: "5" }] }, meta);
      expect(d.status).toBe("DRAFT");
      expect(d.reference).toMatch(/^DRAFT-/); // no real number yet: drafts never burn numbers
      await expect(ledger.postDraft(c, user, d.id, meta)).rejects.toThrow(/does not balance/);
      await ledger.updateDraft(c, user, d.id, { lines: [{ accountId: cash, debit: "10" }, { accountId: sales, credit: "10" }] }, meta);
      const posted = await ledger.postDraft(c, user, d.id, meta);
      expect(posted.status).toBe("POSTED");
      expect(posted.reference).toMatch(/^JE-\d{4}-0001$/);
      await expect(ledger.updateDraft(c, user, d.id, { description: "tamper" }, meta)).rejects.toThrow(/Only a draft/);
      await expect(ledger.deleteDraft(c, user, d.id, meta)).rejects.toThrow(/Only a draft/);
      await expect(ledger.postDraft(c, user, d.id, meta)).rejects.toThrow(/Only a draft/);
    });

    it("lets a draft be deleted, leaving no lines behind", async () => {
      const c = await company();
      const cash = await idOf(c, "1110");
      const d = await ledger.createDraft(c, user, { entryDate: "2026-11-10", description: "Scrap", lines: [{ accountId: cash, debit: "10" }] }, meta);
      await ledger.deleteDraft(c, user, d.id, meta);
      expect(await prisma.finJournalEntry.count({ where: { companyId: c } })).toBe(0);
      expect(await prisma.finJournalLine.count({ where: { journalEntryId: d.id } })).toBe(0);
    });

    it("re-checks the period and account state at the moment of posting", async () => {
      const c = await company();
      const cash = await idOf(c, "1110");
      const bank = await idOf(c, "1120");
      const d = await ledger.createDraft(c, user, { entryDate: "2026-08-10", description: "Old", lines: [{ accountId: cash, debit: "10" }, { accountId: bank, credit: "10" }] }, meta);
      await ledger.setLock(c, user, "2026-08-31", "Aug closed", meta);
      await expect(ledger.postDraft(c, user, d.id, meta)).rejects.toThrow(/closed through/);
      await ledger.setLock(c, user, null, "reopen", meta);
      await prisma.finAccount.update({ where: { id: bank }, data: { systemRole: null } });
      await accounts.update(c, user, bank, { isActive: false }, meta);
      await expect(ledger.postDraft(c, user, d.id, meta)).rejects.toThrow(/inactive/);
    });
  });

  describe("trial balance and account ledger", () => {
    it("balances, shows opening / movement / closing, and ignores drafts", async () => {
      const c = await company();
      await sale(c, "100", "2026-10-05");
      await sale(c, "50.25", "2026-11-05");
      await ledger.createDraft(c, user, { entryDate: "2026-11-06", description: "ignored draft", lines: [{ role: "cash", debit: "999" }, { role: "sales", credit: "999" }] }, meta);

      const asOf = await reports.trialBalance(c, { asOf: "2026-11-30" });
      expect(asOf.balanced).toBe(true);
      expect(asOf.totals.closingDebit).toBe(150.25);
      expect(asOf.totals.closingCredit).toBe(150.25);

      const range = await reports.trialBalance(c, { from: "2026-11-01", to: "2026-11-30" });
      const cash = range.rows.find((r) => r.code === "1110")!;
      expect(cash.openingDebit).toBe(100);
      expect(cash.debit).toBe(50.25);
      expect(cash.closingDebit).toBe(150.25);
      const sales = range.rows.find((r) => r.code === "4500")!;
      expect(sales.openingCredit).toBe(100);
      expect(sales.credit).toBe(50.25);
      expect(range.balanced).toBe(true);
      expect(range.byType.find((t) => t.type === "ASSET")!.debit).toBe(150.25);
    });

    it("never drifts on many small amounts (pesewa-exact)", async () => {
      const c = await company();
      for (let i = 0; i < 25; i++) await sale(c, "0.10");
      const tb = await reports.trialBalance(c, { asOf: "2026-12-31" });
      expect(tb.rows.find((r) => r.code === "1110")!.closingDebit).toBe(2.5);
      expect(tb.balanced).toBe(true);
    });

    it("gives an account ledger with a running balance", async () => {
      const c = await company();
      await sale(c, "100", "2026-10-05");
      await sale(c, "40", "2026-11-05");
      const cash = await idOf(c, "1110");
      const all = await reports.accountLedger(c, cash, {});
      expect(all.rows.map((r) => r.balance)).toEqual([100, 140]);
      const nov = await reports.accountLedger(c, cash, { from: "2026-11-01" });
      expect(nov.openingBalance).toBe(100);
      expect(nov.closingBalance).toBe(140);
      expect(nov.rows).toHaveLength(1);
    });

    it("keeps companies apart", async () => {
      const a = await company();
      const b = await company();
      await sale(a, "100");
      expect((await reports.trialBalance(b, { asOf: "2026-12-31" })).rows).toHaveLength(0);
    });
  });

  describe("chart of accounts rules", () => {
    it("applies the template once, only to an empty chart", async () => {
      const c = await company();
      expect(await prisma.finAccount.count({ where: { companyId: c } })).toBeGreaterThan(70);
      await expect(accounts.applyTemplate(c, user, meta)).rejects.toThrow(ConflictException);
      const list = await accounts.list(c);
      expect(list.find((a) => a.code === "2180")!.isActive).toBe(false);
    });

    it("keeps codes and ledger roles unique, and a role on the right type", async () => {
      const c = await company();
      await expect(accounts.create(c, user, { code: "1110", name: "Dup", type: "ASSET" }, meta)).rejects.toThrow(/already used/);
      await expect(accounts.create(c, user, { code: "1111", name: "Second cash", type: "ASSET", systemRole: "cash" }, meta)).rejects.toThrow(/already set on/);
      await expect(accounts.create(c, user, { code: "1112", name: "Wrong type", type: "EXPENSE", systemRole: "bank" }, meta)).rejects.toThrow(/needs a asset account|asset/);
    });

    it("only allows headings as parents, of the same type", async () => {
      const c = await company();
      const cashAcc = await idOf(c, "1110"); // posting account
      const assetsHeading = await idOf(c, "1100");
      const revenueHeading = await idOf(c, "4000");
      await expect(accounts.create(c, user, { code: "1119", name: "Under posting", type: "ASSET", parentId: cashAcc }, meta)).rejects.toThrow(/posting account/);
      await expect(accounts.create(c, user, { code: "1118", name: "Wrong type", type: "ASSET", parentId: revenueHeading }, meta)).rejects.toThrow(/same type/);
      await expect(accounts.create(c, user, { code: "1117", name: "Fine", type: "ASSET", parentId: assetsHeading }, meta)).resolves.toBeDefined();
    });

    it("protects accounts with postings and accounts the ledger depends on", async () => {
      const c = await company();
      await sale(c, "10");
      const cash = await idOf(c, "1110");
      await expect(accounts.update(c, user, cash, { type: "LIABILITY" }, meta)).rejects.toThrow(/postings/);
      await expect(accounts.update(c, user, cash, { code: "9999" }, meta)).rejects.toThrow(/postings/);
      await expect(accounts.update(c, user, cash, { isPostable: false }, meta)).rejects.toThrow(/postings|ledger role/);
      await expect(accounts.update(c, user, cash, { isActive: false }, meta)).rejects.toThrow(/Give that role to another account/);
      await expect(accounts.update(c, user, cash, { name: "Cash in tin" }, meta)).resolves.toMatchObject({ name: "Cash in tin" });
    });

    it("lets the ledger role move to another account", async () => {
      const c = await company();
      const cash = await idOf(c, "1110");
      const petty = await idOf(c, "1115");
      await accounts.update(c, user, cash, { systemRole: null }, meta);
      await accounts.update(c, user, petty, { systemRole: "cash" }, meta);
      const e = await sale(c, "10");
      expect((await ledger.getEntry(c, e.id)).lines[0].account.code).toBe("1115");
    });

    it("blocks a parent cycle", async () => {
      const c = await company();
      const assets = await idOf(c, "1000");
      const current = await idOf(c, "1100");
      await expect(accounts.update(c, user, assets, { parentId: current }, meta)).rejects.toThrow(/ancestor/);
    });
  });

  describe("settings and numbering", () => {
    it("creates defaults, updates business details and audits the change without storing the logo", async () => {
      const c = randomUUID();
      const first = await settings.get(c);
      expect(first.currency).toBe("GHS");
      expect(first.country).toBe("Ghana");
      const png = "data:image/png;base64,iVBORw0KGgo=";
      const updated = await settings.update(c, user, { businessName: "Jokas Farms", tin: "C0012345678", addressLine1: "Plot 5", city: "Kumasi", logoDataUrl: png, fiscalYearStartMonth: 4, fiscalYearStartDay: 1 }, meta);
      expect(updated.businessName).toBe("Jokas Farms");
      expect(updated.hasLogo).toBe(true);
      const log = await prisma.finAuditLog.findFirstOrThrow({ where: { companyId: c, entityType: "FinSettings", action: "UPDATE" } });
      expect(JSON.stringify(log.after)).not.toContain("base64");
      expect((log.after as { hasLogo: boolean }).hasLogo).toBe(true);
      expect((log.before as { hasLogo: boolean }).hasLogo).toBe(false);
    });

    it("validates fiscal day, empty name, logo type", async () => {
      const c = randomUUID();
      await expect(settings.update(c, user, { fiscalYearStartMonth: 2, fiscalYearStartDay: 31 }, meta)).rejects.toThrow(/does not exist/);
      await expect(settings.update(c, user, { businessName: "   " }, meta)).rejects.toThrow(/cannot be empty/);
      await expect(settings.update(c, user, { logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }, meta)).rejects.toThrow(/PNG, JPEG or WebP/);
      const ok = await settings.update(c, user, { logoDataUrl: null }, meta);
      expect(ok.hasLogo).toBe(false);
    });

    it("customises numbering and only lets the next number go up", async () => {
      const c = randomUUID();
      await numbering.update(c, user, "INVOICE", { prefix: "JKS", padding: 5, nextNumber: 100, includeYear: false }, meta);
      expect(await numbering.next(c, "INVOICE")).toBe("JKS-00100");
      expect(await numbering.next(c, "INVOICE")).toBe("JKS-00101");
      await expect(numbering.update(c, user, "INVOICE", { nextNumber: 50 }, meta)).rejects.toThrow(/only go up/);
      const list = await numbering.list(c);
      expect(list.find((s) => s.docType === "INVOICE")!.preview).toBe("JKS-00102");
    });

    it("restarts yearly sequences in a new year", async () => {
      const c = randomUUID();
      expect(await numbering.next(c, "RECEIPT", undefined, new Date("2026-12-30T00:00:00Z"))).toBe("RCT-2026-0001");
      expect(await numbering.next(c, "RECEIPT", undefined, new Date("2026-12-31T00:00:00Z"))).toBe("RCT-2026-0002");
      expect(await numbering.next(c, "RECEIPT", undefined, new Date("2027-01-02T00:00:00Z"))).toBe("RCT-2027-0001");
    });

    it("rejects an unknown document type", async () => {
      await expect(numbering.next(randomUUID(), "NOPE")).rejects.toThrow(/Unknown document type/);
    });
  });
});
