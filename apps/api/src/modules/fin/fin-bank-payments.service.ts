import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BankingListQueryDto, CreateTransferDto, MakePaymentDto } from "./dto/fin-banking.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { FinLedgerService, FinPostLine, dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal, toPesewas } from "./fin-money";
import { FinNumberingService } from "./fin-numbering.service";
import { FinPaymentAccountsService } from "./fin-payment-accounts.service";

const money = (d: { toString(): string } | null | undefined) => (d === null || d === undefined ? "0.00" : pesewasToDecimal(decimalToPesewas(d)));

/** Money paid out directly (no bill) and money moved between our own accounts. Everything posts through the ledger. */
@Injectable()
export class FinBankPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly numbering: FinNumberingService,
    private readonly ledger: FinLedgerService,
    private readonly accounts: FinPaymentAccountsService
  ) {}

  // ─── direct payments ────────────────────────────────────────────────────────

  /** Pay a supplier or payee directly:   Dr the account it is charged to (an expense, say), Cr the payment account it left. */
  async makePayment(companyId: string, userId: string, dto: MakePaymentDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const date = parseDay(dto.paymentDate);
      await this.ledger.assertOpenPeriod(companyId, date, tx);
      const amount = toPesewas(dto.amount, "The amount");
      if (amount <= 0) throw new BadRequestException("Enter an amount above zero.");
      const fromLedger = await this.accounts.resolveLedgerId(tx, companyId, { paymentAccountId: dto.paidFromPaymentAccountId });
      if (fromLedger === dto.debitAccountId) throw new BadRequestException("The payment cannot be charged to the same account the money left.");
      const target = await tx.finAccount.findFirst({ where: { id: dto.debitAccountId, companyId } });
      if (!target) throw new BadRequestException("The account to charge does not exist.");
      if (!target.isPostable || !target.isActive) throw new BadRequestException(`${target.code} ${target.name} cannot be posted to.`);
      if (dto.contactId) {
        const c = await tx.finContact.findFirst({ where: { id: dto.contactId, companyId } });
        if (!c) throw new BadRequestException("That supplier does not exist.");
      }

      const id = randomUUID();
      const number = await this.numbering.next(companyId, "PAYMENT", tx, date);
      const entry = await this.ledger.post(
        {
          companyId, userId, entryDate: date, description: `Payment ${number} - ${dto.payeeName.trim()}`, sourceModule: "FIN_PAYMENT", sourceId: id, meta,
          lines: [{ accountId: dto.debitAccountId, debit: pesewasToDecimal(amount), description: dto.payeeName.trim() }, { accountId: fromLedger, credit: pesewasToDecimal(amount), description: `${number} ${dto.payeeName.trim()}` }]
        },
        tx
      );
      await tx.finPayment.create({
        data: {
          id, companyId, number, contactId: dto.contactId ?? null, payeeName: dto.payeeName.trim(), paymentDate: date, amount: pesewasToDecimal(amount), method: dto.method,
          paidFromAccountId: fromLedger, debitAccountId: dto.debitAccountId, reference: dto.reference?.trim() || null, notes: dto.notes?.trim() || null, journalEntryId: entry.id, createdById: userId
        }
      });
      await this.audit.write({ companyId, userId, area: "banking", action: "PAYMENT", entityType: "FinPayment", entityId: id, summary: `Payment ${number}: ${pesewasToDecimal(amount)} to ${dto.payeeName.trim()}`, after: { amount: pesewasToDecimal(amount), journal: entry.reference }, ...meta }, tx);
      return this.getPayment(companyId, id, tx);
    });
  }

  async voidPayment(companyId: string, userId: string, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM fin_payments WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException("Payment not found.");
      if (locked[0].status !== "POSTED") throw new BadRequestException("This payment is already void.");
      const p = await tx.finPayment.findFirstOrThrow({ where: { id, companyId } });
      if (p.journalEntryId) await this.ledger.reverse(companyId, userId, p.journalEntryId, `Payment ${p.number} voided: ${reason}`, meta, tx);
      await tx.finPayment.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim() } });
      await this.audit.write({ companyId, userId, area: "banking", action: "VOID_PAYMENT", entityType: "FinPayment", entityId: id, summary: `Voided payment ${p.number}: ${reason}`.slice(0, 500), ...meta }, tx);
      return this.getPayment(companyId, id, tx);
    });
  }

  async listPayments(companyId: string, q: BankingListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const ledgerId = q.paymentAccountId ? (await this.prisma.finPaymentAccount.findFirst({ where: { id: q.paymentAccountId, companyId } }))?.ledgerAccountId : undefined;
    const where: Prisma.FinPaymentWhereInput = {
      companyId,
      ...(ledgerId ? { paidFromAccountId: ledgerId } : {}),
      ...(q.from || q.to ? { paymentDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {})
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.finPayment.findMany({ where, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finPayment.count({ where }),
      this.prisma.finPayment.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amount: true } })
    ]);
    return { rows: rows.map(presentPayment), total, page, take, totals: { paid: money(sum._sum.amount) } };
  }

  async getPayment(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const p = await db.finPayment.findFirst({ where: { id, companyId } });
    if (!p) throw new NotFoundException("Payment not found.");
    return presentPayment(p);
  }

  // ─── transfers ──────────────────────────────────────────────────────────────

  /**
   * Moves money between two of our own accounts (MoMo to bank, cash to bank...). An optional charge is taken from the source:
   *   Dr destination account (amount)    Dr Bank charges (charge)    Cr source account (amount + charge)
   */
  async transfer(companyId: string, userId: string, dto: CreateTransferDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const date = parseDay(dto.transferDate);
      await this.ledger.assertOpenPeriod(companyId, date, tx);
      if (dto.fromPaymentAccountId === dto.toPaymentAccountId) throw new BadRequestException("Choose two different accounts.");
      const amount = toPesewas(dto.amount, "The amount");
      const charge = dto.chargeAmount === undefined || dto.chargeAmount === null || dto.chargeAmount === "" ? 0 : toPesewas(dto.chargeAmount, "The charge");
      if (amount <= 0) throw new BadRequestException("Enter an amount above zero.");
      if (charge < 0) throw new BadRequestException("The charge cannot be negative.");
      const fromLedger = await this.accounts.resolveLedgerId(tx, companyId, { paymentAccountId: dto.fromPaymentAccountId });
      const toLedger = await this.accounts.resolveLedgerId(tx, companyId, { paymentAccountId: dto.toPaymentAccountId });

      let chargeAccountId: string | null = null;
      if (charge > 0) {
        chargeAccountId = dto.chargeAccountId ?? (await tx.finAccount.findFirst({ where: { companyId, systemRole: "bank_charges" }, select: { id: true } }))?.id ?? null;
        if (!chargeAccountId) throw new BadRequestException('Choose the account for the transfer charge, or give an account the "Bank and transfer charges" role.');
        const ca = await tx.finAccount.findFirst({ where: { id: chargeAccountId, companyId } });
        if (!ca || !ca.isPostable || !ca.isActive) throw new BadRequestException("The charge account cannot be posted to.");
      }

      const id = randomUUID();
      const number = await this.numbering.next(companyId, "TRANSFER", tx, date);
      const lines: FinPostLine[] = [
        { accountId: toLedger, debit: pesewasToDecimal(amount), description: number },
        ...(charge > 0 ? [{ accountId: chargeAccountId as string, debit: pesewasToDecimal(charge), description: `${number} charge` }] : []),
        { accountId: fromLedger, credit: pesewasToDecimal(amount + charge), description: number }
      ];
      const entry = await this.ledger.post({ companyId, userId, entryDate: date, description: `Transfer ${number}`, sourceModule: "FIN_TRANSFER", sourceId: id, lines, meta }, tx);
      await tx.finTransfer.create({
        data: {
          id, companyId, number, transferDate: date, fromAccountId: fromLedger, toAccountId: toLedger, amount: pesewasToDecimal(amount), chargeAmount: pesewasToDecimal(charge), chargeAccountId,
          reference: dto.reference?.trim() || null, notes: dto.notes?.trim() || null, journalEntryId: entry.id, createdById: userId
        }
      });
      await this.audit.write({ companyId, userId, area: "banking", action: "TRANSFER", entityType: "FinTransfer", entityId: id, summary: `Transfer ${number}: ${pesewasToDecimal(amount)}${charge > 0 ? ` (+${pesewasToDecimal(charge)} charge)` : ""}`, after: { amount: pesewasToDecimal(amount), charge: pesewasToDecimal(charge), journal: entry.reference }, ...meta }, tx);
      return this.getTransfer(companyId, id, tx);
    });
  }

  async voidTransfer(companyId: string, userId: string, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM fin_transfers WHERE id = ${id} AND companyId = ${companyId} FOR UPDATE`);
      if (locked.length === 0) throw new NotFoundException("Transfer not found.");
      if (locked[0].status !== "POSTED") throw new BadRequestException("This transfer is already void.");
      const t = await tx.finTransfer.findFirstOrThrow({ where: { id, companyId } });
      if (t.journalEntryId) await this.ledger.reverse(companyId, userId, t.journalEntryId, `Transfer ${t.number} voided: ${reason}`, meta, tx);
      await tx.finTransfer.update({ where: { id }, data: { status: "VOID", voidedAt: new Date(), voidReason: reason.trim() } });
      await this.audit.write({ companyId, userId, area: "banking", action: "VOID_TRANSFER", entityType: "FinTransfer", entityId: id, summary: `Voided transfer ${t.number}: ${reason}`.slice(0, 500), ...meta }, tx);
      return this.getTransfer(companyId, id, tx);
    });
  }

  async listTransfers(companyId: string, q: BankingListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const ledgerId = q.paymentAccountId ? (await this.prisma.finPaymentAccount.findFirst({ where: { id: q.paymentAccountId, companyId } }))?.ledgerAccountId : undefined;
    const where: Prisma.FinTransferWhereInput = {
      companyId,
      ...(ledgerId ? { OR: [{ fromAccountId: ledgerId }, { toAccountId: ledgerId }] } : {}),
      ...(q.from || q.to ? { transferDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.finTransfer.findMany({ where, orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * take, take }),
      this.prisma.finTransfer.count({ where })
    ]);
    const accounts = await this.prisma.finPaymentAccount.findMany({ where: { companyId }, select: { ledgerAccountId: true, name: true } });
    const nameOf = new Map(accounts.map((a) => [a.ledgerAccountId, a.name]));
    return { rows: rows.map((t) => ({ ...presentTransfer(t), fromName: nameOf.get(t.fromAccountId) ?? "", toName: nameOf.get(t.toAccountId) ?? "" })), total, page, take };
  }

  async getTransfer(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const t = await db.finTransfer.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException("Transfer not found.");
    return presentTransfer(t);
  }
}

type PaymentRow = Prisma.FinPaymentGetPayload<object>;
function presentPayment(p: PaymentRow) {
  return {
    id: p.id, number: p.number, contactId: p.contactId, payeeName: p.payeeName, paymentDate: dayString(p.paymentDate), amount: money(p.amount), method: p.method,
    paidFromAccountId: p.paidFromAccountId, debitAccountId: p.debitAccountId, reference: p.reference, notes: p.notes, status: p.status, voidedAt: p.voidedAt, voidReason: p.voidReason, journalEntryId: p.journalEntryId, createdAt: p.createdAt
  };
}

type TransferRow = Prisma.FinTransferGetPayload<object>;
function presentTransfer(t: TransferRow) {
  return {
    id: t.id, number: t.number, transferDate: dayString(t.transferDate), fromAccountId: t.fromAccountId, toAccountId: t.toAccountId, amount: money(t.amount), chargeAmount: money(t.chargeAmount),
    chargeAccountId: t.chargeAccountId, reference: t.reference, notes: t.notes, status: t.status, voidedAt: t.voidedAt, voidReason: t.voidReason, journalEntryId: t.journalEntryId, createdAt: t.createdAt
  };
}
