import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";

/** Document types that get a number sequence. Defaults are created the first time a company needs them. */
export const FIN_DOC_TYPES: Record<string, { label: string; prefix: string; includeYear?: boolean; resetYearly?: boolean }> = {
  INVOICE: { label: "Sales invoice", prefix: "INV" },
  CREDIT_NOTE: { label: "Credit note", prefix: "CN" },
  RECEIPT: { label: "Receipt", prefix: "RCT" },
  QUOTE: { label: "Quote", prefix: "QUO" },
  POS_SALE: { label: "POS sale", prefix: "POS" },
  POS_REFUND: { label: "POS refund", prefix: "RFD" },
  POS_SESSION: { label: "Till session", prefix: "TILL" },
  BILL: { label: "Supplier bill", prefix: "BILL" },
  PAYMENT: { label: "Payment", prefix: "PAY" },
  JOURNAL: { label: "Journal entry", prefix: "JE" },
  // Contact codes run on forever with no year: CUS-0001, SUP-0001.
  CUSTOMER: { label: "Customer code", prefix: "CUS", includeYear: false, resetYearly: false },
  SUPPLIER: { label: "Supplier code", prefix: "SUP", includeYear: false, resetYearly: false },
  DEPOSIT: { label: "Customer deposit", prefix: "DEP" },
  TRANSFER: { label: "Transfer between accounts", prefix: "TRF" }
};

export type SequenceShape = { prefix: string; padding: number; includeYear: boolean };

/** Pure formatter, shared by the live numbering and the settings-page preview. */
export function formatDocNumber(shape: SequenceShape, n: number, year: number): string {
  const parts = [shape.prefix];
  if (shape.includeYear) parts.push(String(year));
  parts.push(String(n).padStart(shape.padding, "0"));
  return parts.join("-");
}

type SeqRow = {
  id: string;
  prefix: string;
  padding: number;
  nextNumber: number;
  includeYear: number | boolean;
  resetYearly: number | boolean;
  lastYear: number | null;
};

