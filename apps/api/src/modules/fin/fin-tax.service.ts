import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AddTaxRateDto, CreateTaxCodeDto, UpdateTaxCodeDto } from "./dto/fin.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { dayString, parseDay } from "./fin-ledger.service";
import { rateOn, rateToBasisPoints } from "./fin-tax-math";

const NONE_CODE = "NONE";
const EPOCH = new Date("2000-01-01T00:00:00.000Z");

/** "15" -> "15.0000": normalised for the DECIMAL(7,4) column, validated 0-100 with at most 4 decimals. */
function normaliseRate(value: unknown): string {
  const bp = rateToBasisPoints(typeof value === "number" ? String(value) : String(value ?? ""));
  return `${Math.floor(bp / 10_000)}.${String(bp % 10_000).padStart(4, "0")}`;
}

@Injectable()
export class FinTaxService {
  constructor(private readonly prisma: PrismaService, private readonly audit: FinAuditService) {}

  /** A fresh company gets one code, "No tax" at 0%. Real taxes (and their rates) are added by the user, never assumed. */
  async ensureDefaults(companyId: string) {
    const count = await this.prisma.finTaxCode.count({ where: { companyId } });
    if (count > 0) return;
    try {
      await this.prisma.finTaxCode.create({
        data: {
          companyId,
          code: NONE_CODE,
          name: "No tax",
          appliesTo: "BOTH",
          description: "For sales and purchases with no tax",
          rates: { create: { ratePercent: "0.0000", effectiveFrom: EPOCH, note: "Default" } }
        }
      });
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err; // someone else created it at the same moment
    }
  }

  async list(companyId: string) {
    await this.ensureDefaults(companyId);
    const codes = await this.prisma.finTaxCode.findMany({
      where: { companyId },
      orderBy: { code: "asc" },
      include: { rates: { orderBy: { effectiveFrom: "desc" } } }
    });
    const today = parseDay(new Date());
    return codes.map((c) => {
      const current = rateOn(c.rates, today);
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        appliesTo: c.appliesTo,
        isRecoverable: c.isRecoverable,
        isActive: c.isActive,
        description: c.description,
        currentRate: current ? current.ratePercent.toFixed(4) : null,
        rates: c.rates.map((r) => ({ id: r.id, ratePercent: r.ratePercent.toFixed(4), effectiveFrom: dayString(r.effectiveFrom), note: r.note, createdAt: r.createdAt }))
      };
    });
  }

  async create(companyId: string, userId: string, dto: CreateTaxCodeDto, meta: RequestMeta) {
    if (dto.ratePercent === undefined || dto.ratePercent === "") throw new BadRequestException("Enter the tax rate (for example 15 or 2.5).");
    const rate = normaliseRate(dto.ratePercent);
    const from = dto.effectiveFrom ? parseDay(dto.effectiveFrom) : parseDay(new Date());
    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.finTaxCode.findFirst({ where: { companyId, code: dto.code }, select: { id: true } });
      if (dup) throw new ConflictException(`The tax code ${dto.code} already exists.`);
      const created = await tx.finTaxCode.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name.trim(),
          appliesTo: dto.appliesTo ?? "BOTH",
          isRecoverable: dto.isRecoverable ?? false,
          description: dto.description ?? null,
          createdById: userId,
          rates: { create: { ratePercent: rate, effectiveFrom: from, createdById: userId, note: "First rate" } }
        }
      });
      await this.audit.write(
        { companyId, userId, area: "settings", action: "CREATE_TAX_CODE", entityType: "FinTaxCode", entityId: created.id, summary: `Created tax code ${created.code} at ${rate}% from ${dayString(from)}`, after: { code: created.code, name: created.name, appliesTo: created.appliesTo, isRecoverable: created.isRecoverable, ratePercent: rate, effectiveFrom: dayString(from) }, ...meta },
        tx
      );
      return created;
    });
  }

  async update(companyId: string, userId: string, id: string, dto: UpdateTaxCodeDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.finTaxCode.findFirst({ where: { id, companyId } });
      if (!current) throw new NotFoundException("Tax code not found.");
      const updated = await tx.finTaxCode.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedById: userId
        }
      });
      await this.audit.write(
        { companyId, userId, area: "settings", action: "UPDATE_TAX_CODE", entityType: "FinTaxCode", entityId: id, summary: `Updated tax code ${current.code}`, before: { name: current.name, description: current.description, isActive: current.isActive }, after: { name: updated.name, description: updated.description, isActive: updated.isActive }, ...meta },
        tx
      );
      return updated;
    });
  }

  /** Adds a new percentage from a date. History is never edited: a change is a new row that takes over from its date. */
  async addRate(companyId: string, userId: string, id: string, dto: AddTaxRateDto, meta: RequestMeta) {
    const rate = normaliseRate(dto.ratePercent);
    const from = parseDay(dto.effectiveFrom);
    return this.prisma.$transaction(async (tx) => {
      const code = await tx.finTaxCode.findFirst({ where: { id, companyId }, include: { rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } } });
      if (!code) throw new NotFoundException("Tax code not found.");
      const latest = code.rates[0];
      if (latest && from.getTime() <= latest.effectiveFrom.getTime()) {
        throw new BadRequestException(`The new rate must start after the latest one (${dayString(latest.effectiveFrom)}). Past rates are never changed, so earlier documents keep the rate they were issued with.`);
      }
      const row = await tx.finTaxRate.create({ data: { taxCodeId: id, ratePercent: rate, effectiveFrom: from, note: dto.note ?? null, createdById: userId } });
      await this.audit.write(
        { companyId, userId, area: "settings", action: "ADD_TAX_RATE", entityType: "FinTaxCode", entityId: id, summary: `${code.code}: new rate ${rate}% from ${dayString(from)}`, before: latest ? { ratePercent: latest.ratePercent.toFixed(4), effectiveFrom: dayString(latest.effectiveFrom) } : undefined, after: { ratePercent: rate, effectiveFrom: dayString(from) }, ...meta },
        tx
      );
      return row;
    });
  }

  /**
   * For the sales and purchases modules: the code and the percentage in force on a document's date.
   * Refuses an unknown or inactive code and a date before the first rate, so a document can never be taxed by guesswork.
   */
  async resolve(companyId: string, taxCodeId: string, on: Date, db: FinDb | PrismaService = this.prisma) {
    const code = await db.finTaxCode.findFirst({ where: { id: taxCodeId, companyId }, include: { rates: true } });
    if (!code) throw new BadRequestException("That tax code does not exist.");
    if (!code.isActive) throw new BadRequestException(`The tax code ${code.code} is switched off.`);
    const rate = rateOn(code.rates, parseDay(on));
    if (!rate) throw new BadRequestException(`The tax code ${code.code} has no rate for ${dayString(parseDay(on))}.`);
    return { id: code.id, code: code.code, name: code.name, appliesTo: code.appliesTo, isRecoverable: code.isRecoverable, ratePercent: rate.ratePercent.toFixed(4) };
  }
}
