import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { FinIntegrationLogStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinAuditService, RequestMeta } from "./fin-audit.service";
import { FinContactsService } from "./fin-contacts.service";
import { FinInvoicesService } from "./fin-invoices.service";
import { dayString } from "./fin-ledger.service";
import { SALES_ORDER_SOURCE, SalesOrderSource, SourceOrder } from "./fin-integration-source";
import { pesewasToDecimal } from "./fin-money";
import { mulDivHalfUp } from "./fin-tax-math";

/**
 * Optional links from other modules into finance. Every link is OFF until someone switches it on, and a link only ever
 * creates DRAFTS: a finance user reviews, edits and posts them. Finance pulls from the other module on a timer (or "Sync now");
 * nothing in the other modules is changed or called, so a finance problem can never block an order.
 * A draft carries its source in externalRef ("SO:<order id>"), unique per company, so one order can only ever make one draft.
 */

export const SALES_ORDER_LINK = "sales_order_to_invoice";

export const FIN_LINKS = [
  {
    key: SALES_ORDER_LINK,
    label: "Draft invoice when a sales order is approved",
    description: "When the Sales module approves an order for release, finance creates a DRAFT invoice with the same customer and lines. Only orders approved after you switch this on are imported.",
    available: true,
    unavailableReason: null as string | null
  },
  {
    key: "goods_received_to_bill",
    label: "Draft bill when goods are received",
    description: "When Procurement receives goods, finance creates a DRAFT supplier bill for review.",
    available: false,
    unavailableReason: "Needs the Purchases part of Finance v2, which is not built yet."
  }
] as const;

const BATCH = 200;
const LOG_NEEDS_MAPPING = "NEEDS_MAPPING" as FinIntegrationLogStatus;

export type SyncResult = { created: number; needsMapping: number; errors: number; cancelled: number; alreadyThere: number };

type UpdateDto = { enabled?: boolean; defaultTaxCodeId?: string | null; defaultAccountId?: string | null; autoCreateContacts?: boolean };

@Injectable()
export class FinIntegrationsService {
  private readonly logger = new Logger(FinIntegrationsService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly contacts: FinContactsService,
    private readonly invoices: FinInvoicesService,
    @Inject(SALES_ORDER_SOURCE) private readonly source: SalesOrderSource
  ) {}

  // ─── settings ───────────────────────────────────────────────────────────────

  async links(companyId: string) {
    const [settings, counts] = await Promise.all([
      this.prisma.finIntegrationSetting.findMany({ where: { companyId } }),
      this.prisma.finIntegrationLog.groupBy({ by: ["linkKey", "status"], where: { companyId }, _count: { _all: true } })
    ]);
    return FIN_LINKS.map((l) => {
      const s = settings.find((x) => x.linkKey === l.key);
      const c: Record<string, number> = {};
      for (const row of counts.filter((x) => x.linkKey === l.key)) c[row.status] = row._count._all;
      return {
        ...l,
        enabled: s?.enabled ?? false,
        enabledAt: s?.enabledAt ?? null,
        defaultTaxCodeId: s?.defaultTaxCodeId ?? null,
        defaultAccountId: s?.defaultAccountId ?? null,
        autoCreateContacts: s?.autoCreateContacts ?? false,
        lastRunAt: s?.lastRunAt ?? null,
        lastRunSummary: s?.lastRunSummary ?? null,
        counts: { created: c.CREATED ?? 0, needsMapping: c.NEEDS_MAPPING ?? 0, errors: c.ERROR ?? 0, cancelled: c.SOURCE_CANCELLED ?? 0 }
      };
    });
  }