@Injectable()
export class FinNumberingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: FinAuditService) {}

  /** Makes sure the company has a row for every document type (idempotent). */
  async ensureDefaults(companyId: string, db: FinDb | PrismaService = this.prisma) {
    for (const [docType, def] of Object.entries(FIN_DOC_TYPES)) {
      await db.finNumberSequence.upsert({
        where: { companyId_docType: { companyId, docType } },
        update: {},
        create: { companyId, docType, prefix: def.prefix, includeYear: def.includeYear ?? true, resetYearly: def.resetYearly ?? true }
      });
    }
  }

  async list(companyId: string) {
    await this.ensureDefaults(companyId);
    const rows = await this.prisma.finNumberSequence.findMany({ where: { companyId }, orderBy: { docType: "asc" } });
    const year = new Date().getUTCFullYear();
    return rows.map((r) => ({
      docType: r.docType,
      label: FIN_DOC_TYPES[r.docType]?.label ?? r.docType,
      prefix: r.prefix,
      padding: r.padding,
      nextNumber: r.nextNumber,
      includeYear: r.includeYear,
      resetYearly: r.resetYearly,
      preview: formatDocNumber(r, this.effectiveNext(r, year), year)
    }));
  }

  private effectiveNext(r: { nextNumber: number; resetYearly: boolean; lastYear: number | null }, year: number) {
    return r.resetYearly && r.lastYear !== null && r.lastYear !== year ? 1 : r.nextNumber;
  }

  async update(
    companyId: string,
    userId: string,
    docType: string,
    dto: { prefix?: string; padding?: number; nextNumber?: number; includeYear?: boolean; resetYearly?: boolean },
    meta: RequestMeta
  ) {
    if (!FIN_DOC_TYPES[docType]) throw new BadRequestException(`Unknown document type ${docType}.`);
    await this.ensureDefaults(companyId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.finNumberSequence.findUniqueOrThrow({ where: { companyId_docType: { companyId, docType } } });
      // A number that has already been handed out must never be handed out again.
      if (dto.nextNumber !== undefined && dto.nextNumber < current.nextNumber) {
        throw new BadRequestException(
          `The next number can only go up (it is ${current.nextNumber} now), so no document number is ever reused.`
        );
      }
      const updated = await tx.finNumberSequence.update({
        where: { id: current.id },
        data: {
          ...(dto.prefix !== undefined ? { prefix: dto.prefix } : {}),
          ...(dto.padding !== undefined ? { padding: dto.padding } : {}),
          ...(dto.nextNumber !== undefined ? { nextNumber: dto.nextNumber } : {}),
          ...(dto.includeYear !== undefined ? { includeYear: dto.includeYear } : {}),
          ...(dto.resetYearly !== undefined ? { resetYearly: dto.resetYearly } : {}),
          updatedById: userId
        }
      });
      await this.audit.write(
        {
          companyId,
          userId,
          area: "settings",
          action: "UPDATE",
          entityType: "FinNumberSequence",
          entityId: updated.id,
          summary: `Changed ${docType} numbering`,
          before: {
            prefix: current.prefix,
            padding: current.padding,
            nextNumber: current.nextNumber,
            includeYear: current.includeYear,
            resetYearly: current.resetYearly
          },
          after: {
            prefix: updated.prefix,
            padding: updated.padding,
            nextNumber: updated.nextNumber,
            includeYear: updated.includeYear,
            resetYearly: updated.resetYearly
          },
          ...meta
        },
        tx
      );
      return updated;
    });
  }

  /**
   * Hands out the next number for a document type. Runs under a row lock inside a
   * transaction, so two simultaneous requests can never receive the same number.
   * Pass the caller's open transaction as `db`: if the document is rolled back, the
   * number goes back with it and no gap is left.
   */
  async next(companyId: string, docType: string, db?: FinDb, on: Date = new Date()): Promise<string> {
    if (!FIN_DOC_TYPES[docType]) throw new BadRequestException(`Unknown document type ${docType}.`);
    if (!db) return this.prisma.$transaction((tx) => this.allocate(tx, companyId, docType, on));
    return this.allocate(db, companyId, docType, on);
  }

  private async allocate(tx: FinDb, companyId: string, docType: string, on: Date): Promise<string> {
    const select = () =>
      tx.$queryRaw<SeqRow[]>(
        Prisma.sql`SELECT id, prefix, padding, nextNumber, includeYear, resetYearly, lastYear FROM fin_number_sequences WHERE companyId = ${companyId} AND docType = ${docType} FOR UPDATE`
      );
    // Normal path: the row exists (it is created with the chart of accounts and with the settings), so a
    // plain locking select is all that is needed. The cheap non-locking existence check comes FIRST: a
    // locking select on a missing row takes gap locks that make simultaneous first callers deadlock.
    const exists = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM fin_number_sequences WHERE companyId = ${companyId} AND docType = ${docType}`);
    if (exists.length === 0) {
      // First ever number of this type for the company: one single-statement INSERT IGNORE.
      const def = FIN_DOC_TYPES[docType];
      await tx.$executeRaw(
        Prisma.sql`INSERT IGNORE INTO fin_number_sequences (id, companyId, docType, prefix, padding, nextNumber, includeYear, resetYearly, updatedAt)
                   VALUES (UUID(), ${companyId}, ${docType}, ${def.prefix}, 4, 1, ${def.includeYear ?? true}, ${def.resetYearly ?? true}, NOW(3))`
      );
    }
    const rows = await select();
    const row = rows[0];
    const year = on.getUTCFullYear();
    const resetYearly = Boolean(Number(row.resetYearly));
    const number = resetYearly && row.lastYear !== null && Number(row.lastYear) !== year ? 1 : Number(row.nextNumber);
    // Plain UPDATE (no Prisma re-read): a row another transaction committed a moment ago is visible to the
    // locking SELECT above but not to the snapshot read Prisma would do after an update().
    await tx.$executeRaw(Prisma.sql`UPDATE fin_number_sequences SET nextNumber = ${number + 1}, lastYear = ${year}, updatedAt = NOW(3) WHERE id = ${row.id}`);
    return formatDocNumber(
      { prefix: row.prefix, padding: Number(row.padding), includeYear: Boolean(Number(row.includeYear)) },
      number,
      year
    );
  }
}
