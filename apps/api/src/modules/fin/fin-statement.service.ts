import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal } from "./fin-money";

export type StatementRow = {
  date: string;
  type: "INVOICE" | "RECEIPT" | "CREDIT_NOTE" | "DEPOSIT_APPLIED";
  reference: string;
  description: string;
  debit: string;
  credit: string;
  balance: string;
};

export type Statement = {
  contact: { id: string; code: string; name: string; email: string | null; phone: string | null; address: string[] };
  from: string;
  to: string;
  openingBalance: string;
  closingBalance: string;
  totalDebits: string;
  totalCredits: string;
  rows: StatementRow[];
  /** Customer money held but not yet applied to an invoice, as at the end date. */
  unappliedDeposits: string;
};

type Movement = { date: Date; order: number; type: StatementRow["type"]; reference: string; description: string; amount: number; sign: 1 | -1 };

/** A customer statement: everything that moved what they owe, in date order, with a running balance. */
@Injectable()
export class FinStatementService {
  constructor(private readonly prisma: PrismaService) {}

  async build(companyId: string, contactId: string, fromStr: string, toStr: string): Promise<Statement> {
    const from = parseDay(fromStr);
    const to = parseDay(toStr);
    if (from.getTime() > to.getTime()) throw new BadRequestException("The start date is after the end date.");
    const contact = await this.prisma.finContact.findFirst({ where: { id: contactId, companyId } });
    if (!contact) throw new NotFoundException("Customer not found.");

    const [invoices, receipts, creditNotes, applications, deposits] = await Promise.all([
      this.prisma.finInvoice.findMany({ where: { companyId, contactId, status: "SENT", issueDate: { lte: to } } }),
      this.prisma.finReceipt.findMany({ where: { companyId, contactId, status: "POSTED", receiptDate: { lte: to } } }),
      this.prisma.finCreditNote.findMany({ where: { companyId, contactId, status: "POSTED", creditDate: { lte: to } }, include: { invoice: { select: { number: true } } } }),
      this.prisma.finDepositApplication.findMany({ where: { deposit: { companyId, contactId, status: "POSTED" }, appliedDate: { lte: to } }, include: { deposit: { select: { number: true } }, invoice: { select: { number: true } } } }),
      this.prisma.finCustomerDeposit.findMany({ where: { companyId, contactId, status: "POSTED", depositDate: { lte: to } }, include: { applications: { where: { appliedDate: { lte: to } } } } })
    ]);

    const moves: Movement[] = [];
    for (const i of invoices) moves.push({ date: i.issueDate, order: 0, type: "INVOICE", reference: i.number ?? "", description: `Invoice (due ${dayString(i.dueDate)})`, amount: decimalToPesewas(i.total), sign: 1 });
    for (const r of receipts) moves.push({ date: r.receiptDate, order: 1, type: "RECEIPT", reference: r.number, description: `Payment received${r.reference ? ` (${r.reference})` : ""}`, amount: decimalToPesewas(r.amount), sign: -1 });
    for (const c of creditNotes) {
      const applied = decimalToPesewas(c.appliedToInvoice);
      // Only the part that reduced the invoice moves the balance; any excess became customer credit (shown below).
      if (applied > 0) moves.push({ date: c.creditDate, order: 2, type: "CREDIT_NOTE", reference: c.number, description: `Credit note against ${c.invoice.number}`, amount: applied, sign: -1 });
    }
    for (const a of applications) moves.push({ date: a.appliedDate, order: 3, type: "DEPOSIT_APPLIED", reference: a.deposit.number, description: `Deposit applied to ${a.invoice.number}`, amount: decimalToPesewas(a.amount), sign: -1 });

    moves.sort((x, y) => x.date.getTime() - y.date.getTime() || x.order - y.order || x.reference.localeCompare(y.reference));

    let opening = 0;
    for (const m of moves) if (m.date.getTime() < from.getTime()) opening += m.sign * m.amount;

    let running = opening;
    let debits = 0;
    let credits = 0;
    const rows: StatementRow[] = [];
    for (const m of moves) {
      if (m.date.getTime() < from.getTime()) continue;
      running += m.sign * m.amount;
      if (m.sign === 1) debits += m.amount;
      else credits += m.amount;
      rows.push({
        date: dayString(m.date), type: m.type, reference: m.reference, description: m.description,
        debit: m.sign === 1 ? pesewasToDecimal(m.amount) : "", credit: m.sign === -1 ? pesewasToDecimal(m.amount) : "", balance: pesewasToDecimal(running)
      });
    }

    const unapplied = deposits.reduce((s, d) => s + decimalToPesewas(d.amount) - d.applications.reduce((t, a) => t + decimalToPesewas(a.amount), 0), 0);
    return {
      contact: { id: contact.id, code: contact.code, name: contact.name, email: contact.email, phone: contact.phone, address: [contact.addressLine1, contact.addressLine2, [contact.city, contact.region].filter(Boolean).join(", ")].filter((x): x is string => !!x) },
      from: dayString(from), to: dayString(to), openingBalance: pesewasToDecimal(opening), closingBalance: pesewasToDecimal(running),
      totalDebits: pesewasToDecimal(debits), totalCredits: pesewasToDecimal(credits), rows, unappliedDeposits: pesewasToDecimal(unapplied)
    };
  }
}
