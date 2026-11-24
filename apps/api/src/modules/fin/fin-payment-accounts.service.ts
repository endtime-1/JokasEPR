import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePaymentAccountDto, UpdatePaymentAccountDto } from "./dto/fin-banking.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal } from "./fin-money";

const COUNTED: ("POSTED" | "REVERSED")[] = ["POSTED", "REVERSED"];

/** Balance of a ledger account in pesewas (debit positive), optionally up to a date. Drafts never count. */
export async function ledgerBalancePesewas(db: FinDb | PrismaService, companyId: string, ledgerAccountId: string, asOf?: Date): Promise<number> {
  const sums = await db.finJournalLine.aggregate({
    where: { accountId: ledgerAccountId, journalEntry: { companyId, status: { in: COUNTED }, ...(asOf ? { entryDate: { lte: asOf } } : {}) } },
    _sum: { debit: true, credit: true }
  });
  return decimalToPesewas(sums._sum.debit) - decimalToPesewas(sums._sum.credit);
}

/** Cash, bank, mobile money and provider-settlement accounts. Each is linked to exactly one ledger asset account. */
@Injectable()
export class FinPaymentAccountsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: FinAuditService) {}

  async list(companyId: string) {
    const rows = await this.prisma.finPaymentAccount.findMany({ where: { companyId }, include: { ledgerAccount: { select: { id: true, code: true, name: true } } }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
    const out = [];
    for (const r of rows) {
      const balance = await ledgerBalancePesewas(this.prisma, companyId, r.ledgerAccountId);
      const lock = await this.currentLock(this.prisma, companyId, r.id);
      out.push({ ...present(r), balance: pesewasToDecimal(balance), reconciledThrough: lock ? dayString(lock) : null });
    }
    return out;
  }

  async get(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const r = await db.finPaymentAccount.findFirst({ where: { id, companyId }, include: { ledgerAccount: { select: { id: true, code: true, name: true } } } });
    if (!r) throw new NotFoundException("Payment account not found.");
    const lock = await this.currentLock(db, companyId, r.id);
    return { ...present(r), balance: pesewasToDecimal(await ledgerBalancePesewas(db, companyId, r.ledgerAccountId)), reconciledThrough: lock ? dayString(lock) : null };
  }

  /** The latest "reconciled through" date (null = nothing is locked). */
  async currentLock(db: FinDb | PrismaService, companyId: string, paymentAccountId: string): Promise<Date | null> {
    const row = await db.finReconLock.findFirst({ where: { companyId, paymentAccountId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return row?.reconciledThrough ?? null;
  }

  async create(companyId: string, userId: string, dto: CreatePaymentAccountDto, meta: RequestMeta) {
    if (dto.provider && dto.type !== "MOBILE_MONEY") throw new BadRequestException("A mobile money provider only applies to a mobile money account.");
    return this.prisma.$transaction(async (tx) => {
      const ledgerId = await this.chooseLedgerAccount(tx, companyId, userId, dto);
      const created = await tx.finPaymentAccount.create({
        data: {
          companyId, name: dto.name.trim(), type: dto.type, provider: dto.type === "MOBILE_MONEY" ? dto.provider ?? "OTHER" : null,
          bankName: dto.bankName?.trim() || null, accountNumber: dto.accountNumber?.trim() || null, ledgerAccountId: ledgerId, notes: dto.notes?.trim() || null,
          reconcileFrom: dto.reconcileFrom ? parseDay(dto.reconcileFrom) : null, createdById: userId
        }
      });
      await this.audit.write({ companyId, userId, area: "banking", action: "CREATE_ACCOUNT", entityType: "FinPaymentAccount", entityId: created.id, summary: `Created payment account "${created.name}" (${created.type})`, after: { name: created.name, type: created.type, provider: created.provider, ledgerAccountId: ledgerId }, ...meta }, tx);
      return this.get(companyId, created.id, tx);
    });
  }

  async update(companyId: string, userId: string, id: string, dto: UpdatePaymentAccountDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const cur = await tx.finPaymentAccount.findFirst({ where: { id, companyId } });
      if (!cur) throw new NotFoundException("Payment account not found.");
      if (dto.isActive === false && cur.isActive) {
        const bal = await ledgerBalancePesewas(tx, companyId, cur.ledgerAccountId);
        if (bal !== 0) throw new BadRequestException(`This account still holds ${pesewasToDecimal(bal)}. Move the money out before switching it off.`);
      }
      if (dto.reconcileFrom !== undefined && (await tx.finReconLock.count({ where: { companyId, paymentAccountId: id } })) > 0) {
        throw new BadRequestException("This account has been reconciled, so its starting date can no longer change.");
      }
      const updated = await tx.finPaymentAccount.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.bankName !== undefined ? { bankName: dto.bankName?.trim() || null } : {}),
          ...(dto.accountNumber !== undefined ? { accountNumber: dto.accountNumber?.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
          ...(dto.reconcileFrom !== undefined ? { reconcileFrom: dto.reconcileFrom ? parseDay(dto.reconcileFrom) : null } : {}),
          updatedById: userId
        }
      });
      await this.audit.write({ companyId, userId, area: "banking", action: "UPDATE_ACCOUNT", entityType: "FinPaymentAccount", entityId: id, summary: `Updated payment account "${updated.name}"`, before: { name: cur.name, isActive: cur.isActive }, after: { name: updated.name, isActive: updated.isActive }, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  /** Turns "pay into this payment account" or "pay into this ledger account" into a ledger account id (the ledger needs it). */
  async resolveLedgerId(db: FinDb | PrismaService, companyId: string, ids: { paymentAccountId?: string; ledgerAccountId?: string }): Promise<string> {
    if (ids.paymentAccountId) {
      const pa = await db.finPaymentAccount.findFirst({ where: { id: ids.paymentAccountId, companyId } });
      if (!pa) throw new BadRequestException("That payment account does not exist.");
      if (!pa.isActive) throw new BadRequestException(`The payment account "${pa.name}" is switched off.`);
      return pa.ledgerAccountId;
    }
    if (ids.ledgerAccountId) return ids.ledgerAccountId;
    throw new BadRequestException("Choose the payment account the money goes into or comes out of.");
  }

  // ─── choosing the ledger account behind a payment account ───────────────────

  private async chooseLedgerAccount(tx: FinDb, companyId: string, userId: string, dto: CreatePaymentAccountDto): Promise<string> {
    if (dto.ledgerAccountId) {
      const a = await tx.finAccount.findFirst({ where: { id: dto.ledgerAccountId, companyId } });
      if (!a) throw new BadRequestException("That ledger account does not exist.");
      if (a.type !== "ASSET" || !a.isPostable || !a.isActive) throw new BadRequestException(`${a.code} ${a.name} cannot hold money. Choose an active asset account.`);
      if (a.systemRole === "receivable" || a.systemRole?.startsWith("inventory")) throw new BadRequestException(`${a.code} ${a.name} is not a cash or bank account.`);
      const taken = await tx.finPaymentAccount.findFirst({ where: { companyId, ledgerAccountId: a.id }, select: { name: true } });
      if (taken) throw new ConflictException(`${a.code} ${a.name} already belongs to the payment account "${taken.name}".`);
      return a.id;
    }
    if (!dto.createLedgerAccount) throw new BadRequestException("Choose a ledger account, or let the system create one.");

    // A provider settlement account takes over the "online payments clearing" account when there is one free.
    if (dto.type === "PROVIDER") {
      const clearing = await tx.finAccount.findFirst({ where: { companyId, systemRole: "payment_clearing", isActive: true } });
      if (clearing && !(await tx.finPaymentAccount.findFirst({ where: { companyId, ledgerAccountId: clearing.id } }))) return clearing.id;
    }
    const header = await tx.finAccount.findFirst({ where: { companyId, code: "1100", isPostable: false, type: "ASSET" } });
    const used = new Set((await tx.finAccount.findMany({ where: { companyId }, select: { code: true } })).map((a) => a.code));
    let n = 1121;
    while (used.has(String(n)) && n < 1199) n++;
    if (used.has(String(n))) throw new ConflictException("There is no free account code left under Cash and Bank. Choose an existing ledger account.");
    const created = await tx.finAccount.create({
      data: { companyId, code: String(n), name: dto.name.trim(), type: "ASSET", parentId: header?.id ?? null, isPostable: true, description: `Payment account: ${dto.name.trim()}`, createdById: userId }
    });
    return created.id;
  }
}

type PaRow = Awaited<ReturnType<PrismaService["finPaymentAccount"]["findFirstOrThrow"]>> & { ledgerAccount: { id: string; code: string; name: string } };

function present(r: PaRow) {
  return {
    id: r.id, name: r.name, type: r.type, provider: r.provider, bankName: r.bankName, accountNumber: r.accountNumber, isActive: r.isActive, notes: r.notes,
    reconcileFrom: r.reconcileFrom ? dayString(r.reconcileFrom) : null, ledgerAccount: r.ledgerAccount, createdAt: r.createdAt
  };
}
