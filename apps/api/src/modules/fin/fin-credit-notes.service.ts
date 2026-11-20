import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCreditNoteDto, DocListQueryDto } from "./dto/fin-sales.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { FinInvoicesService, presentLine } from "./fin-invoices.service";
import { FinLedgerService, FinPostLine, dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal } from "./fin-money";
import { FinNumberingService } from "./fin-numbering.service";
import { formatPercent, formatQuantity } from "./fin-sales-lines";
import { parseQuantity } from "./fin-sales-math";
import { mulDivHalfUp, taxOnNet } from "./fin-tax-math";

const money = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? "0.00" : pesewasToDecimal(decimalToPesewas(d)));

/**
 * Credit notes: returns, refunds and corrections against an issued invoice, posted as the opposite of the invoice lines.
 *   Dr Sales (per line), Dr Tax payable        Cr Receivables (the part that reduces what the customer owes)
 *                                              Cr Customer deposits (any excess, when the invoice was already paid)
 */
@Injectable()
export class FinCreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly numbering: FinNumberingService,
    private readonly ledger: FinLedgerService,
    private readonly invoices: FinInvoicesService
  ) {}

  async create(companyId: string, userId: string, dto: CreateCreditNoteDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const creditDate = parseDay(dto.creditDate);
      // Lock the invoice first: its balance decides how much of the credit reduces the debt.
      const locked = await tx.$queryRaw<{ status: string; balanceDue: unknown }[]>(Prisma.sql`SELECT status, balanceDue FROM fin_invoices WHERE id = ${dto.invoiceId} AND companyId = ${companyId} FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException("Invoice not found.");
      if (locked[0].status !== "SENT") throw new BadRequestException("Credit notes can only be raised against an issued invoice.");
      const inv = await tx.finInvoice.findFirstOrThrow({ where: { id: dto.invoiceId, companyId }, include: { lines: true, contact: { select: { id: true, name: true } } } });
      if (creditDate.getTime() < inv.issueDate.getTime()) throw new BadRequestException(`The credit date cannot be before the invoice date (${dayString(inv.issueDate)}).`);
      await this.ledger.assertOpenPeriod(companyId, creditDate, tx);

      const byLine = new Map(inv.lines.map((l) => [l.id, l]));
      const seen = new Set<string>();
      const prepared: {
        invoiceLineId: string; lineNo: number; description: string; q4: number; unitPrice: string; discountPercent: string; discount: number; taxCodeId: string | null; taxRate: string; accountId: string | null; net: number; tax: number; gross: number;
      }[] = [];

      for (let i = 0; i < dto.lines.length; i++) {
        const cl = dto.lines[i];
        const line = byLine.get(cl.invoiceLineId);
        if (!line) throw new BadRequestException(`Line ${i + 1}: that is not a line of this invoice.`);
        if (seen.has(line.id)) throw new BadRequestException(`Line ${i + 1}: the same invoice line is listed twice.`);
        seen.add(line.id);
        const q4 = parseQuantity(cl.quantity, `Line ${i + 1} quantity`);

        // What earlier (non-void) credit notes already took from this line.
        const done = await tx.finCreditNoteLine.aggregate({
          where: { invoiceLineId: line.id, creditNote: { status: "POSTED" } },
          _sum: { quantity: true, lineNet: true, lineTax: true, discountAmount: true }
        });
        const lineQ4 = Math.round(Number(line.quantity) * 10_000);
        const doneQ4 = Math.round(Number(done._sum.quantity ?? 0) * 10_000);
        const leftQ4 = lineQ4 - doneQ4;
        if (q4 > leftQ4) throw new BadRequestException(`Line ${i + 1}: only ${formatQuantity(Math.max(0, leftQ4))} of "${line.description}" is left to credit.`);

        const unit = decimalToPesewas(line.unitPrice);
        const pct = Math.round(Number(line.discountPercent) * 100);
        const leftNet = decimalToPesewas(line.lineNet) - decimalToPesewas(done._sum.lineNet);
        const leftTax = decimalToPesewas(line.lineTax) - decimalToPesewas(done._sum.lineTax);
        const leftDiscount = decimalToPesewas(line.discountAmount) - decimalToPesewas(done._sum.discountAmount);
        let gross: number, discount: number, net: number, tax: number;
        if (q4 === leftQ4) {
          // Crediting everything that is left: take the exact remainder, so rounding never strands a pesewa.
          net = leftNet;
          tax = leftTax;
          discount = leftDiscount;
          gross = net + discount;
        } else {
          gross = mulDivHalfUp(unit, q4, 10_000);
          discount = mulDivHalfUp(gross, pct, 10_000);
          net = Math.min(gross - discount, leftNet);
          tax = Math.min(taxOnNet(net, line.taxRatePercent.toString()), leftTax);
        }
        prepared.push({ invoiceLineId: line.id, lineNo: i + 1, description: line.description, q4, unitPrice: pesewasToDecimal(unit), discountPercent: formatPercent(pct), discount, taxCodeId: line.taxCodeId, taxRate: Number(line.taxRatePercent).toFixed(4), accountId: line.accountId, net, tax, gross });
      }

      const subtotal = prepared.reduce((s, p) => s + p.gross, 0);
      const discountTotal = prepared.reduce((s, p) => s + p.discount, 0);
      const taxTotal = prepared.reduce((s, p) => s + p.tax, 0);
      const total = prepared.reduce((s, p) => s + p.net, 0) + taxTotal;
      if (total <= 0) throw new BadRequestException("The credit note total must be above zero.");

      const balance = decimalToPesewas(locked[0].balanceDue as never);
      const applied = Math.min(total, balance);
      const excess = total - applied;

      const id = randomUUID();
      const number = await this.numbering.next(companyId, "CREDIT_NOTE", tx, creditDate);

      // Dr Sales per account, Dr Tax; Cr Receivables (applied), Cr Customer deposits (excess).
      const revenue = new Map<string, { line: FinPostLine; net: number }>();
      for (const p of prepared) {
        if (p.net === 0) continue;
        const key = p.accountId ?? "role:sales";
        const e = revenue.get(key) ?? { line: p.accountId ? { accountId: p.accountId } : { role: "sales" }, net: 0 };
        e.net += p.net;
        revenue.set(key, e);
      }
      const lines: FinPostLine[] = [
        ...[...revenue.values()].map((r) => ({ ...r.line, debit: pesewasToDecimal(r.net), description: `${number} ${inv.number}` })),
        ...(taxTotal > 0 ? [{ role: "tax_payable", debit: pesewasToDecimal(taxTotal), description: `${number} tax` }] : []),
        ...(applied > 0 ? [{ role: "receivable", credit: pesewasToDecimal(applied), description: `${number} ${inv.contact.name}` }] : []),
        ...(excess > 0 ? [{ role: "customer_credit", credit: pesewasToDecimal(excess), description: `${number} credit for ${inv.contact.name}` }] : [])
      ];
      const entry = await this.ledger.post({ companyId, userId, entryDate: creditDate, description: `Credit note ${number} against ${inv.number} - ${inv.contact.name}`, sourceModule: "FIN_CREDIT_NOTE", sourceId: id, lines, meta }, tx);

      await tx.finCreditNote.create({
        data: {
          id, companyId, number, invoiceId: inv.id, contactId: inv.contactId, creditDate, reason: dto.reason.trim(),
          subtotal: pesewasToDecimal(subtotal), discountTotal: pesewasToDecimal(discountTotal), taxTotal: pesewasToDecimal(taxTotal), total: pesewasToDecimal(total),
          appliedToInvoice: pesewasToDecimal(applied), excessToDeposit: pesewasToDecimal(excess), journalEntryId: entry.id, createdById: userId,
          lines: {
            create: prepared.map((p) => ({
              invoiceLineId: p.invoiceLineId, lineNo: p.lineNo, description: p.description, quantity: formatQuantity(p.q4), unitPrice: p.unitPrice, discountPercent: p.discountPercent,
              discountAmount: pesewasToDecimal(p.discount), taxCodeId: p.taxCodeId, taxRatePercent: p.taxRate, accountId: p.accountId, lineNet: pesewasToDecimal(p.net), lineTax: pesewasToDecimal(p.tax), lineTotal: pesewasToDecimal(p.net + p.tax)
            }))
          }
        }
      });
      if (applied > 0) await this.invoices.adjustBalance(tx, companyId, inv.id, { credited: applied });
      if (excess > 0) {
        const depositNumber = await this.numbering.next(companyId, "DEPOSIT", tx, creditDate);
        await tx.finCustomerDeposit.create({
          data: { companyId, number: depositNumber, contactId: inv.contactId, depositDate: creditDate, amount: pesewasToDecimal(excess), notes: `Credit from ${number} (invoice ${inv.number} was already paid)`, sourceCreditNoteId: id, journalEntryId: entry.id, createdById: userId }
        });
      }
      await this.audit.write({ companyId, userId, area: "sales", action: "CREDIT_NOTE", entityType: "FinCreditNote", entityId: id, summary: `Credit note ${number} against ${inv.number}: ${pesewasToDecimal(total)}`, after: { total: pesewasToDecimal(total), appliedToInvoice: pesewasToDecimal(applied), excessToDeposit: pesewasToDecimal(excess), journal: entry.reference }, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  /** Cancels a credit note: reverses its entry, puts the credit back on the invoice, and cancels any customer credit it created. */
  async voidCreditNote(companyId: string, userId: string, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM fin_credit_notes WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException("Credit note not found.");
      if (locked[0].status !== "POSTED") throw new BadRequestException("This credit note is already void.");
      const cn = await tx.finCreditNote.findFirstOrThrow({ where: { id, companyId }, include: { invoice: { select: { number: true } } } });
      const deposit = await tx.finCustomerDeposit.findFirst({ where: { sourceCreditNoteId: id, companyId, status: "POSTED" } });
      if (deposit && decimalToPesewas(deposit.appliedAmount) > 0) {
        throw new BadRequestException(`${money(deposit.appliedAmount)} of the credit this note created (${deposit.number}) has already been used on invoices. Reverse those applications first.`);
      }
      if (cn.journalEntryId) await this.ledger.reverse(companyId, userId, cn.journalEntryId, `Credit note ${cn.number} voided: ${reason}`, meta, tx);
      const applied = decimalToPesewas(cn.appliedToInvoice);
      if (applied > 0) await this.invoices.adjustBalance(tx, companyId, cn.invoiceId, { credited: -applied });
      if (deposit) await tx.finCustomerDeposit.update({ where: { id: deposit.id }, data: { status: "VOID", voidedAt: new Date(), voidReason: `Credit note ${cn.number} voided` } });
      await tx.finCreditNote.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim() } });
      await this.audit.write({ companyId, userId, area: "sales", action: "VOID_CREDIT_NOTE", entityType: "FinCreditNote", entityId: id, summary: `Voided credit note ${cn.number} (${cn.invoice.number}): ${reason}`.slice(0, 500), ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  async list(companyId: string, q: DocListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinCreditNoteWhereInput = {
      companyId,
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.from || q.to ? { creditDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {})
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.finCreditNote.findMany({ where, include: { invoice: { select: { number: true } } }, orderBy: [{ creditDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finCreditNote.count({ where }),
      this.prisma.finCreditNote.aggregate({ where: { ...where, status: "POSTED" }, _sum: { total: true } })
    ]);
    const contacts = await this.prisma.finContact.findMany({ where: { id: { in: rows.map((r) => r.contactId) } }, select: { id: true, code: true, name: true } });
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return { rows: rows.map((r) => ({ ...present(r), contact: byId.get(r.contactId) ?? null })), total, page, take, totals: { credited: money(sum._sum.total) } };
  }

  async get(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const cn = await db.finCreditNote.findFirst({ where: { id, companyId }, include: { invoice: { select: { number: true } }, lines: { orderBy: { lineNo: "asc" } } } });
    if (!cn) throw new NotFoundException("Credit note not found.");
    const contact = await db.finContact.findFirst({ where: { id: cn.contactId }, select: { id: true, code: true, name: true } });
    return { ...present(cn), contact, lines: cn.lines.map((l) => ({ ...presentLine({ ...l, itemId: null, isCharge: false }), invoiceLineId: l.invoiceLineId })) };
  }
}

type CnRow = Prisma.FinCreditNoteGetPayload<{ include: { invoice: { select: { number: true } } } }>;

function present(c: CnRow) {
  return {
    id: c.id, number: c.number, invoiceId: c.invoiceId, invoiceNumber: c.invoice.number, contactId: c.contactId, creditDate: dayString(c.creditDate), reason: c.reason,
    subtotal: money(c.subtotal), discountTotal: money(c.discountTotal), taxTotal: money(c.taxTotal), total: money(c.total), appliedToInvoice: money(c.appliedToInvoice), excessToDeposit: money(c.excessToDeposit),
    status: c.status, voidedAt: c.voidedAt, voidReason: c.voidReason, journalEntryId: c.journalEntryId, createdAt: c.createdAt
  };
}