  async update(companyId: string, userId: string, key: string, dto: UpdateDto, meta: RequestMeta) {
    const link = FIN_LINKS.find((l) => l.key === key);
    if (!link) throw new NotFoundException("That link does not exist.");
    if (dto.enabled === true && !link.available) throw new BadRequestException(link.unavailableReason ?? "This link is not available yet.");
    if (dto.defaultTaxCodeId) {
      const t = await this.prisma.finTaxCode.findFirst({ where: { id: dto.defaultTaxCodeId, companyId } });
      if (!t || !t.isActive || t.appliesTo === "PURCHASES") throw new BadRequestException("Choose an active tax code that applies to sales.");
    }
    if (dto.defaultAccountId) {
      const a = await this.prisma.finAccount.findFirst({ where: { id: dto.defaultAccountId, companyId } });
      if (!a || a.type !== "REVENUE" || !a.isPostable || !a.isActive) throw new BadRequestException("Choose an active income account that can be posted to.");
    }
    const before = await this.prisma.finIntegrationSetting.findUnique({ where: { companyId_linkKey: { companyId, linkKey: key } } });
    const turningOn = dto.enabled === true && !before?.enabled;
    const data: Prisma.FinIntegrationSettingUncheckedUpdateInput = { updatedById: userId };
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    // Switching on sets the start line to now, every time: orders approved while it was off are never back-filled.
    if (turningOn) data.enabledAt = new Date();
    if (dto.defaultTaxCodeId !== undefined) data.defaultTaxCodeId = dto.defaultTaxCodeId || null;
    if (dto.defaultAccountId !== undefined) data.defaultAccountId = dto.defaultAccountId || null;
    if (dto.autoCreateContacts !== undefined) data.autoCreateContacts = dto.autoCreateContacts;
    await this.prisma.finIntegrationSetting.upsert({
      where: { companyId_linkKey: { companyId, linkKey: key } },
      update: data,
      create: {
        companyId,
        linkKey: key,
        updatedById: userId,
        enabled: dto.enabled === true,
        enabledAt: dto.enabled === true ? new Date() : null,
        defaultTaxCodeId: dto.defaultTaxCodeId || null,
        defaultAccountId: dto.defaultAccountId || null,
        autoCreateContacts: dto.autoCreateContacts === true
      }
    });
    await this.audit.write({
      companyId,
      userId,
      area: "settings",
      action: turningOn ? "LINK_ON" : dto.enabled === false ? "LINK_OFF" : "LINK_SETTINGS",
      entityType: "FinIntegrationSetting",
      entityId: key,
      summary: `${turningOn ? "Switched ON" : dto.enabled === false ? "Switched OFF" : "Changed settings of"} the link: ${link.label}`,
      before: before ? { enabled: before.enabled, autoCreateContacts: before.autoCreateContacts } : { enabled: false },
      after: { enabled: dto.enabled ?? before?.enabled ?? false, autoCreateContacts: dto.autoCreateContacts ?? before?.autoCreateContacts ?? false },
      ...meta
    });
    return (await this.links(companyId)).find((l) => l.key === key)!;
  }

  // ─── the sync ───────────────────────────────────────────────────────────────

