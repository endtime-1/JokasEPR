import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RecurringDto, SalesLineDto } from "./dto/fin-sales.dto";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { FinInvoicesService } from "./fin-invoices.service";
import { dayString, parseDay } from "./fin-ledger.service";
import { prepareLines } from "./fin-sales-lines";
import { addDays, nthOccurrence } from "./fin-sales-math";
import { FinTaxService } from "./fin-tax.service";

type StoredLine = { description: string; quantity: string; unitPrice: string; discountPercent: string; taxCodeId: string | null; accountId: string | null; isCharge: boolean };

/** Recurring invoices: a template plus a schedule. A daily job turns each due run into a draft (or issued) invoice, exactly once. */
@Injectable()
export class FinRecurringService {
  private readonly logger = new Logger(FinRecurringService.name);
  /** How many missed runs one job pass will create for a single schedule (the rest follow on the next days). */
  static readonly MAX_CATCH_UP = 4;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly invoices: FinInvoicesService,
    private readonly tax: FinTaxService
  ) {}

  async list(companyId: string) {
    const rows = await this.prisma.finRecurringInvoice.findMany({ where: { companyId }, include: { contact: { select: { id: true, code: true, name: true } } }, orderBy: [{ active: "desc" }, { nextRunDate: "asc" }] });
    return rows.map(present);
  }

  async get(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const r = await db.finRecurringInvoice.findFirst({ where: { id, companyId }, include: { contact: { select: { id: true, code: true, name: true } } } });
    if (!r) throw new NotFoundException("Recurring invoice not found.");
    return present(r);
  }

  async create(companyId: string, userId: string, dto: RecurringDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const contact = await this.invoices.requireCustomer(tx, companyId, dto.contactId);
      const start = parseDay(dto.startDate);
      if (start.getTime() < parseDay(new Date()).getTime()) throw new BadRequestException("Start on today or a future date. Past dates would create a backlog of old invoices.");
      const end = dto.endDate ? parseDay(dto.endDate) : null;
      if (end && end.getTime() < start.getTime()) throw new BadRequestException("The end date cannot be before the start date.");
      // Validate the template now (accounts, tax codes, amounts), so a bad template fails here and not at 6am.
      await prepareLines(tx, this.tax, companyId, dto.lines, start);
      const created = await tx.finRecurringInvoice.create({
        data: {
          companyId, name: dto.name.trim(), contactId: contact.id, frequency: dto.frequency, startDate: start, nextRunDate: start, endDate: end,
          termsDays: dto.termsDays ?? contact.paymentTermsDays, autoSend: dto.autoSend ?? false, notes: dto.notes?.trim() || null, terms: dto.terms?.trim() || null,
          lines: dto.lines.map(normaliseLine) as unknown as Prisma.InputJsonValue, createdById: userId
        }
      });
      await this.audit.write({ companyId, userId, area: "sales", action: "CREATE_RECURRING", entityType: "FinRecurringInvoice", entityId: created.id, summary: `Set up recurring invoice "${created.name}" for ${contact.name} (${dto.frequency.toLowerCase()})`, ...meta }, tx);
      return this.get(companyId, created.id, tx);
    });
  }

  async setActive(companyId: string, userId: string, id: string, active: boolean, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.finRecurringInvoice.findFirst({ where: { id, companyId } });
      if (!r) throw new NotFoundException("Recurring invoice not found.");
      await tx.finRecurringInvoice.update({ where: { id }, data: { active } });
      await this.audit.write({ companyId, userId, area: "sales", action: active ? "RESUME_RECURRING" : "PAUSE_RECURRING", entityType: "FinRecurringInvoice", entityId: id, summary: `${active ? "Resumed" : "Paused"} recurring invoice "${r.name}"`, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  /**
   * The daily job. For every active schedule whose next date has arrived, creates that run's invoice. A unique key on
   * (schedule, run date) makes this safe to run twice. With "auto-send" the invoice is issued straight away; if that fails
   * (for example the books are closed) the invoice is left as a draft for someone to look at.
   */
  async runDue(today: Date = parseDay(new Date()), companyId?: string): Promise<{ created: number; sent: number; failed: number }> {
    const due = await this.prisma.finRecurringInvoice.findMany({ where: { active: true, nextRunDate: { lte: today }, ...(companyId ? { companyId } : {}) }, orderBy: { nextRunDate: "asc" } });
    let created = 0;
    let sent = 0;
    let failed = 0;
    for (const r of due) {
      for (let pass = 0; pass < FinRecurringService.MAX_CATCH_UP; pass++) {
        const current = await this.prisma.finRecurringInvoice.findUnique({ where: { id: r.id } });
        if (!current || !current.active || current.nextRunDate.getTime() > today.getTime()) break;
        try {
          const outcome = await this.runOne(current.id);
          if (outcome.invoiceId) created++;
          if (outcome.sent) sent++;
          if (outcome.failedSend) failed++;
        } catch (err) {
          failed++;
          this.logger.error(`Recurring invoice ${r.id} (${r.name}) failed on ${dayString(current.nextRunDate)}: ${err instanceof Error ? err.message : err}`);
          break; // leave the schedule where it is; it is retried tomorrow
        }
      }
    }
    return { created, sent, failed };
  }

  private async runOne(id: string): Promise<{ invoiceId: string | null; sent: boolean; failedSend: boolean }> {
    const meta = { userAgent: "scheduler" };
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM fin_recurring_invoices WHERE id = ${id} AND active = true FOR UPDATE`);
      if (rows.length === 0) return { invoiceId: null as string | null, autoSend: false, companyId: "", userId: "" };
      const r = await tx.finRecurringInvoice.findUniqueOrThrow({ where: { id } });
      const runDate = r.nextRunDate;
      const userId = r.createdById ?? "scheduler";
      let invoiceId: string | null = null;
      const already = await tx.finInvoice.findFirst({ where: { recurringId: r.id, recurringRunDate: runDate }, select: { id: true } });
      if (!already) {
        const lines = (r.lines as unknown as StoredLine[]).map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxCodeId: l.taxCodeId, accountId: l.accountId, isCharge: l.isCharge }));
        const inv = await this.invoices.createDraft(
          r.companyId, userId,
          { contactId: r.contactId, issueDate: dayString(runDate), dueDate: dayString(addDays(runDate, r.termsDays)), notes: r.notes ?? undefined, terms: r.terms ?? undefined, lines },
          meta, { recurringId: r.id, recurringRunDate: runDate }, tx
        );
        invoiceId = inv.id;
      }
      // Advance the schedule from the START date and the run count, so a monthly invoice on the 31st stays on the month's last day.
      const runCount = r.runCount + 1;
      const next = nthOccurrence(r.startDate, r.frequency, runCount);
      const finished = r.endDate !== null && next.getTime() > r.endDate.getTime();
      await tx.finRecurringInvoice.update({ where: { id }, data: { runCount, lastRunAt: new Date(), nextRunDate: next, ...(finished ? { active: false } : {}) } });
      return { invoiceId, autoSend: r.autoSend, companyId: r.companyId, userId };
    });

    if (!result.invoiceId || !result.autoSend) return { invoiceId: result.invoiceId, sent: false, failedSend: false };
    try {
      await this.invoices.send(result.companyId, result.userId, result.invoiceId, meta);
      return { invoiceId: result.invoiceId, sent: true, failedSend: false };
    } catch (err) {
      this.logger.warn(`Auto-send of recurring invoice ${result.invoiceId} failed, left as a draft: ${err instanceof Error ? err.message : err}`);
      return { invoiceId: result.invoiceId, sent: false, failedSend: true };
    }
  }
}

function normaliseLine(l: SalesLineDto): StoredLine {
  return {
    description: l.description.trim(),
    quantity: String(l.quantity),
    unitPrice: String(l.unitPrice),
    discountPercent: l.discountPercent === null || l.discountPercent === undefined ? "0" : String(l.discountPercent),
    taxCodeId: l.taxCodeId ?? null,
    accountId: l.accountId ?? null,
    isCharge: l.isCharge ?? false
  };
}

type RecurringRow = Prisma.FinRecurringInvoiceGetPayload<{ include: { contact: { select: { id: true; code: true; name: true } } } }>;

function present(r: RecurringRow) {
  return {
    id: r.id, name: r.name, contact: r.contact, frequency: r.frequency, startDate: dayString(r.startDate), nextRunDate: dayString(r.nextRunDate), endDate: r.endDate ? dayString(r.endDate) : null,
    termsDays: r.termsDays, autoSend: r.autoSend, active: r.active, notes: r.notes, terms: r.terms, lines: r.lines, lastRunAt: r.lastRunAt, runCount: r.runCount, createdAt: r.createdAt
  };
}
