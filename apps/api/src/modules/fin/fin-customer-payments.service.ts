import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyDepositDto, DocListQueryDto, RecordDepositDto, RecordReceiptDto } from "./dto/fin-sales.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { FinInvoicesService } from "./fin-invoices.service";
import { FinLedgerService, dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal, toPesewas } from "./fin-money";
import { FinNumberingService } from "./fin-numbering.service";

const money = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? "0.00" : pesewasToDecimal(decimalToPesewas(d)));

/** Receipts (money against invoices) and customer deposits (money in advance, a liability until applied). */
@Injectable()
export class FinCustomerPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly numbering: FinNumberingService,
    private readonly ledger: FinLedgerService,
    private readonly invoices: FinInvoicesService
  ) {}

  // ─── receipts ───────────────────────────────────────────────────────────────

  /**
   * Money received from a customer. It pays one or more invoices; if more money arrived than the invoices need (an
   * overpayment), or no invoice was chosen, the rest is kept as customer credit (a deposit linked to this receipt) that can pay later invoices.
   *   Dr cash / bank / mobile money (everything received)
   *   Cr Receivables (what went to invoices)      Cr Customer deposits (the excess)
   */
  async recordReceipt(companyId: string, userId: string, dto: RecordReceiptDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => this.recordReceiptTx(tx, companyId, userId, dto, meta));
  }

  /**
   * The same, inside a transaction the caller already holds (online payments post their receipt this way, so the receipt and
   * the "this checkout is paid" flag commit together). `opts.fee` is a provider fee taken out of the money received:
   * Dr money (received - fee), Dr Provider fees (fee), Cr Receivables / Customer deposits (the full amount).
   */
  async recordReceiptTx(tx: FinDb, companyId: string, userId: string, dto: RecordReceiptDto, meta: RequestMeta, opts: { fee?: number } = {}) {
    const contact = await this.requireContact(tx, companyId, dto.contactId);
    const date = parseDay(dto.receiptDate);
    await this.ledger.assertOpenPeriod(companyId, date, tx);
    const moneyAccountId = await this.moneyAccountFor(tx, companyId, dto);
    await this.requireMoneyAccount(tx, companyId, moneyAccountId);

    const seen = new Set<string>();
    const allocs = (dto.allocations ?? []).map((a, i) => {
      if (seen.has(a.invoiceId)) throw new BadRequestException(`Line ${i + 1}: the same invoice is listed twice.`);
      seen.add(a.invoiceId);
      const amount = toPesewas(a.amount, `Line ${i + 1} amount`);
      if (amount <= 0) throw new BadRequestException(`Line ${i + 1}: enter an amount above zero.`);
      return { invoiceId: a.invoiceId, amount };
    });
    const allocated = allocs.reduce((s, a) => s + a.amount, 0);
    const total = dto.amount === undefined || dto.amount === null || dto.amount === "" ? allocated : toPesewas(dto.amount, "The amount received");
    if (total <= 0) throw new BadRequestException("Enter the amount received.");
    if (total < allocated) throw new BadRequestException(`The amount received (${pesewasToDecimal(total)}) is less than the invoices being paid (${pesewasToDecimal(allocated)}).`);
    const excess = total - allocated;
    const fee = opts.fee ?? 0;
    if (fee < 0 || fee > total) throw new BadRequestException("The provider fee cannot be more than the amount received.");

    const invs = await tx.finInvoice.findMany({ where: { id: { in: allocs.map((a) => a.invoiceId) }, companyId } });
    const byId = new Map(invs.map((i) => [i.id, i]));
    for (const a of allocs) {
      const inv = byId.get(a.invoiceId);
      if (!inv) throw new BadRequestException("One of the invoices does not exist.");
      if (inv.status !== "SENT") throw new BadRequestException(`${inv.number ?? "A draft invoice"} is not open for payment.`);
      if (inv.contactId !== contact.id) throw new BadRequestException(`${inv.number} belongs to a different customer.`);
      if (date.getTime() < inv.issueDate.getTime()) throw new BadRequestException(`The receipt date cannot be before ${inv.number} was issued (${dayString(inv.issueDate)}).`);
    }

    const id = randomUUID();
    const number = await this.numbering.next(companyId, "RECEIPT", tx, date);
    const note = `${number} ${contact.name}`;
    const entry = await this.ledger.post(
      {
        companyId, userId, entryDate: date, description: `Receipt ${number} - ${contact.name}`, sourceModule: "FIN_RECEIPT", sourceId: id, meta,
        lines: [
          { accountId: moneyAccountId, debit: pesewasToDecimal(total - fee), description: note },
          ...(fee > 0 ? [{ role: "provider_fees", debit: pesewasToDecimal(fee), description: `${number} provider fee` }] : []),
          ...(allocated > 0 ? [{ role: "receivable", credit: pesewasToDecimal(allocated), description: note }] : []),
          ...(excess > 0 ? [{ role: "customer_credit", credit: pesewasToDecimal(excess), description: `${note} (credit)` }] : [])
        ].filter((l) => !("debit" in l && l.debit === "0.00"))
      },
      tx
    );
    await tx.finReceipt.create({
      data: {
        id, companyId, number, contactId: contact.id, receiptDate: date, amount: pesewasToDecimal(total), method: dto.method, paidToAccountId: moneyAccountId,
        reference: dto.reference?.trim() || null, notes: dto.notes?.trim() || null, journalEntryId: entry.id, createdById: userId,
        allocations: { create: allocs.map((a) => ({ invoiceId: a.invoiceId, amount: pesewasToDecimal(a.amount) })) }
      }
    });
    if (excess > 0) {
      const depositNumber = await this.numbering.next(companyId, "DEPOSIT", tx, date);
      await tx.finCustomerDeposit.create({
        data: {
          companyId, number: depositNumber, contactId: contact.id, depositDate: date, amount: pesewasToDecimal(excess), method: dto.method, paidToAccountId: moneyAccountId,
          reference: dto.reference?.trim() || null, notes: allocated > 0 ? `Overpayment on ${number}` : `Paid in advance, ${number}`, sourceReceiptId: id, journalEntryId: entry.id, createdById: userId
        }
      });
    }
    // Always lock invoices in the same order so two receipts for the same invoices cannot deadlock.
    for (const a of [...allocs].sort((x, y) => x.invoiceId.localeCompare(y.invoiceId))) await this.invoices.adjustBalance(tx, companyId, a.invoiceId, { paid: a.amount });
    await this.audit.write(
      { companyId, userId, area: "sales", action: "RECEIPT", entityType: "FinReceipt", entityId: id, summary: `Receipt ${number}: ${pesewasToDecimal(total)} from ${contact.name}${excess > 0 ? ` (${pesewasToDecimal(excess)} kept as customer credit)` : ""}`, after: { total: pesewasToDecimal(total), invoices: allocs.length, excess: pesewasToDecimal(excess), fee: pesewasToDecimal(fee), journal: entry.reference }, ...meta },
      tx
    );
    return this.getReceipt(companyId, id, tx);
  }

  async voidReceipt(companyId: string, userId: string, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM fin_receipts WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException("Receipt not found.");
      if (locked[0].status !== "POSTED") throw new BadRequestException("This receipt is already void.");
      const receipt = await tx.finReceipt.findFirstOrThrow({ where: { id, companyId }, include: { allocations: true, contact: { select: { name: true } } } });
      // Any customer credit this receipt created must still be unused, otherwise voiding would leave the books wrong.
      const credit = await tx.finCustomerDeposit.findFirst({ where: { sourceReceiptId: id, companyId, status: "POSTED" } });
      if (credit && decimalToPesewas(credit.appliedAmount) > 0) {
        throw new BadRequestException(`${money(credit.appliedAmount)} of the customer credit this receipt created (${credit.number}) has already been used on invoices. Reverse those applications first.`);
      }
      if (receipt.journalEntryId) await this.ledger.reverse(companyId, userId, receipt.journalEntryId, `Receipt ${receipt.number} voided: ${reason}`, meta, tx);
      for (const a of [...receipt.allocations].sort((x, y) => x.invoiceId.localeCompare(y.invoiceId))) {
        await this.invoices.adjustBalance(tx, companyId, a.invoiceId, { paid: -decimalToPesewas(a.amount) });
      }
      if (credit) await tx.finCustomerDeposit.update({ where: { id: credit.id }, data: { status: "VOID", voidedAt: new Date(), voidReason: `Receipt ${receipt.number} voided` } });
      await tx.finReceipt.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim() } });
      await this.audit.write({ companyId, userId, area: "sales", action: "VOID_RECEIPT", entityType: "FinReceipt", entityId: id, summary: `Voided receipt ${receipt.number} (${receipt.contact.name}): ${reason}`.slice(0, 500), ...meta }, tx);
      return this.getReceipt(companyId, id, tx);
    });
  }

  /** The ledger account the money lands in: given directly, or taken from a payment account. */
  private async moneyAccountFor(tx: FinDb, companyId: string, dto: { paidToAccountId?: string; paymentAccountId?: string }): Promise<string> {
    if (dto.paymentAccountId) {
      const pa = await tx.finPaymentAccount.findFirst({ where: { id: dto.paymentAccountId, companyId } });
      if (!pa) throw new BadRequestException("That payment account does not exist.");
      if (!pa.isActive) throw new BadRequestException(`The payment account "${pa.name}" is switched off.`);
      return pa.ledgerAccountId;
    }
    if (dto.paidToAccountId) return dto.paidToAccountId;
    throw new BadRequestException("Choose the payment account the money went into.");
  }

  async listReceipts(companyId: string, q: DocListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinReceiptWhereInput = {
      companyId,
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.from || q.to ? { receiptDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {})
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.finReceipt.findMany({ where, include: { contact: { select: { id: true, code: true, name: true } }, allocations: { include: { invoice: { select: { number: true } } } } }, orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finReceipt.count({ where }),
      this.prisma.finReceipt.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amount: true } })
    ]);
    return { rows: rows.map(presentReceipt), total, page, take, totals: { received: money(sum._sum.amount) } };
  }

  async getReceipt(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const r = await db.finReceipt.findFirst({ where: { id, companyId }, include: { contact: { select: { id: true, code: true, name: true } }, allocations: { include: { invoice: { select: { number: true } } } } } });
    if (!r) throw new NotFoundException("Receipt not found.");
    return presentReceipt(r);
  }

  // ─── deposits ───────────────────────────────────────────────────────────────

  async recordDeposit(companyId: string, userId: string, dto: RecordDepositDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await this.requireContact(tx, companyId, dto.contactId);
      const date = parseDay(dto.depositDate);
      await this.ledger.assertOpenPeriod(companyId, date, tx);
      const moneyAccountId = await this.moneyAccountFor(tx, companyId, dto);
      await this.requireMoneyAccount(tx, companyId, moneyAccountId);
      const amount = toPesewas(dto.amount, "The deposit amount");
      if (amount <= 0) throw new BadRequestException("Enter a deposit amount above zero.");
      const id = randomUUID();
      const number = await this.numbering.next(companyId, "DEPOSIT", tx, date);
      const entry = await this.ledger.post(
        {
          companyId, userId, entryDate: date, description: `Deposit ${number} - ${contact.name}`, sourceModule: "FIN_DEPOSIT", sourceId: id, meta,
          lines: [{ accountId: moneyAccountId, debit: pesewasToDecimal(amount) }, { role: "customer_credit", credit: pesewasToDecimal(amount), description: `${number} ${contact.name}` }]
        },
        tx
      );
      await tx.finCustomerDeposit.create({
        data: { id, companyId, number, contactId: contact.id, depositDate: date, amount: pesewasToDecimal(amount), method: dto.method, paidToAccountId: moneyAccountId, reference: dto.reference?.trim() || null, notes: dto.notes?.trim() || null, journalEntryId: entry.id, createdById: userId }
      });
      await this.audit.write({ companyId, userId, area: "sales", action: "DEPOSIT", entityType: "FinCustomerDeposit", entityId: id, summary: `Deposit ${number}: ${pesewasToDecimal(amount)} from ${contact.name}`, after: { amount: pesewasToDecimal(amount), journal: entry.reference }, ...meta }, tx);
      return this.getDeposit(companyId, id, tx);
    });
  }

  /** Uses part or all of a deposit to pay an invoice:   Dr Customer deposits (liability), Cr Receivables. */
  async applyDeposit(companyId: string, userId: string, depositId: string, dto: ApplyDepositDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string; amount: unknown; appliedAmount: unknown }[]>(
        Prisma.sql`SELECT status, amount, appliedAmount FROM fin_customer_deposits WHERE id = ${depositId} AND companyId = ${companyId} FOR UPDATE`
      );
      if (locked.length === 0) throw new NotFoundException("Deposit not found.");
      if (locked[0].status !== "POSTED") throw new BadRequestException("This deposit is void.");
      const deposit = await tx.finCustomerDeposit.findFirstOrThrow({ where: { id: depositId, companyId }, include: { contact: { select: { id: true, name: true } } } });
      const amount = toPesewas(dto.amount, "The amount");
      if (amount <= 0) throw new BadRequestException("Enter an amount above zero.");
      const applied = decimalToPesewas(locked[0].appliedAmount as never);
      const remaining = decimalToPesewas(locked[0].amount as never) - applied;
      if (amount > remaining) throw new BadRequestException(`Only ${pesewasToDecimal(remaining)} is left on this deposit.`);

      const inv = await tx.finInvoice.findFirst({ where: { id: dto.invoiceId, companyId } });
      if (!inv) throw new BadRequestException("That invoice does not exist.");
      if (inv.status !== "SENT") throw new BadRequestException(`${inv.number ?? "That invoice"} is not open for payment.`);
      if (inv.contactId !== deposit.contactId) throw new BadRequestException(`${inv.number} belongs to a different customer than this deposit.`);
      const earliest = Math.max(inv.issueDate.getTime(), deposit.depositDate.getTime());
      const date = dto.date ? parseDay(dto.date) : new Date(Math.max(earliest, parseDay(new Date()).getTime()));
      if (date.getTime() < earliest) throw new BadRequestException("The date cannot be before the invoice or the deposit.");
      await this.ledger.assertOpenPeriod(companyId, date, tx);

      const id = randomUUID();
      const entry = await this.ledger.post(
        {
          companyId, userId, entryDate: date, description: `Deposit ${deposit.number} applied to ${inv.number}`, sourceModule: "FIN_DEPOSIT_APPLICATION", sourceId: id, meta,
          lines: [{ role: "customer_credit", debit: pesewasToDecimal(amount), description: deposit.number }, { role: "receivable", credit: pesewasToDecimal(amount), description: inv.number ?? undefined }]
        },
        tx
      );
      await tx.finDepositApplication.create({ data: { id, depositId, invoiceId: inv.id, amount: pesewasToDecimal(amount), appliedDate: date, journalEntryId: entry.id, createdById: userId } });
      await tx.finCustomerDeposit.update({ where: { id: depositId }, data: { appliedAmount: pesewasToDecimal(applied + amount) } });
      await this.invoices.adjustBalance(tx, companyId, inv.id, { paid: amount });
      await this.audit.write({ companyId, userId, area: "sales", action: "APPLY_DEPOSIT", entityType: "FinCustomerDeposit", entityId: depositId, summary: `Applied ${pesewasToDecimal(amount)} of ${deposit.number} to ${inv.number}`, after: { invoice: inv.number, amount: pesewasToDecimal(amount) }, ...meta }, tx);
      return this.getDeposit(companyId, depositId, tx);
    });
  }

  /** Cancels a deposit that has not been used. A deposit created by a credit note is cancelled by voiding that credit note. */
  async voidDeposit(companyId: string, userId: string, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string; appliedAmount: unknown }[]>(Prisma.sql`SELECT status, appliedAmount FROM fin_customer_deposits WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException("Deposit not found.");
      if (locked[0].status !== "POSTED") throw new BadRequestException("This deposit is already void.");
      if (decimalToPesewas(locked[0].appliedAmount as never) > 0) throw new BadRequestException("Part of this deposit has been applied to invoices, so it cannot be voided.");
      const deposit = await tx.finCustomerDeposit.findFirstOrThrow({ where: { id, companyId }, include: { contact: { select: { name: true } } } });
      if (deposit.sourceCreditNoteId) throw new BadRequestException("This credit came from a credit note. Void the credit note instead.");
      if (deposit.sourceReceiptId) throw new BadRequestException("This credit came from a receipt. Void the receipt instead.");
      if (deposit.journalEntryId) await this.ledger.reverse(companyId, userId, deposit.journalEntryId, `Deposit ${deposit.number} voided: ${reason}`, meta, tx);
      await tx.finCustomerDeposit.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim() } });
      await this.audit.write({ companyId, userId, area: "sales", action: "VOID_DEPOSIT", entityType: "FinCustomerDeposit", entityId: id, summary: `Voided deposit ${deposit.number} (${deposit.contact.name}): ${reason}`.slice(0, 500), ...meta }, tx);
      return this.getDeposit(companyId, id, tx);
    });
  }

  async listDeposits(companyId: string, q: DocListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinCustomerDepositWhereInput = {
      companyId,
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.from || q.to ? { depositDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {})
    };
    const all = await this.prisma.finCustomerDeposit.findMany({ where, include: { contact: { select: { id: true, code: true, name: true } } }, orderBy: [{ depositDate: "desc" }, { createdAt: "desc" }] });
    // "Open" = still has money left to apply. That compares two columns, so it is filtered here rather than in SQL.
    const filtered = q.openOnly ? all.filter((d) => d.status === "POSTED" && decimalToPesewas(d.amount) > decimalToPesewas(d.appliedAmount)) : all;
    const unapplied = filtered.filter((d) => d.status === "POSTED").reduce((s, d) => s + decimalToPesewas(d.amount) - decimalToPesewas(d.appliedAmount), 0);
    return { rows: filtered.slice((page - 1) * take, page * take).map(presentDeposit), total: filtered.length, page, take, totals: { unapplied: pesewasToDecimal(unapplied) } };
  }

  async getDeposit(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const d = await db.finCustomerDeposit.findFirst({ where: { id, companyId }, include: { contact: { select: { id: true, code: true, name: true } }, applications: { include: { invoice: { select: { number: true } } }, orderBy: { createdAt: "asc" } } } });
    if (!d) throw new NotFoundException("Deposit not found.");
    return { ...presentDeposit(d), applications: d.applications.map((a) => ({ id: a.id, invoiceId: a.invoiceId, invoiceNumber: a.invoice.number, amount: money(a.amount), date: dayString(a.appliedDate) })) };
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private async requireContact(db: FinDb, companyId: string, id: string) {
    const c = await db.finContact.findFirst({ where: { id, companyId } });
    if (!c) throw new BadRequestException("That customer does not exist.");
    if (!c.isActive) throw new BadRequestException(`${c.name} is switched off.`);
    return c;
  }

  /** The account the money lands in: an active posting ASSET account that is not the receivables control account. */
  private async requireMoneyAccount(db: FinDb, companyId: string, accountId: string) {
    const a = await db.finAccount.findFirst({ where: { id: accountId, companyId } });
    if (!a) throw new BadRequestException("Choose the cash, bank or mobile money account the money went into.");
    if (a.type !== "ASSET" || !a.isPostable || !a.isActive) throw new BadRequestException(`${a.code} ${a.name} cannot receive money. Choose a cash, bank or mobile money account.`);
    if (a.systemRole === "receivable" || a.systemRole?.startsWith("inventory")) throw new ConflictException(`${a.code} ${a.name} is not a cash or bank account.`);
    return a;
  }
}

type ReceiptRow = Prisma.FinReceiptGetPayload<{ include: { contact: { select: { id: true; code: true; name: true } }; allocations: { include: { invoice: { select: { number: true } } } } } }>;

function presentReceipt(r: ReceiptRow) {
  return {
    id: r.id, number: r.number, contact: r.contact, receiptDate: dayString(r.receiptDate), amount: money(r.amount), method: r.method, paidToAccountId: r.paidToAccountId,
    reference: r.reference, notes: r.notes, status: r.status, voidedAt: r.voidedAt, voidReason: r.voidReason, journalEntryId: r.journalEntryId, createdAt: r.createdAt,
    allocations: r.allocations.map((a) => ({ id: a.id, invoiceId: a.invoiceId, invoiceNumber: a.invoice.number, amount: money(a.amount) }))
  };
}

type DepositRow = Prisma.FinCustomerDepositGetPayload<{ include: { contact: { select: { id: true; code: true; name: true } } } }>;

function presentDeposit(d: DepositRow) {
  const remaining = decimalToPesewas(d.amount) - decimalToPesewas(d.appliedAmount);
  return {
    id: d.id, number: d.number, contact: d.contact, depositDate: dayString(d.depositDate), amount: money(d.amount), appliedAmount: money(d.appliedAmount), remaining: pesewasToDecimal(remaining),
    method: d.method, paidToAccountId: d.paidToAccountId, reference: d.reference, notes: d.notes, sourceCreditNoteId: d.sourceCreditNoteId, sourceReceiptId: d.sourceReceiptId, status: d.status, voidedAt: d.voidedAt, voidReason: d.voidReason, createdAt: d.createdAt
  };
}