  /** Every company with the link switched on. Called by the 5-minute job. Never throws. */
  async syncAll() {
    const rows = await this.prisma.finIntegrationSetting.findMany({ where: { enabled: true, linkKey: SALES_ORDER_LINK }, select: { companyId: true } });
    for (const r of rows) {
      try {
        const res = await this.sync(r.companyId);
        if (res && (res.created || res.errors || res.needsMapping)) this.logger.log(`Sales order link: ${res.created} draft(s) created, ${res.needsMapping} need a customer match, ${res.errors} problem(s).`);
      } catch (err) {
        this.logger.error(`Sales order link failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /** Imports newly approved orders as draft invoices. Safe to run twice at once: the database allows one draft per order. */
  async sync(companyId: string): Promise<SyncResult | null> {
    if (this.running.has(companyId)) return null;
    this.running.add(companyId);
    try {
      const setting = await this.prisma.finIntegrationSetting.findUnique({ where: { companyId_linkKey: { companyId, linkKey: SALES_ORDER_LINK } } });
      if (!setting?.enabled || !setting.enabledAt) return null;
      const result: SyncResult = { created: 0, needsMapping: 0, errors: 0, cancelled: 0, alreadyThere: 0 };

      const handled = await this.prisma.finIntegrationLog.findMany({ where: { companyId, linkKey: SALES_ORDER_LINK, status: { in: ["CREATED", "SOURCE_CANCELLED"] } }, select: { sourceId: true } });
      const orders = await this.source.listConfirmed(companyId, setting.enabledAt, handled.map((h) => h.sourceId), BATCH);
      for (const order of orders) {
        const outcome = await this.importOrder(companyId, setting, order);
        if (outcome === "created") result.created++;
        else if (outcome === "mapping") result.needsMapping++;
        else if (outcome === "error") result.errors++;
        else result.alreadyThere++;
      }
      result.cancelled = await this.flagCancelled(companyId);

      const summary = `${result.created} draft(s) created, ${result.needsMapping} waiting for a customer match, ${result.errors} problem(s), ${result.cancelled} source order(s) cancelled`;
      await this.prisma.finIntegrationSetting.update({ where: { id: setting.id }, data: { lastRunAt: new Date(), lastRunSummary: summary.slice(0, 300) } });
      return result;
    } finally {
      this.running.delete(companyId);
    }
  }

  private async importOrder(companyId: string, setting: { updatedById: string | null; defaultTaxCodeId: string | null; defaultAccountId: string | null; autoCreateContacts: boolean }, o: SourceOrder): Promise<"created" | "mapping" | "error" | "already"> {
    const ref = `SO:${o.id}`;
    const label = `Sales order ${o.orderNumber}`.slice(0, 120);
    const userId = setting.updatedById ?? "system";
    const log = (status: FinIntegrationLogStatus, message: string | null, invoiceId: string | null = null, db: Prisma.TransactionClient | PrismaService = this.prisma) =>
      db.finIntegrationLog.upsert({
        where: { companyId_linkKey_sourceId: { companyId, linkKey: SALES_ORDER_LINK, sourceId: o.id } },
        update: { status, message, invoiceId, sourceLabel: label, sourceCustomerId: o.customerId, sourceCustomerName: o.customerName.slice(0, 200) },
        create: { companyId, linkKey: SALES_ORDER_LINK, sourceId: o.id, sourceLabel: label, sourceCustomerId: o.customerId, sourceCustomerName: o.customerName.slice(0, 200), status, message, invoiceId }
      });

    try {
      const existing = await this.prisma.finInvoice.findFirst({ where: { companyId, externalRef: ref }, select: { id: true } });
      if (existing) {
        await log("CREATED", null, existing.id);
        return "already";
      }

      const lines = o.lines.filter((l) => l.lineTotalPesewas > 0 && Number(l.quantity) > 0);
      if (lines.length === 0) {
        await log("ERROR", "The order has no lines with a quantity and a price, so there is nothing to invoice.");
        return "error";
      }

      let contact = await this.prisma.finContact.findFirst({ where: { companyId, externalRef: `CUST:${o.customerId}`, isCustomer: true, isActive: true }, select: { id: true } });
      if (!contact) {
        if (!setting.autoCreateContacts) {
          await log(LOG_NEEDS_MAPPING, `Match "${o.customerName}" to a finance customer, then press Sync now.`);
          return "mapping";
        }
        const created = await this.contacts.create(
          companyId,
          userId,
          { name: o.customerName.trim().length >= 2 ? o.customerName.trim().slice(0, 160) : `Customer ${o.orderNumber}`, phone: o.customerPhone?.slice(0, 40) || null, email: o.customerEmail && /^\S+@\S+\.\S+$/.test(o.customerEmail) ? o.customerEmail.slice(0, 160) : null, externalRef: `CUST:${o.customerId}`, confirmDuplicate: true },
          {}
        );
        contact = { id: created.id };
      }

      const dto = {
        contactId: contact.id,
        issueDate: dayString(o.orderDate),
        notes: `From ${label}${o.notes ? `: ${o.notes}` : ""}`.slice(0, 1000),
        lines: lines.map((l) => {
          const qty4 = Math.round(Number(l.quantity) * 10_000);
          return {
            description: l.description.slice(0, 300),
            quantity: l.quantity,
            // The order's own price per unit as ordered (per bag, not per kg), to the pesewa.
            unitPrice: pesewasToDecimal(mulDivHalfUp(l.lineTotalPesewas, 10_000, qty4)),
            discountPercent: "0",
            taxCodeId: setting.defaultTaxCodeId,
            accountId: setting.defaultAccountId,
            isCharge: false
          };
        })
      };
      const draft = await this.prisma.$transaction(async (tx) => {
        const d = await this.invoices.createDraft(companyId, userId, dto as never, {}, { externalRef: ref, sourceLabel: label, sourceTotal: pesewasToDecimal(o.totalPesewas) }, tx);
        const tolerance = Math.max(5, lines.length * 2);
        const diff = Math.round(Number(d.total) * 100) - o.totalPesewas;
        await log("CREATED", Math.abs(diff) > tolerance ? `Check this draft: it totals ${d.total} but the order totals ${pesewasToDecimal(o.totalPesewas)} (discount or tax may differ).` : null, d.id, tx);
        return d;
      });
      return draft ? "created" : "error";
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") {
        // Another run made this draft a moment ago. That is exactly what the unique source reference is for.
        const existing = await this.prisma.finInvoice.findFirst({ where: { companyId, externalRef: ref }, select: { id: true } });
        if (existing) await log("CREATED", null, existing.id).catch(() => undefined);
        return "already";
      }
      const message = (err instanceof Error ? err.message : "Unknown problem").slice(0, 480);
      await log("ERROR", message).catch(() => undefined);
      return "error";
    }
  }

  /** A draft whose order was cancelled afterwards is flagged, never deleted for you. */
  private async flagCancelled(companyId: string): Promise<number> {
    const created = await this.prisma.finIntegrationLog.findMany({ where: { companyId, linkKey: SALES_ORDER_LINK, status: "CREATED", invoiceId: { not: null } }, select: { id: true, sourceId: true, invoiceId: true }, take: 500, orderBy: { updatedAt: "asc" } });
    if (created.length === 0) return 0;
    const drafts = await this.prisma.finInvoice.findMany({ where: { id: { in: created.map((c) => c.invoiceId as string) }, status: "DRAFT" }, select: { id: true } });
    const draftIds = new Set(drafts.map((d) => d.id));
    const candidates = created.filter((c) => draftIds.has(c.invoiceId as string));
    if (candidates.length === 0) return 0;
    const statuses = await this.source.statuses(companyId, candidates.map((c) => c.sourceId));
    let n = 0;
    for (const c of candidates) {
      if (statuses.get(c.sourceId) === "CANCELLED") {
        await this.prisma.finIntegrationLog.update({ where: { id: c.id }, data: { status: "SOURCE_CANCELLED", message: "The order was cancelled after this draft was made. Discard the draft, or keep it if it is still wanted." } });
        n++;
      }
    }
    return n;
  }

  // ─── what finance sees ──────────────────────────────────────────────────────

  async incoming(companyId: string, q: { status?: string; page?: number; take?: number }) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinIntegrationLogWhereInput = { companyId, linkKey: SALES_ORDER_LINK, ...(q.status && q.status !== "all" ? { status: q.status as FinIntegrationLogStatus } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.finIntegrationLog.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (page - 1) * take, take }),
      this.prisma.finIntegrationLog.count({ where })
    ]);
    const invs = await this.prisma.finInvoice.findMany({
      where: { id: { in: rows.map((r) => r.invoiceId).filter((x): x is string => !!x) } },
      select: { id: true, number: true, status: true, total: true, sourceTotal: true, issueDate: true, contact: { select: { name: true } } }
    });
    const byId = new Map(invs.map((i) => [i.id, i]));
    return {
      rows: rows.map((r) => {
        const inv = r.invoiceId ? byId.get(r.invoiceId) : undefined;
        return {
          id: r.id,
          sourceId: r.sourceId,
          sourceLabel: r.sourceLabel,
          sourceCustomerId: r.sourceCustomerId,
          sourceCustomerName: r.sourceCustomerName,
          status: r.status,
          message: r.message,
          updatedAt: r.updatedAt,
          invoice: inv ? { id: inv.id, number: inv.number, status: inv.status, total: inv.total.toFixed(2), sourceTotal: inv.sourceTotal === null ? null : inv.sourceTotal.toFixed(2), issueDate: dayString(inv.issueDate), customer: inv.contact.name } : null,
          // What finance still has to do: review a draft, or nothing (posted / void / discarded).
          review: !r.invoiceId ? null : !inv ? "DISCARDED" : inv.status === "DRAFT" ? "TO_REVIEW" : inv.status === "SENT" ? "POSTED" : "VOID"
        };
      }),
      total,
      page,
      take
    };
  }

  /** Teaches the link which finance customer a Sales-module customer is, then imports whatever was waiting. */
  async mapCustomer(companyId: string, userId: string, dto: { sourceCustomerId: string; contactId: string }, meta: RequestMeta) {
    const ref = `CUST:${dto.sourceCustomerId}`;
    const contact = await this.prisma.finContact.findFirst({ where: { id: dto.contactId, companyId } });
    if (!contact || !contact.isCustomer) throw new BadRequestException("Choose a finance customer.");
    const other = await this.prisma.finContact.findFirst({ where: { companyId, externalRef: ref, id: { not: contact.id } } });
    if (other) throw new BadRequestException(`That Sales customer is already matched to ${other.name}.`);
    if (contact.externalRef && contact.externalRef !== ref) throw new BadRequestException(`${contact.name} is already matched to a different record (${contact.externalRef}).`);
    await this.contacts.update(companyId, userId, contact.id, { externalRef: ref }, meta);
    return this.sync(companyId);
  }
}
