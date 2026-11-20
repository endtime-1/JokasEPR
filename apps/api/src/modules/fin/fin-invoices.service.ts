import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvoiceDto, InvoiceQueryDto, UpdateInvoiceDto } from "./dto/fin-sales.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { decimalToPesewas, pesewasToDecimal } from "./fin-money";
import { FinLedgerService, FinPostLine, dayString, parseDay } from "./fin-ledger.service";
import { FinNumberingService } from "./fin-numbering.service";
import { PreparedLine, lineRows, prepareLines } from "./fin-sales-lines";
import { addDays } from "./fin-sales-math";
import { FinTaxService } from "./fin-tax.service";

type InvoiceWithAll = Prisma.FinInvoiceGetPayload<{ include: { lines: true; contact: true } }>;

export type DisplayStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

/** The customer-facing status: derived from the stored status, the payment counters and today's date. */
export function displayStatus(inv: { status: string; paymentStatus: string; dueDate: Date }, today: Date = parseDay(new Date())): DisplayStatus {
  if (inv.status === "DRAFT") return "DRAFT";
  if (inv.status === "VOID") return "VOID";
  if (inv.paymentStatus === "PAID") return "PAID";
  if (inv.dueDate.getTime() < today.getTime()) return "OVERDUE";
  return inv.paymentStatus === "PARTIAL" ? "PARTIALLY_PAID" : "SENT";
}

const money = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? "0.00" : pesewasToDecimal(decimalToPesewas(d)));

