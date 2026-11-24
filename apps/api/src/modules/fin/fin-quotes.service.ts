import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateQuoteDto, QuoteQueryDto, UpdateQuoteDto } from "./dto/fin-sales.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { FinInvoicesService, presentLine } from "./fin-invoices.service";
import { dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal } from "./fin-money";
import { FinNumberingService } from "./fin-numbering.service";
import { lineRows, prepareLines } from "./fin-sales-lines";
import { addDays } from "./fin-sales-math";
import { FinTaxService } from "./fin-tax.service";

const money = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? "0.00" : pesewasToDecimal(decimalToPesewas(d)));

/** Quotes / estimates. They touch no ledger and reserve no stock; they only become money when converted to an invoice. */
@Injectable()
export class FinQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly numbering: FinNumberingService,
    private readonly invoices: FinInvoicesService,
    private readonly tax: FinTaxService
  ) {}

  async list(companyId: string, q: QuoteQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const search = q.search?.trim();
    const where: Prisma.FinQuoteWhereInput = {
      companyId,
      ...(q.status && q.status !== "all" ? { status: q.status as "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" } : {}),
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.from || q.to ? { issueDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {}),
      ...(search ? { OR: [{ number: { contains: search } }, { contact: { name: { contains: search } } }] } : {})
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.finQuote.findMany({ where, include: { contact: { select: { id: true, code: true, name: true } } }, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finQuote.count({ where }),
      this.prisma.finQuote.aggregate({ where, _sum: { total: true } })
    ]);
    return { rows: rows.map((r) => ({ ...presentQuote(r), contact: r.contact })), total, page, take, totals: { quoted: money(sum._sum.total) } };
  }

  async get(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const q = await db.finQuote.findFirst({ where: { id, companyId }, include: { contact: true, lines: { orderBy: { lineNo: "asc" } } } });
    if (!q) throw new NotFoundException("Quote not found.");
    return { ...presentQuote(q), contact: q.contact, lines: q.lines.map(presentLine) };
  }

  async create(companyId: string, userId: string, dto: CreateQuoteDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await this.invoices.requireCustomer(tx, companyId, dto.contactId);
      const issueDate = parseDay(dto.issueDate);
      const validUntil = dto.validUntil ? parseDay(dto.validUntil) : addDays(issueDate, 30);
      if (validUntil.getTime() < issueDate.getTime()) throw new BadRequestException("The quote cannot expire before its date.");
      const { lines, totals } = await prepareLines(tx, this.tax, companyId, dto.lines, issueDate);
      const created = await tx.finQuote.create({
        data: {
          companyId, contactId: contact.id, issueDate, validUntil, notes: dto.notes?.trim() || null, terms: dto.terms?.trim() || null, createdById: userId,
          subtotal: pesewasToDecimal(totals.subtotal), discountTotal: pesewasToDecimal(totals.discountTotal), taxTotal: pesewasToDecimal(totals.taxTotal), total: pesewasToDecimal(totals.total),
          lines: { create: lineRows(lines) }
        },
        select: { id: true }
      });
      await this.audit.write({ companyId, userId, area: "sales", action: "CREATE_QUOTE", entityType: "FinQuote", entityId: created.id, summary: `Created a quote for ${contact.name}`, after: { total: pesewasToDecimal(totals.total) }, ...meta }, tx);
      return this.get(companyId, created.id, tx);
    });
  }

  async update(companyId: string, userId: string, id: string, dto: UpdateQuoteDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const q = await this.requireDraft(tx, companyId, id);
      const contactId = dto.contactId ?? q.contactId;
      const contact = await this.invoices.requireCustomer(tx, companyId, contactId);
      const issueDate = dto.issueDate ? parseDay(dto.issueDate) : q.issueDate;
      const validUntil = dto.validUntil === null ? null : dto.validUntil ? parseDay(dto.validUntil) : q.validUntil;
      if (validUntil && validUntil.getTime() < issueDate.getTime()) throw new BadRequestException("The quote cannot expire before its date.");
      const stored = dto.lines ? null : await tx.finQuoteLine.findMany({ where: { quoteId: id }, orderBy: { lineNo: "asc" } });
      const source = dto.lines ?? stored!.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), discountPercent: l.discountPercent.toString(), taxCodeId: l.taxCodeId, accountId: l.accountId, isCharge: l.isCharge, itemId: l.itemId }));
      const { lines, totals } = await prepareLines(tx, this.tax, companyId, source, issueDate);
      await tx.finQuoteLine.deleteMany({ where: { quoteId: id } });
      await tx.finQuoteLine.createMany({ data: lineRows(lines).map((l) => ({ ...l, quoteId: id })) });
      await tx.finQuote.update({
        where: { id },
        data: {
          contactId, issueDate, validUntil, updatedById: userId,
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}), ...(dto.terms !== undefined ? { terms: dto.terms?.trim() || null } : {}),
          subtotal: pesewasToDecimal(totals.subtotal), discountTotal: pesewasToDecimal(totals.discountTotal), taxTotal: pesewasToDecimal(totals.taxTotal), total: pesewasToDecimal(totals.total)
        }
      });
      await this.audit.write({ companyId, userId, area: "sales", action: "UPDATE_QUOTE", entityType: "FinQuote", entityId: id, summary: `Edited a quote for ${contact.name}`, after: { total: pesewasToDecimal(totals.total) }, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  async remove(companyId: string, userId: string, id: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireDraft(tx, companyId, id);
      await tx.finQuoteLine.deleteMany({ where: { quoteId: id } });
      await tx.finQuote.delete({ where: { id } });
      await this.audit.write({ companyId, userId, area: "sales", action: "DELETE_QUOTE", entityType: "FinQuote", entityId: id, summary: "Deleted a draft quote", ...meta }, tx);
      return { deleted: true };
    });
  }

  /** Marks the quote as sent to the customer and gives it its number. */
  async send(companyId: string, userId: string, id: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const q = await this.requireDraft(tx, companyId, id);
      const number = await this.numbering.next(companyId, "QUOTE", tx, q.issueDate);
      await tx.finQuote.update({ where: { id }, data: { status: "SENT", number, sentAt: new Date(), updatedById: userId } });
      await this.audit.write({ companyId, userId, area: "sales", action: "SEND_QUOTE", entityType: "FinQuote", entityId: id, summary: `Sent quote ${number}`, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  async respond(companyId: string, userId: string, id: string, outcome: "ACCEPTED" | "DECLINED", meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const q = await tx.finQuote.findFirst({ where: { id, companyId } });
      if (!q) throw new NotFoundException("Quote not found.");
      if (q.status !== "SENT") throw new BadRequestException("Only a quote that has been sent can be accepted or declined.");
      await tx.finQuote.update({ where: { id }, data: { status: outcome, updatedById: userId } });
      await this.audit.write({ companyId, userId, area: "sales", action: outcome === "ACCEPTED" ? "ACCEPT_QUOTE" : "DECLINE_QUOTE", entityType: "FinQuote", entityId: id, summary: `Quote ${q.number} ${outcome.toLowerCase()}`, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  /** One click: copies every line into a new draft invoice, links the two records, and marks the quote accepted. */
  async convertToInvoice(companyId: string, userId: string, id: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string; invoiceId: string | null }[]>(Prisma.sql`SELECT status, invoiceId FROM fin_quotes WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException("Quote not found.");
      if (locked[0].invoiceId) throw new ConflictException("This quote has already been converted to an invoice.");
      if (locked[0].status === "DECLINED" || locked[0].status === "EXPIRED") throw new BadRequestException(`A ${locked[0].status.toLowerCase()} quote cannot be converted.`);
      const q = await tx.finQuote.findFirstOrThrow({ where: { id, companyId }, include: { lines: { orderBy: { lineNo: "asc" } } } });
      const today = parseDay(new Date());
      const invoice = await this.invoices.createDraft(
        companyId,
        userId,
        {
          contactId: q.contactId,
          issueDate: dayString(today),
          notes: q.notes ?? undefined,
          terms: q.terms ?? undefined,
          lines: q.lines.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), discountPercent: l.discountPercent.toString(), taxCodeId: l.taxCodeId, accountId: l.accountId, isCharge: l.isCharge, itemId: l.itemId }))
        },
        meta,
        { quoteId: q.id },
        tx
      );
      await tx.finQuote.update({ where: { id }, data: { status: "ACCEPTED", invoiceId: invoice.id, updatedById: userId } });
      await this.audit.write({ companyId, userId, area: "sales", action: "CONVERT_QUOTE", entityType: "FinQuote", entityId: id, summary: `Converted quote ${q.number ?? "(draft)"} to a draft invoice`, after: { invoiceId: invoice.id }, ...meta }, tx);
      return { quote: await this.get(companyId, id, tx), invoice };
    });
  }

  /** Scheduled: a sent quote past its validity date becomes EXPIRED. Returns how many were expired. */
  async expireDue(today: Date = parseDay(new Date()), companyId?: string): Promise<number> {
    const res = await this.prisma.finQuote.updateMany({ where: { status: "SENT", validUntil: { lt: today }, ...(companyId ? { companyId } : {}) }, data: { status: "EXPIRED" } });
    return res.count;
  }

  private async requireDraft(db: FinDb, companyId: string, id: string) {
    const q = await db.finQuote.findFirst({ where: { id, companyId } });
    if (!q) throw new NotFoundException("Quote not found.");
    if (q.status !== "DRAFT") throw new BadRequestException("Only a draft quote can be changed or deleted.");
    return q;
  }
}

type QuoteRow = Prisma.FinQuoteGetPayload<object>;

function presentQuote(q: QuoteRow) {
  return {
    id: q.id, number: q.number, contactId: q.contactId, issueDate: dayString(q.issueDate), validUntil: q.validUntil ? dayString(q.validUntil) : null, status: q.status, currency: q.currency,
    subtotal: money(q.subtotal), discountTotal: money(q.discountTotal), taxTotal: money(q.taxTotal), total: money(q.total), notes: q.notes, terms: q.terms, invoiceId: q.invoiceId, sentAt: q.sentAt, createdAt: q.createdAt
  };
}