@Injectable()
export class FinInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly numbering: FinNumberingService,
    private readonly ledger: FinLedgerService,
    private readonly tax: FinTaxService
  ) {}

  // ─── reading ────────────────────────────────────────────────────────────────

  async list(companyId: string, q: InvoiceQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const today = parseDay(new Date());
    const search = q.search?.trim();
    const unpaid = { in: ["UNPAID", "PARTIAL"] as ("UNPAID" | "PARTIAL")[] };
    const statusWhere: Prisma.FinInvoiceWhereInput =
      q.status === "draft" ? { status: "DRAFT" }
      : q.status === "void" ? { status: "VOID" }
      : q.status === "open" ? { status: "SENT", paymentStatus: unpaid }
      : q.status === "partial" ? { status: "SENT", paymentStatus: "PARTIAL" }
      : q.status === "paid" ? { status: "SENT", paymentStatus: "PAID" }
      : q.status === "overdue" ? { status: "SENT", paymentStatus: unpaid, dueDate: { lt: today } }
      : {};
    const where: Prisma.FinInvoiceWhereInput = {
      companyId,
      ...statusWhere,
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.from || q.to ? { issueDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {}),
      ...(search ? { OR: [{ number: { contains: search } }, { contact: { name: { contains: search } } }, { contact: { code: { contains: search } } }] } : {})
    };
    const issued: Prisma.FinInvoiceWhereInput = { ...where, status: "SENT" };
    const [rows, total, sums, overdue] = await Promise.all([
      this.prisma.finInvoice.findMany({ where, include: { contact: { select: { id: true, code: true, name: true } } }, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finInvoice.count({ where }),
      this.prisma.finInvoice.aggregate({ where: issued, _sum: { total: true, paidAmount: true, creditedAmount: true, balanceDue: true } }),
      this.prisma.finInvoice.aggregate({ where: { ...issued, paymentStatus: unpaid, dueDate: { lt: today } }, _sum: { balanceDue: true } })
    ]);
    return {
      rows: rows.map((r) => ({ ...presentHeader(r), contact: r.contact })),
      total,
      page,
      take,
      totals: { invoiced: money(sums._sum.total), paid: money(sums._sum.paidAmount), credited: money(sums._sum.creditedAmount), outstanding: money(sums._sum.balanceDue), overdue: money(overdue._sum.balanceDue) }
    };
  }

  async get(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const inv = await db.finInvoice.findFirst({
      where: { id, companyId },
      include: {
        contact: true,
        lines: { orderBy: { lineNo: "asc" } },
        allocations: { include: { receipt: { select: { id: true, number: true, receiptDate: true, status: true, method: true } } } },
        applications: { include: { deposit: { select: { id: true, number: true } } } },
        creditNotes: { select: { id: true, number: true, creditDate: true, total: true, status: true } }
      }
    });
    if (!inv) throw new NotFoundException("Invoice not found.");
    return { ...presentHeader(inv), contact: inv.contact, lines: inv.lines.map(presentLine), allocations: inv.allocations, applications: inv.applications, creditNotes: inv.creditNotes };
  }

  // ─── drafts ─────────────────────────────────────────────────────────────────

  async createDraft(companyId: string, userId: string, dto: CreateInvoiceDto, meta: RequestMeta, extra: { quoteId?: string; recurringId?: string; recurringRunDate?: Date } = {}, db?: FinDb): Promise<Awaited<ReturnType<FinInvoicesService["get"]>>> {
    if (!db) return this.prisma.$transaction((tx) => this.createDraft(companyId, userId, dto, meta, extra, tx));
    const contact = await this.requireCustomer(db, companyId, dto.contactId);
    const issueDate = parseDay(dto.issueDate);
    const dueDate = dto.dueDate ? parseDay(dto.dueDate) : addDays(issueDate, contact.paymentTermsDays);
    if (dueDate.getTime() < issueDate.getTime()) throw new BadRequestException("The due date cannot be before the invoice date.");
    const { lines, totals } = await prepareLines(db, this.tax, companyId, dto.lines, issueDate);
    const created = await db.finInvoice.create({
      data: {
        companyId,
        contactId: contact.id,
        issueDate,
        dueDate,
        currency: "GHS",
        subtotal: pesewasToDecimal(totals.subtotal),
        discountTotal: pesewasToDecimal(totals.discountTotal),
        taxTotal: pesewasToDecimal(totals.taxTotal),
        total: pesewasToDecimal(totals.total),
        balanceDue: pesewasToDecimal(totals.total),
        notes: dto.notes?.trim() || null,
        terms: dto.terms?.trim() || null,
        quoteId: extra.quoteId ?? null,
        recurringId: extra.recurringId ?? null,
        recurringRunDate: extra.recurringRunDate ?? null,
        createdById: userId,
        lines: { create: lineRows(lines) }
      },
      select: { id: true }
    });
    await this.audit.write({ companyId, userId, area: "sales", action: "CREATE_DRAFT", entityType: "FinInvoice", entityId: created.id, summary: `Created a draft invoice for ${contact.name}`, after: { total: pesewasToDecimal(totals.total), lines: lines.length }, ...meta }, db);
    return this.get(companyId, created.id, db);
  }

  async updateDraft(companyId: string, userId: string, id: string, dto: UpdateInvoiceDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await this.requireDraft(tx, companyId, id);
      const contactId = dto.contactId ?? inv.contactId;
      const contact = await this.requireCustomer(tx, companyId, contactId);
      const issueDate = dto.issueDate ? parseDay(dto.issueDate) : inv.issueDate;
      const dueDate = dto.dueDate ? parseDay(dto.dueDate) : dto.issueDate || dto.contactId ? addDays(issueDate, contact.paymentTermsDays) : inv.dueDate;
      if (dueDate.getTime() < issueDate.getTime()) throw new BadRequestException("The due date cannot be before the invoice date.");
      const data: Prisma.FinInvoiceUncheckedUpdateInput = { contactId, issueDate, dueDate, updatedById: userId };
      if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
      if (dto.terms !== undefined) data.terms = dto.terms?.trim() || null;
      // Re-price when the lines were sent, or when the date moved (the tax rate in force may differ).
      const stored = dto.lines
        ? null
        : await tx.finInvoiceLine.findMany({ where: { invoiceId: id }, orderBy: { lineNo: "asc" } });
      const source = dto.lines ?? stored!.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), discountPercent: l.discountPercent.toString(), taxCodeId: l.taxCodeId, accountId: l.accountId, isCharge: l.isCharge, itemId: l.itemId }));
      const { lines, totals } = await prepareLines(tx, this.tax, companyId, source, issueDate);
      await tx.finInvoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.finInvoiceLine.createMany({ data: lineRows(lines).map((l) => ({ ...l, invoiceId: id })) });
      Object.assign(data, { subtotal: pesewasToDecimal(totals.subtotal), discountTotal: pesewasToDecimal(totals.discountTotal), taxTotal: pesewasToDecimal(totals.taxTotal), total: pesewasToDecimal(totals.total), balanceDue: pesewasToDecimal(totals.total) });
      await tx.finInvoice.update({ where: { id }, data });
      await this.audit.write({ companyId, userId, area: "sales", action: "UPDATE_DRAFT", entityType: "FinInvoice", entityId: id, summary: `Edited a draft invoice for ${contact.name}`, after: { total: pesewasToDecimal(totals.total) }, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  async deleteDraft(companyId: string, userId: string, id: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await this.requireDraft(tx, companyId, id);
      await tx.finInvoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.finInvoice.delete({ where: { id } });
      await this.audit.write({ companyId, userId, area: "sales", action: "DELETE_DRAFT", entityType: "FinInvoice", entityId: id, summary: `Deleted a draft invoice (total ${money(inv.total)})`, ...meta }, tx);
      return { deleted: true };
    });
  }

  // ─── issuing: the ledger posting ────────────────────────────────────────────

  /**
   * Issues the invoice: numbers it and posts   Dr Receivables, Cr Sales (per line's income account), Cr Tax payable.
   * Everything happens in one transaction: either the invoice is issued AND in the books, or neither.
   */
  async send(companyId: string, userId: string, id: string, meta: RequestMeta, db?: FinDb): Promise<{ id: string; number: string }> {
    if (!db) return this.prisma.$transaction((tx) => this.send(companyId, userId, id, meta, tx));
    // Lock the row so two people pressing "Send" at once cannot issue it twice.
    const locked = await db.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM fin_invoices WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`);
    if (locked.length === 0) throw new NotFoundException("Invoice not found.");
    if (locked[0].status !== "DRAFT") throw new ConflictException("This invoice has already been issued.");

    const inv = await db.finInvoice.findFirstOrThrow({ where: { id, companyId }, include: { lines: { orderBy: { lineNo: "asc" } }, contact: true } });
    if (!inv.contact.isActive) throw new BadRequestException(`${inv.contact.name} is switched off. Switch the customer on, or choose another.`);
    const total = decimalToPesewas(inv.total);
    if (total <= 0) throw new BadRequestException("The invoice total must be above zero before it can be issued.");
    await this.ledger.assertOpenPeriod(companyId, inv.issueDate, db);

    // Group the income by account so the entry stays short however many lines the invoice has.
    const revenue = new Map<string, { line: FinPostLine; net: number }>();
    for (const l of inv.lines) {
      const net = decimalToPesewas(l.lineNet);
      if (net === 0) continue;
      const key = l.accountId ?? "role:sales";
      const entry = revenue.get(key) ?? { line: l.accountId ? { accountId: l.accountId, description: "Sales" } : { role: "sales", description: "Sales" }, net: 0 };
      entry.net += net;
      revenue.set(key, entry);
    }
    const taxTotal = decimalToPesewas(inv.taxTotal);
    const number = await this.numbering.next(companyId, "INVOICE", db, inv.issueDate);
    const entryLines: FinPostLine[] = [
      { role: "receivable", debit: pesewasToDecimal(total), description: `${number} ${inv.contact.name}` },
      ...[...revenue.values()].map((r) => ({ ...r.line, credit: pesewasToDecimal(r.net) })),
      ...(taxTotal > 0 ? [{ role: "tax_payable", credit: pesewasToDecimal(taxTotal), description: "Tax on sales" }] : [])
    ];
    const entry = await this.ledger.post(
      { companyId, userId, entryDate: inv.issueDate, description: `Invoice ${number} - ${inv.contact.name}`, sourceModule: "FIN_INVOICE", sourceId: inv.id, lines: entryLines, meta },
      db
    );
    await db.finInvoice.update({
      where: { id },
      data: { status: "SENT", number, sentAt: new Date(), journalEntryId: entry.id, balanceDue: pesewasToDecimal(total), paymentStatus: "UNPAID", updatedById: userId }
    });
    await this.audit.write({ companyId, userId, area: "sales", action: "SEND", entityType: "FinInvoice", entityId: id, summary: `Issued ${number} to ${inv.contact.name} for ${pesewasToDecimal(total)}`, after: { number, total: pesewasToDecimal(total), journal: entry.reference }, ...meta }, db);
    return { id, number };
  }

  /** Cancels an issued invoice with an exact reversing entry. Refused once money or credit has touched it. */
  async voidInvoice(companyId: string, userId: string, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string; paidAmount: unknown; creditedAmount: unknown }[]>(
        Prisma.sql`SELECT status, paidAmount, creditedAmount FROM fin_invoices WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`
      );
      if (locked.length === 0) throw new NotFoundException("Invoice not found.");
      const row = locked[0];
      if (row.status === "VOID") throw new BadRequestException("This invoice is already void.");
      if (row.status === "DRAFT") throw new BadRequestException("A draft is deleted, not voided.");
      if (decimalToPesewas(row.paidAmount as never) > 0 || decimalToPesewas(row.creditedAmount as never) > 0) {
        throw new BadRequestException("This invoice has payments or credit notes against it. Void those first (receipt, deposit application or credit note), then void the invoice.");
      }
      const inv = await tx.finInvoice.findFirstOrThrow({ where: { id, companyId }, include: { contact: { select: { name: true } } } });
      if (inv.journalEntryId) await this.ledger.reverse(companyId, userId, inv.journalEntryId, `Invoice ${inv.number} voided: ${reason}`, meta, tx);
      await tx.finInvoice.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim(), balanceDue: "0.00", updatedById: userId } });
      await this.audit.write({ companyId, userId, area: "sales", action: "VOID", entityType: "FinInvoice", entityId: id, summary: `Voided ${inv.number} (${inv.contact.name}): ${reason}`.slice(0, 500), ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  // ─── payment counters (used by receipts, deposits and credit notes) ─────────

  /**
   * Moves money onto or off an issued invoice's counters, under a row lock. Positive deltas apply a payment or credit;
   * negative deltas undo one (a voided receipt). The invoice can never be paid beyond its total, nor below zero.
   */
  async adjustBalance(tx: FinDb, companyId: string, invoiceId: string, delta: { paid?: number; credited?: number }) {
    const rows = await tx.$queryRaw<{ status: string; total: unknown; paidAmount: unknown; creditedAmount: unknown }[]>(
      Prisma.sql`SELECT status, total, paidAmount, creditedAmount FROM fin_invoices WHERE id = ${invoiceId} AND companyId = ${companyId} FOR UPDATE`
    );
    if (rows.length === 0) throw new NotFoundException("Invoice not found.");
    const r = rows[0];
    if (r.status !== "SENT") throw new BadRequestException("Only an issued invoice can take payments or credits.");
    const total = decimalToPesewas(r.total as never);
    const paid = decimalToPesewas(r.paidAmount as never) + (delta.paid ?? 0);
    const credited = decimalToPesewas(r.creditedAmount as never) + (delta.credited ?? 0);
    if (paid < 0 || credited < 0) throw new BadRequestException("That would take the invoice's payments below zero.");
    const balance = total - paid - credited;
    if (balance < 0) throw new BadRequestException(`That is more than the invoice still owes (${pesewasToDecimal(total - decimalToPesewas(r.paidAmount as never) - decimalToPesewas(r.creditedAmount as never))}).`);
    const status = balance === 0 ? "PAID" : paid + credited > 0 ? "PARTIAL" : "UNPAID";
    await tx.$executeRaw(
      Prisma.sql`UPDATE fin_invoices SET paidAmount = ${pesewasToDecimal(paid)}, creditedAmount = ${pesewasToDecimal(credited)}, balanceDue = ${pesewasToDecimal(balance)}, paymentStatus = ${status}, updatedAt = NOW(3) WHERE id = ${invoiceId}`
    );
    return { balance, paymentStatus: status };
  }

  // ─── public link ────────────────────────────────────────────────────────────

  /** Turns the public link off, or issues a new one (the old link stops working immediately). */
  async setLink(companyId: string, userId: string, id: string, action: "regenerate" | "disable" | "enable", meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.finInvoice.findFirst({ where: { id, companyId } });
      if (!inv) throw new NotFoundException("Invoice not found.");
      if (inv.status === "DRAFT") throw new BadRequestException("Issue the invoice first; drafts have no public link.");
      const data = action === "regenerate" ? { linkVersion: { increment: 1 }, linkEnabled: true } : { linkEnabled: action === "enable" };
      // The invoice counters are not touched, so the trigger allows this on an issued invoice.
      await tx.finInvoice.update({ where: { id }, data });
      await this.audit.write({ companyId, userId, area: "sales", action: `LINK_${action.toUpperCase()}`, entityType: "FinInvoice", entityId: id, summary: `Public link ${action}d for ${inv.number}`, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private async requireDraft(db: FinDb, companyId: string, id: string) {
    const inv = await db.finInvoice.findFirst({ where: { id, companyId } });
    if (!inv) throw new NotFoundException("Invoice not found.");
    if (inv.status !== "DRAFT") throw new BadRequestException("Only a draft can be changed. To correct an issued invoice, void it or issue a credit note.");
    return inv;
  }

  async requireCustomer(db: FinDb | PrismaService, companyId: string, contactId: string) {
    const c = await db.finContact.findFirst({ where: { id: contactId, companyId } });
    if (!c) throw new BadRequestException("That customer does not exist.");
    if (!c.isCustomer) throw new BadRequestException(`${c.name} is a supplier only. Tick "Customer" on the contact to invoice them.`);
    if (!c.isActive) throw new BadRequestException(`${c.name} is switched off.`);
    return c;
  }
}

// ─── presentation ────────────────────────────────────────────────────────────

type HeaderRow = Prisma.FinInvoiceGetPayload<object>;

export function presentHeader(inv: HeaderRow) {
  return {
    id: inv.id,
    number: inv.number,
    contactId: inv.contactId,
    quoteId: inv.quoteId,
    recurringId: inv.recurringId,
    issueDate: dayString(inv.issueDate),
    dueDate: dayString(inv.dueDate),
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    displayStatus: displayStatus(inv),
    currency: inv.currency,
    subtotal: money(inv.subtotal),
    discountTotal: money(inv.discountTotal),
    taxTotal: money(inv.taxTotal),
    total: money(inv.total),
    paidAmount: money(inv.paidAmount),
    creditedAmount: money(inv.creditedAmount),
    balanceDue: money(inv.balanceDue),
    notes: inv.notes,
    terms: inv.terms,
    sentAt: inv.sentAt,
    voidedAt: inv.voidedAt,
    voidReason: inv.voidReason,
    journalEntryId: inv.journalEntryId,
    linkEnabled: inv.linkEnabled,
    linkVersion: inv.linkVersion,
    createdAt: inv.createdAt
  };
}

export function presentLine(l: { id: string; lineNo: number; itemId: string | null; description: string; quantity: { toString(): string }; unitPrice: { toString(): string }; discountPercent: { toString(): string }; discountAmount: { toString(): string }; taxCodeId: string | null; taxRatePercent: { toString(): string }; accountId: string | null; isCharge: boolean; lineNet: { toString(): string }; lineTax: { toString(): string }; lineTotal: { toString(): string } }) {
  return {
    id: l.id,
    lineNo: l.lineNo,
    itemId: l.itemId,
    description: l.description,
    quantity: Number(l.quantity).toFixed(4),
    unitPrice: money(l.unitPrice),
    discountPercent: Number(l.discountPercent).toFixed(2),
    discountAmount: money(l.discountAmount),
    taxCodeId: l.taxCodeId,
    taxRatePercent: Number(l.taxRatePercent).toFixed(4),
    accountId: l.accountId,
    isCharge: l.isCharge,
    lineNet: money(l.lineNet),
    lineTax: money(l.lineTax),
    lineTotal: money(l.lineTotal)
  };
}

export type { InvoiceWithAll, PreparedLine };
