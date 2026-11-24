import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser, PERMISSIONS } from "@jokas/shared";
import { Prisma, SalesOrderStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../../common/next-ref";
import {
  AttributionBasis,
  CreditedOrder,
  LedgerLineInput,
  LedgerMarketer,
  LedgerOrder,
  LedgerTotals,
  LineResult,
  UnplannedRow,
  addDays,
  attributeOrders,
  buildPlanLedger,
  canCloseWeek,
  classifyBias,
  evaluateLine,
  isLatePlan,
  isMonday,
  isoDate,
  linesNeedingReason,
  mondayOf,
  parseDay,
  round2,
  round4,
  weekElapsedPct,
  weekRange
} from "./marketing-ledger.calc";
import {
  CloseMarketingPlanDto,
  CreateMarketingPlanDto,
  LedgerPriceHintQueryDto,
  LedgerScorecardQueryDto,
  LedgerWeekQueryDto,
  MarketingPlanLineDto,
  MarketingPlanReasonDto,
  SignOffMarketingPlanDto,
  UpdateMarketingPlanDto
} from "./dto/marketing-ledger.dto";

type Ctx = { ipAddress?: string; userAgent?: string };
type PlanRow = Prisma.MarketingPlanGetPayload<{ include: { lines: true } }>;

// What counts as a sale: any order that was not cancelled. (A pending order is
// still a sale the marketer made; drafts never exist in practice.) Egg sales are
// a separate record on purpose and are not part of this ledger.
const COUNTED_STATUSES: SalesOrderStatus[] = ["PENDING_STOCK_APPROVAL", "APPROVED", "FULFILLED"];

// Roles a manager may pick when planning on someone's behalf.
const PLANNER_ROLES = ["Marketer", "Sales Officer", "Sales Manager", "Marketing Manager"];

// A closed week whose sales moved by at least this much since closing is flagged.
const DRIFT_FLAG_GHS = 1;

export type LedgerFlag =
  | "NO_PLAN"
  | "NOT_SUBMITTED"
  | "AWAITING_APPROVAL"
  | "LATE_PLAN"
  | "REVISED"
  | "READY_TO_CLOSE"
  | "AWAITING_SIGN_OFF"
  | "SALES_CHANGED_AFTER_CLOSE";

type OrderRef = { id: string; orderNumber: string; orderDate: string; customerId: string; value: number; basis: AttributionBasis };

// What is frozen onto a plan when its week is closed.
type CloseSnapshot = { version: 1; computedAt: string; totals: LedgerTotals; unplanned: UnplannedRow[]; orders: OrderRef[] };

type WeekContext = {
  weekStart: Date;
  planByMarketer: Map<string, PlanRow>;
  marketerIds: string[];
  marketNames: Map<string, string[]>;
  credited: Map<string, CreditedOrder[]>;
  unattributed: LedgerOrder[];
  totalOrders: number;
  totalValue: number;
  customers: Map<string, { id: string; code: string; name: string; marketId: string | null }>;
  userNames: Map<string, string>;
  unitOf: (productId: string) => string;
};

const orderValue = (o: LedgerOrder) => round2(o.items.reduce((s, i) => s + i.value, 0));
const toRef = (o: CreditedOrder): OrderRef => ({ id: o.id, orderNumber: o.orderNumber, orderDate: o.orderDate.toISOString(), customerId: o.customerId, value: orderValue(o), basis: o.basis });

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// The page-level facts about a plan, with the people's names filled in.
function planSummary(plan: PlanRow, names: Map<string, string>) {
  return {
    id: plan.id,
    planNumber: plan.planNumber,
    weekStart: isoDate(plan.weekStart),
    weekEnd: isoDate(plan.weekEnd),
    status: plan.status,
    notes: plan.notes,
    revision: plan.revision,
    marketerId: plan.marketerId,
    marketerName: names.get(plan.marketerId) ?? "Unknown",
    createdByName: plan.createdById ? names.get(plan.createdById) ?? null : null,
    firstSubmittedAt: plan.firstSubmittedAt,
    submittedAt: plan.submittedAt,
    late: isLatePlan(plan.weekStart, plan.firstSubmittedAt),
    deadline: addDays(plan.weekStart, 1),
    approvedAt: plan.approvedAt,
    approvedByName: plan.approvedById ? names.get(plan.approvedById) ?? null : null,
    returnedAt: plan.returnedAt,
    returnedByName: plan.returnedById ? names.get(plan.returnedById) ?? null : null,
    returnReason: plan.returnReason,
    closedAt: plan.closedAt,
    closedByName: plan.closedById ? names.get(plan.closedById) ?? null : null,
    closingNote: plan.closingNote,
    signedOffAt: plan.signedOffAt,
    signedOffByName: plan.signedOffById ? names.get(plan.signedOffById) ?? null : null,
    signOffNote: plan.signOffNote,
    lineCount: plan.lines.length
  };
}
type PlanSummary = ReturnType<typeof planSummary>;

type WeekRow = {
  marketerId: string;
  marketerName: string;
  markets: string[];
  plan: PlanSummary | null;
  /** What the ledger reports: frozen figures once the week is closed, today's figures until then. */
  totals: LedgerTotals;
  /** Closed weeks only: what the sales records show now, and how far that is from what was reported. */
  liveSoldValue: number | null;
  driftValue: number | null;
  flags: LedgerFlag[];
};

function toInput(line: PlanRow["lines"][number]): LedgerLineInput {
  return {
    id: line.id,
    customerId: line.customerId,
    productId: line.productId,
    plannedQuantity: Number(line.plannedQuantity),
    plannedUnitPrice: Number(line.plannedUnitPrice),
    plannedValue: Number(line.plannedValue)
  };
}

function readSnapshot(value: Prisma.JsonValue | null): CloseSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snap = value as unknown as Partial<CloseSnapshot>;
  return snap.version === 1 && snap.totals && Array.isArray(snap.unplanned) && Array.isArray(snap.orders) ? (snap as CloseSnapshot) : null;
}

@Injectable()
export class MarketingLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // ── Who may do what ───────────────────────────────────────────────────────
  // A manager (market-planning.manage, or full access) sees and acts on everything.
  // Someone who can read but does not plan (auditor, mill manager) sees everything.
  // A marketer (can submit, cannot manage) sees only their own pages of the ledger.
  private canManage(user: AuthenticatedUser): boolean {
    return user.hasGlobalAccess || user.permissions.includes(PERMISSIONS.MARKET_PLANNING_MANAGE);
  }

  private canSubmit(user: AuthenticatedUser): boolean {
    return user.hasGlobalAccess || user.permissions.includes(PERMISSIONS.MARKET_PLANNING_SUBMIT);
  }

  private canViewAll(user: AuthenticatedUser): boolean {
    return this.canManage(user) || (user.permissions.includes(PERMISSIONS.MARKET_PLANNING_READ) && !this.canSubmit(user));
  }

  private branchRestricted(user: AuthenticatedUser): boolean {
    return !user.hasGlobalAccess && user.branchIds.length > 0;
  }

  private assertCanSee(user: AuthenticatedUser, plan: { marketerId: string; branchId: string | null }) {
    // A marketer asking for someone else's page is told it does not exist, not that it is forbidden.
    if (!this.canViewAll(user) && plan.marketerId !== user.id) throw new NotFoundException("Plan was not found.");
    if (plan.branchId && this.branchRestricted(user) && !user.branchIds.includes(plan.branchId)) {
      throw new ForbiddenException("You do not have access to this branch.");
    }
  }

  private canSeePlan(user: AuthenticatedUser, plan: { marketerId: string; branchId: string | null }): boolean {
    try {
      this.assertCanSee(user, plan);
      return true;
    } catch {
      return false;
    }
  }

  private async requirePlan(user: AuthenticatedUser, id: string): Promise<PlanRow> {
    const plan = await this.prisma.marketingPlan.findFirst({ where: { id, companyId: user.companyId }, include: { lines: { orderBy: { createdAt: "asc" } } } });
    if (!plan) throw new NotFoundException("Plan was not found.");
    this.assertCanSee(user, plan);
    return plan;
  }

  // ── Options for the plan form ─────────────────────────────────────────────
  async options(user: AuthenticatedUser) {
    const manage = this.canManage(user);
    const [customers, products, markets, planners] = await Promise.all([
      this.prisma.customer.findMany({
        where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE", ...(this.branchRestricted(user) ? { branchId: { in: user.branchIds } } : {}) },
        select: { id: true, code: true, name: true, marketId: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.product.findMany({
        where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE", type: { not: "RAW_MATERIAL" } },
        select: { id: true, sku: true, name: true, uom: { select: { symbol: true, name: true } } },
        orderBy: { name: "asc" }
      }),
      this.prisma.market.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true, assignedUserId: user.id }, select: { id: true, name: true } }),
      manage
        ? this.prisma.user.findMany({
            where: { companyId: user.companyId, deletedAt: null, status: "ACTIVE", roles: { some: { role: { name: { in: PLANNER_ROLES } } } } },
            select: { id: true, fullName: true },
            orderBy: { fullName: "asc" }
          })
        : Promise.resolve([{ id: user.id, fullName: user.fullName }])
    ]);
    return {
      data: {
        canManage: manage,
        canSubmit: this.canSubmit(user),
        canViewAll: this.canViewAll(user),
        me: { id: user.id, fullName: user.fullName },
        marketers: planners,
        myMarkets: markets,
        customers,
        products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.uom?.symbol || p.uom?.name || "unit" }))
      }
    };
  }

  // What this customer would likely be charged: their last order price for the product, else the price list.
  async priceHint(user: AuthenticatedUser, query: LedgerPriceHintQueryDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: query.customerId, companyId: user.companyId, deletedAt: null }, select: { id: true, customerGroupId: true } });
    if (!customer) throw new NotFoundException("Customer was not found.");
    const last = await this.prisma.salesOrderItem.findFirst({
      where: { companyId: user.companyId, productId: query.productId, salesOrder: { customerId: customer.id, deletedAt: null, status: { in: COUNTED_STATUSES } } },
      orderBy: { salesOrder: { orderDate: "desc" } },
      select: { unitPrice: true }
    });
    if (last) return { data: { unitPrice: Number(last.unitPrice), source: "LAST_ORDER" as const } };

    const now = new Date();
    const listed = await this.prisma.priceList.findFirst({
      where: {
        companyId: user.companyId,
        productId: query.productId,
        status: "ACTIVE",
        deletedAt: null,
        validFrom: { lte: now },
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }, { OR: [{ customerGroupId: null }, ...(customer.customerGroupId ? [{ customerGroupId: customer.customerGroupId }] : [])] }]
      },
      orderBy: [{ customerGroupId: "desc" }, { validFrom: "desc" }],
      select: { unitPrice: true }
    });
    return { data: listed ? { unitPrice: Number(listed.unitPrice), source: "PRICE_LIST" as const } : { unitPrice: 0, source: "NONE" as const } };
  }

  // ── Loading a week ────────────────────────────────────────────────────────
  private resolveWeekStart(input?: string): Date {
    if (!input) return mondayOf(new Date());
    const day = parseDay(input);
    if (!day) throw new BadRequestException("That is not a valid date.");
    return mondayOf(day);
  }

  private async userNames(companyId: string, ids: Array<string | null | undefined>) {
    return new Map([...(await this.userInfo(companyId, ids))].map(([id, u]) => [id, u.fullName]));
  }

  private async userInfo(companyId: string, ids: Array<string | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (!unique.length) return new Map<string, { fullName: string; active: boolean }>();
    const users = await this.prisma.user.findMany({ where: { companyId, id: { in: unique } }, select: { id: true, fullName: true, status: true, deletedAt: true } });
    return new Map(users.map((u) => [u.id, { fullName: u.fullName, active: u.status === "ACTIVE" && !u.deletedAt }]));
  }

  private async lookups(companyId: string, customerIds: string[], productIds: string[]) {
    const [customers, products] = await Promise.all([
      customerIds.length ? this.prisma.customer.findMany({ where: { companyId, id: { in: [...new Set(customerIds)] } }, select: { id: true, code: true, name: true, marketId: true } }) : Promise.resolve([]),
      productIds.length ? this.prisma.product.findMany({ where: { companyId, id: { in: [...new Set(productIds)] } }, select: { id: true, sku: true, name: true, uom: { select: { symbol: true, name: true } } } }) : Promise.resolve([])
    ]);
    return {
      customers: new Map(customers.map((c) => [c.id, c])),
      products: new Map(products.map((p) => [p.id, { id: p.id, sku: p.sku, name: p.name, unit: p.uom?.symbol || p.uom?.name || "unit" }]))
    };
  }

  // One pass over the week: every plan, every counted order, and who each order counts for.
  // The credit is worked out across ALL marketers and ALL branches (never just the viewer's
  // slice) so one marketer's page never disagrees with the company total, and a frozen
  // report is always complete.
  private async loadWeek(user: AuthenticatedUser, weekStart: Date, extraMarketerIds: string[] = []): Promise<WeekContext> {
    const range = weekRange(weekStart);
    const companyId = user.companyId;

    const [plans, markets, roleUsers, orders] = await Promise.all([
      this.prisma.marketingPlan.findMany({ where: { companyId, weekStart }, include: { lines: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
      this.prisma.market.findMany({ where: { companyId, deletedAt: null, isActive: true, assignedUserId: { not: null } }, select: { id: true, name: true, assignedUserId: true } }),
      this.prisma.user.findMany({ where: { companyId, deletedAt: null, status: "ACTIVE", roles: { some: { role: { name: "Marketer" } } } }, select: { id: true } }),
      this.prisma.salesOrder.findMany({
        where: { companyId, deletedAt: null, status: { in: COUNTED_STATUSES }, orderDate: { gte: range.start, lt: range.endExclusive } },
        select: { id: true, orderNumber: true, orderDate: true, customerId: true, salespersonId: true, items: { select: { productId: true, quantity: true, lineTotal: true } } }
      })
    ]);

    const planByMarketer = new Map(plans.map((p) => [p.marketerId, p]));
    const marketIdsByMarketer = new Map<string, Set<string>>();
    const marketNames = new Map<string, string[]>();
    for (const m of markets) {
      const owner = m.assignedUserId as string;
      const owned = marketIdsByMarketer.get(owner) ?? new Set<string>();
      owned.add(m.id);
      marketIdsByMarketer.set(owner, owned);
      pushTo(marketNames, owner, m.name);
    }

    const marketerIds = new Set<string>([...plans.map((p) => p.marketerId), ...markets.map((m) => m.assignedUserId as string), ...roleUsers.map((u) => u.id), ...extraMarketerIds]);

    const ledgerOrders: LedgerOrder[] = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      customerId: o.customerId,
      salespersonId: o.salespersonId,
      items: o.items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), value: Number(i.lineTotal) }))
    }));

    const customerIds = [...ledgerOrders.map((o) => o.customerId), ...plans.flatMap((p) => p.lines.map((l) => l.customerId))];
    const productIds = [...ledgerOrders.flatMap((o) => o.items.map((i) => i.productId)), ...plans.flatMap((p) => p.lines.map((l) => l.productId))];
    const [{ customers, products }, userInfo] = await Promise.all([this.lookups(companyId, customerIds, productIds), this.userInfo(companyId, [...marketerIds])]);
    const userNames = new Map([...userInfo].map(([id, u]) => [id, u.fullName]));

    // A marketer who has left should not keep showing as "no plan" — unless they did file one.
    const roster = [...marketerIds].filter((id) => userInfo.get(id)?.active || planByMarketer.has(id) || extraMarketerIds.includes(id));

    const marketers: LedgerMarketer[] = roster.map((id) => {
      const plan = planByMarketer.get(id);
      return {
        marketerId: id,
        plannedCustomerIds: new Set(plan?.lines.map((l) => l.customerId) ?? []),
        marketIds: marketIdsByMarketer.get(id) ?? new Set<string>(),
        order: plan ? (plan.firstSubmittedAt ?? plan.createdAt).getTime() : Number.MAX_SAFE_INTEGER
      };
    });

    const customerMarket = new Map<string, string | null>([...customers.values()].map((c) => [c.id, c.marketId]));
    const attribution = attributeOrders(ledgerOrders, marketers, customerMarket);

    const credited = new Map<string, CreditedOrder[]>();
    const unattributed: LedgerOrder[] = [];
    for (const order of ledgerOrders) {
      const a = attribution.get(order.id);
      if (!a) {
        unattributed.push(order);
        continue;
      }
      pushTo(credited, a.marketerId, { ...order, basis: a.basis });
    }

    return {
      weekStart,
      planByMarketer,
      marketerIds: roster.sort((a, b) => (userNames.get(a) ?? "").localeCompare(userNames.get(b) ?? "")),
      marketNames,
      credited,
      unattributed,
      totalOrders: ledgerOrders.length,
      totalValue: round2(ledgerOrders.reduce((s, o) => s + orderValue(o), 0)),
      customers,
      userNames,
      unitOf: (productId) => products.get(productId)?.unit ?? "unit"
    };
  }

  private ledgerFor(ctx: WeekContext, marketerId: string) {
    const plan = ctx.planByMarketer.get(marketerId);
    return { plan, ledger: buildPlanLedger((plan?.lines ?? []).map(toInput), ctx.credited.get(marketerId) ?? [], ctx.unitOf) };
  }

  private planFlags(plan: PlanRow | undefined, weekStart: Date, now: Date, driftValue: number | null): LedgerFlag[] {
    const flags: LedgerFlag[] = [];
    const started = now.getTime() >= weekStart.getTime();
    if (!plan) {
      if (started) flags.push("NO_PLAN");
      return flags;
    }
    if (plan.status === "DRAFT" && started) flags.push("NOT_SUBMITTED");
    if (plan.status === "SUBMITTED") flags.push("AWAITING_APPROVAL");
    if (plan.status === "APPROVED" && canCloseWeek(weekStart, now)) flags.push("READY_TO_CLOSE");
    if (plan.status === "CLOSED" && !plan.signedOffAt) flags.push("AWAITING_SIGN_OFF");
    if (isLatePlan(weekStart, plan.firstSubmittedAt)) flags.push("LATE_PLAN");
    if (plan.revision > 0) flags.push("REVISED");
    if (driftValue !== null && Math.abs(driftValue) >= DRIFT_FLAG_GHS) flags.push("SALES_CHANGED_AFTER_CLOSE");
    return flags;
  }

  // ── The week's ledger: one row per marketer ───────────────────────────────
  async week(user: AuthenticatedUser, query: LedgerWeekQueryDto) {
    const weekStart = this.resolveWeekStart(query.weekStart);
    const viewAll = this.canViewAll(user);
    const ctx = await this.loadWeek(user, weekStart, viewAll ? [] : [user.id]);
    const now = new Date();
    const thisWeek = mondayOf(now);

    const rows: WeekRow[] = [];
    for (const marketerId of ctx.marketerIds) {
      if (!viewAll && marketerId !== user.id) continue;
      const { plan, ledger } = this.ledgerFor(ctx, marketerId);
      if (plan && !this.canSeePlan(user, plan)) continue;

      const snapshot = plan?.status === "CLOSED" ? readSnapshot(plan.closeSnapshot) : null;
      const driftValue = snapshot ? round2(ledger.totals.soldValue - snapshot.totals.soldValue) : null;
      rows.push({
        marketerId,
        marketerName: ctx.userNames.get(marketerId) ?? (marketerId === user.id ? user.fullName : "Unknown"),
        markets: ctx.marketNames.get(marketerId) ?? [],
        plan: plan ? planSummary(plan, ctx.userNames) : null,
        totals: snapshot?.totals ?? ledger.totals,
        liveSoldValue: snapshot ? ledger.totals.soldValue : null,
        driftValue,
        flags: this.planFlags(plan, weekStart, now, driftValue)
      });
    }

    const sum = (pick: (r: WeekRow) => number) => round2(rows.reduce((s, r) => s + pick(r), 0));
    const plannedValue = sum((r) => r.totals.plannedValue);
    const soldValue = sum((r) => r.totals.soldValue);

    // Company-wide figures (and the sales nobody could be credited with) are only shown to
    // someone who may see the whole company; a branch-restricted manager sees their rows only.
    const companyWide = viewAll && !this.branchRestricted(user);
    const unattributedValue = round2(ctx.unattributed.reduce((s, o) => s + orderValue(o), 0));
    const byCustomer = new Map<string, number>();
    for (const o of ctx.unattributed) byCustomer.set(o.customerId, (byCustomer.get(o.customerId) ?? 0) + orderValue(o));

    return {
      data: {
        week: {
          start: isoDate(weekStart),
          end: isoDate(weekRange(weekStart).end),
          elapsedPct: weekElapsedPct(weekStart, now),
          isCurrent: weekStart.getTime() === thisWeek.getTime(),
          isOver: now.getTime() >= weekRange(weekStart).endExclusive.getTime(),
          previous: isoDate(addDays(weekStart, -7)),
          next: isoDate(addDays(weekStart, 7))
        },
        scope: viewAll ? ("ALL" as const) : ("OWN" as const),
        summary: viewAll
          ? {
              marketers: rows.length,
              plansFiled: rows.filter((r) => r.plan && r.plan.status !== "DRAFT").length,
              plansClosed: rows.filter((r) => r.plan?.status === "CLOSED").length,
              plannedValue,
              soldValue,
              varianceValue: round2(soldValue - plannedValue),
              attainmentPct: plannedValue > 0 ? Math.round((soldValue / plannedValue) * 1000) / 10 : null,
              totalSalesValue: companyWide ? ctx.totalValue : null,
              totalOrders: companyWide ? ctx.totalOrders : null,
              unattributedValue: companyWide ? unattributedValue : null
            }
          : null,
        rows,
        unattributed: companyWide
          ? {
              value: unattributedValue,
              orders: ctx.unattributed.length,
              customers: [...byCustomer.entries()]
                .map(([customerId, value]) => ({ customerId, name: ctx.customers.get(customerId)?.name ?? "Unknown customer", value: round2(value) }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 10)
            }
          : null
      }
    };
  }

  // ── One page of the ledger ────────────────────────────────────────────────
  async getPlan(user: AuthenticatedUser, id: string) {
    const plan = await this.requirePlan(user, id);
    const now = new Date();
    const ctx = await this.loadWeek(user, plan.weekStart, [plan.marketerId]);
    const live = buildPlanLedger(plan.lines.map(toInput), ctx.credited.get(plan.marketerId) ?? [], ctx.unitOf);
    const snapshot = plan.status === "CLOSED" ? readSnapshot(plan.closeSnapshot) : null;

    const lines: LineResult[] = snapshot ? plan.lines.map((l) => evaluateLine(toInput(l), Number(l.actualQuantity ?? 0), Number(l.actualValue ?? 0))) : live.lines;
    const unplanned: UnplannedRow[] = snapshot ? snapshot.unplanned : live.unplanned;
    const totals: LedgerTotals = snapshot ? snapshot.totals : live.totals;
    const orders: OrderRef[] = snapshot ? snapshot.orders : (ctx.credited.get(plan.marketerId) ?? []).map(toRef);

    const { customers, products } = await this.lookups(
      user.companyId,
      [...lines.map((l) => l.customerId), ...unplanned.map((u) => u.customerId), ...orders.map((o) => o.customerId)],
      [...lines.map((l) => l.productId), ...unplanned.map((u) => u.productId)]
    );
    const names = await this.userNames(user.companyId, [plan.marketerId, plan.createdById, plan.approvedById, plan.returnedById, plan.closedById, plan.signedOffById]);
    const lineById = new Map(plan.lines.map((l) => [l.id, l]));
    const customerName = (customerId: string) => customers.get(customerId)?.name ?? "Unknown customer";
    const productName = (productId: string) => products.get(productId)?.name ?? "Unknown product";
    const unit = (productId: string) => products.get(productId)?.unit ?? "unit";

    const isOwner = plan.marketerId === user.id;
    const manage = this.canManage(user);
    const submit = this.canSubmit(user);
    const closable = canCloseWeek(plan.weekStart, now);

    return {
      data: {
        plan: planSummary(plan, names),
        week: {
          start: isoDate(plan.weekStart),
          end: isoDate(plan.weekEnd),
          elapsedPct: weekElapsedPct(plan.weekStart, now),
          canCloseNow: closable
        },
        lines: lines
          .map((l) => ({
            ...l,
            customerName: customerName(l.customerId),
            customerCode: customers.get(l.customerId)?.code ?? "",
            productName: productName(l.productId),
            productSku: products.get(l.productId)?.sku ?? "",
            unit: unit(l.productId),
            note: lineById.get(l.id)?.note ?? null,
            missReason: lineById.get(l.id)?.missReason ?? null
          }))
          .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.productName.localeCompare(b.productName)),
        unplanned: unplanned.map((u) => ({ ...u, customerName: customerName(u.customerId), productName: productName(u.productId), unit: unit(u.productId) })),
        totals,
        // After close: what the system would say today, so a changed order is visible.
        live: snapshot ? { soldValue: live.totals.soldValue, driftValue: round2(live.totals.soldValue - snapshot.totals.soldValue) } : null,
        orders: orders.map((o) => ({ ...o, customerName: customerName(o.customerId) })),
        // Lines that will need an explanation when the week is closed.
        needReason: plan.status === "APPROVED" ? linesNeedingReason(lines) : [],
        actions: {
          canEdit: plan.status === "DRAFT" && submit && (isOwner || manage),
          canSubmit: plan.status === "DRAFT" && submit && (isOwner || manage) && plan.lines.length > 0,
          canDelete: plan.status === "DRAFT" && (manage || (isOwner && !plan.firstSubmittedAt)),
          canApprove: plan.status === "SUBMITTED" && manage && user.id !== plan.marketerId && user.id !== plan.createdById,
          canReturn: (plan.status === "SUBMITTED" || plan.status === "APPROVED") && manage && user.id !== plan.marketerId,
          canClose: plan.status === "APPROVED" && closable && (isOwner || manage),
          // The marketer must explain their shortfalls; a manager closing for them need not.
          mustExplain: isOwner,
          canSignOff: plan.status === "CLOSED" && !plan.signedOffAt && manage && user.id !== plan.marketerId
        }
      }
    };
  }

  // ── Scorecard: how each marketer has done over recent weeks ───────────────
  async scorecard(user: AuthenticatedUser, query: LedgerScorecardQueryDto) {
    const n = query.weeks ?? 8;
    const viewAll = this.canViewAll(user);
    const now = new Date();
    const thisWeek = mondayOf(now);
    const weekStarts = Array.from({ length: n }, (_, i) => addDays(thisWeek, -7 * (n - 1 - i)));

    const allPlans = await this.prisma.marketingPlan.findMany({
      where: { companyId: user.companyId, weekStart: { gte: weekStarts[0], lte: thisWeek }, ...(viewAll ? {} : { marketerId: user.id }) },
      include: { lines: true }
    });
    const plans = allPlans.filter((p) => this.canSeePlan(user, p));

    // Weeks that still need today's numbers: a plan that is in play but not yet frozen.
    const liveWeeks = [...new Set(plans.filter((p) => p.status === "SUBMITTED" || p.status === "APPROVED").map((p) => isoDate(p.weekStart)))];
    const liveTotals = new Map<string, LedgerTotals>();
    for (const w of liveWeeks) {
      const ctx = await this.loadWeek(user, parseDay(w) as Date);
      for (const p of plans.filter((x) => isoDate(x.weekStart) === w && (x.status === "SUBMITTED" || x.status === "APPROVED"))) {
        liveTotals.set(p.id, this.ledgerFor(ctx, p.marketerId).ledger.totals);
      }
    }

    // Everyone expected to plan (the Marketer role, anyone with a market) plus anyone who filed in the range.
    const assigned = await this.prisma.market.findMany({ where: { companyId: user.companyId, deletedAt: null, isActive: true, assignedUserId: { not: null } }, select: { assignedUserId: true } });
    const roster = await this.prisma.user.findMany({
      where: {
        companyId: user.companyId,
        deletedAt: null,
        ...(viewAll ? {} : { id: user.id }),
        OR: [
          { status: "ACTIVE", roles: { some: { role: { name: "Marketer" } } } },
          { status: "ACTIVE", id: { in: assigned.map((m) => m.assignedUserId as string) } },
          { id: { in: [...new Set(plans.map((p) => p.marketerId))] } }
        ]
      },
      select: { id: true, fullName: true }
    });

    const rows = roster
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map((m) => {
        const cells = weekStarts.map((ws) => {
          const plan = plans.find((p) => p.marketerId === m.id && p.weekStart.getTime() === ws.getTime());
          if (!plan) return null;
          const snap = plan.status === "CLOSED" ? readSnapshot(plan.closeSnapshot) : null;
          const totals = snap?.totals ?? liveTotals.get(plan.id) ?? null;
          const weekOver = now.getTime() >= weekRange(ws).endExclusive.getTime();
          return {
            weekStart: isoDate(ws),
            planId: plan.id,
            status: plan.status,
            late: isLatePlan(plan.weekStart, plan.firstSubmittedAt),
            plannedValue: totals?.plannedValue ?? round2(plan.lines.reduce((s, l) => s + Number(l.plannedValue), 0)),
            soldValue: totals?.soldValue ?? null,
            attainmentPct: totals?.attainmentPct ?? null,
            accuracyPct: totals?.accuracyPct ?? null,
            hitRatePct: totals?.hitRatePct ?? null,
            // Only finished weeks feed the averages; the week still running would drag them down unfairly.
            counts: totals !== null && weekOver
          };
        });
        const scored = cells.filter((c): c is NonNullable<typeof c> => !!c && c.counts);
        const avg = (pick: (c: (typeof scored)[number]) => number | null) => {
          const v = scored.map(pick).filter((x): x is number => x !== null);
          return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
        };
        const filed = cells.filter((c) => c && c.status !== "DRAFT");
        return {
          marketerId: m.id,
          marketerName: m.fullName,
          cells,
          summary: {
            weeks: n,
            plansFiled: filed.length,
            onTime: filed.filter((c) => c && !c.late).length,
            closed: cells.filter((c) => c?.status === "CLOSED").length,
            avgAttainmentPct: avg((c) => c.attainmentPct),
            avgAccuracyPct: avg((c) => c.accuracyPct),
            avgHitRatePct: avg((c) => c.hitRatePct),
            bias: classifyBias(scored.map((c) => c.attainmentPct).filter((x): x is number => x !== null))
          }
        };
      });

    return { data: { weeks: weekStarts.map(isoDate), scope: viewAll ? ("ALL" as const) : ("OWN" as const), rows } };
  }

  // ── Writing the plan ──────────────────────────────────────────────────────
  private requireMonday(value: string): Date {
    const day = parseDay(value);
    if (!day) throw new BadRequestException("That is not a valid date.");
    if (!isMonday(day)) throw new BadRequestException("A weekly plan runs Monday to Sunday — pick the Monday that starts the week.");
    return day;
  }

  private async validateLines(user: AuthenticatedUser, lines: MarketingPlanLineDto[]) {
    const seen = new Set<string>();
    for (const l of lines) {
      const key = `${l.customerId}|${l.productId}`;
      if (seen.has(key)) throw new BadRequestException("The same customer and product appear twice. Combine them into one line.");
      seen.add(key);
    }
    const customerIds = [...new Set(lines.map((l) => l.customerId))];
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const [customers, products] = await Promise.all([
      this.prisma.customer.findMany({
        where: { companyId: user.companyId, id: { in: customerIds }, deletedAt: null, status: "ACTIVE", ...(this.branchRestricted(user) ? { branchId: { in: user.branchIds } } : {}) },
        select: { id: true }
      }),
      this.prisma.product.findMany({ where: { companyId: user.companyId, id: { in: productIds }, deletedAt: null, status: "ACTIVE", type: { not: "RAW_MATERIAL" } }, select: { id: true } })
    ]);
    if (customers.length !== customerIds.length) throw new BadRequestException("One or more customers were not found, or are inactive or on hold.");
    if (products.length !== productIds.length) throw new BadRequestException("One or more products were not found or are not sellable.");

    return lines.map((l) => ({
      companyId: user.companyId,
      customerId: l.customerId,
      productId: l.productId,
      plannedQuantity: l.plannedQuantity,
      plannedUnitPrice: l.plannedUnitPrice,
      plannedValue: round4(l.plannedQuantity * l.plannedUnitPrice),
      note: l.note?.trim() || null
    }));
  }

  async createPlan(user: AuthenticatedUser, dto: CreateMarketingPlanDto, context: Ctx) {
    const weekStart = this.requireMonday(dto.weekStart);
    const manage = this.canManage(user);
    const marketerId = dto.marketerId ?? user.id;
    if (marketerId !== user.id && !manage) throw new ForbiddenException("You can only plan for yourself.");

    const marketer = await this.prisma.user.findFirst({ where: { id: marketerId, companyId: user.companyId, deletedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true } });
    if (!marketer) throw new BadRequestException("That marketer was not found or is not active.");

    // A marketer plans the week that is running or one coming up. Writing a plan for a week that
    // is already over would defeat the point of a plan, so only a manager may backfill one
    // (and it shows as late).
    if (!manage) {
      const thisWeek = mondayOf(new Date());
      if (weekStart.getTime() < thisWeek.getTime()) throw new BadRequestException("You can only plan the current week or a week ahead.");
      if (weekStart.getTime() > addDays(thisWeek, 28).getTime()) throw new BadRequestException("Plans can be made at most four weeks ahead.");
    }

    const existing = await this.prisma.marketingPlan.findFirst({ where: { companyId: user.companyId, marketerId, weekStart }, select: { planNumber: true } });
    if (existing) throw new BadRequestException(`${marketer.fullName} already has plan ${existing.planNumber} for that week. Open it instead of creating another.`);

    const lines = await this.validateLines(user, dto.lines);
    const market = await this.prisma.market.findFirst({ where: { companyId: user.companyId, assignedUserId: marketerId, isActive: true, deletedAt: null, branchId: { not: null } }, select: { branchId: true } });
    const planNumber = await nextRef(this.prisma, user.companyId, "ML");

    let plan: PlanRow;
    try {
      plan = await this.prisma.marketingPlan.create({
        data: {
          companyId: user.companyId,
          branchId: market?.branchId ?? null,
          marketerId,
          planNumber,
          weekStart,
          weekEnd: addDays(weekStart, 6),
          notes: dto.notes?.trim() || null,
          createdById: user.id,
          lines: { create: lines }
        },
        include: { lines: true }
      });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") throw new BadRequestException(`${marketer.fullName} already has a plan for that week.`);
      throw err;
    }
    await this.writeAudit(user, "CREATE", plan, `Created weekly plan ${plan.planNumber} for ${marketer.fullName}, week of ${isoDate(weekStart)} (${lines.length} line(s))`, context);
    return { data: plan };
  }

  async updatePlan(user: AuthenticatedUser, id: string, dto: UpdateMarketingPlanDto, context: Ctx) {
    const plan = await this.requirePlan(user, id);
    this.assertOwnerOrManager(user, plan);
    if (plan.status !== "DRAFT") throw new BadRequestException(`Only a draft can be edited — this plan is ${plan.status.toLowerCase()}. A manager can send it back to draft first.`);
    const lines = await this.validateLines(user, dto.lines);
    const updated = await this.prisma.$transaction(async (tx) => {
      // Guarded on status so a plan submitted a moment ago can't be rewritten underneath the manager reviewing it.
      const guard = await tx.marketingPlan.updateMany({ where: { id, status: "DRAFT" }, data: { notes: dto.notes === undefined ? undefined : dto.notes.trim() || null, updatedById: user.id } });
      if (guard.count === 0) throw new BadRequestException("This plan is no longer a draft, so it can't be edited.");
      await tx.marketingPlanLine.deleteMany({ where: { planId: id } });
      await tx.marketingPlanLine.createMany({ data: lines.map((l) => ({ ...l, planId: id })) });
      return tx.marketingPlan.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    });
    await this.writeAudit(user, "UPDATE", updated, `Edited weekly plan ${updated.planNumber} (${lines.length} line(s))`, context);
    return { data: updated };
  }

  async deletePlan(user: AuthenticatedUser, id: string, context: Ctx) {
    const plan = await this.requirePlan(user, id);
    this.assertOwnerOrManager(user, plan);
    if (plan.status !== "DRAFT") throw new BadRequestException("Only a draft can be deleted. A submitted or approved plan is part of the record.");
    // A plan that was ever put forward stays on the ledger — otherwise a poor plan could simply be erased.
    if (plan.firstSubmittedAt && !this.canManage(user)) throw new ForbiddenException("This plan was already submitted once, so only a manager can delete it.");
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.marketingPlan.findFirst({ where: { id, status: "DRAFT" }, select: { id: true } });
      if (!gone) throw new BadRequestException("This plan is no longer a draft.");
      await tx.marketingPlanLine.deleteMany({ where: { planId: id } });
      await tx.marketingPlan.delete({ where: { id } });
    });
    await this.writeAudit(user, "DELETE", plan, `Deleted draft weekly plan ${plan.planNumber}`, context);
    return { success: true };
  }

  async submitPlan(user: AuthenticatedUser, id: string, context: Ctx) {
    const plan = await this.requirePlan(user, id);
    this.assertOwnerOrManager(user, plan);
    if (plan.status !== "DRAFT") throw new BadRequestException(`This plan is already ${plan.status.toLowerCase()}.`);
    if (!plan.lines.length) throw new BadRequestException("Add at least one customer line before submitting.");
    const now = new Date();
    const advanced = await this.prisma.marketingPlan.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "SUBMITTED", submittedAt: now, firstSubmittedAt: plan.firstSubmittedAt ?? now, returnedAt: null, returnedById: null, returnReason: null, updatedById: user.id }
    });
    if (advanced.count === 0) throw new BadRequestException("This plan was already submitted.");
    await this.writeAudit(user, "UPDATE", plan, `Submitted weekly plan ${plan.planNumber}`, context);
    return { data: await this.prisma.marketingPlan.findUniqueOrThrow({ where: { id }, include: { lines: true } }) };
  }

  async approvePlan(user: AuthenticatedUser, id: string, context: Ctx) {
    const plan = await this.requirePlan(user, id);
    if (!this.canManage(user)) throw new ForbiddenException("Only a manager can approve a plan.");
    // The same rule as market targets and stock adjustments: nobody approves their own work.
    if (user.id === plan.marketerId || user.id === plan.createdById) throw new ForbiddenException("You cannot approve a plan you wrote or own — a different manager must approve it.");
    const advanced = await this.prisma.marketingPlan.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date(), updatedById: user.id }
    });
    if (advanced.count === 0) throw new BadRequestException("Only a submitted plan can be approved.");
    await this.writeAudit(user, "APPROVE", plan, `Approved weekly plan ${plan.planNumber}`, context);
    return { data: await this.prisma.marketingPlan.findUniqueOrThrow({ where: { id }, include: { lines: true } }) };
  }

  // Sends a plan back to draft with a reason. From APPROVED it counts as a revision and is
  // shown on the ledger, so a plan that moved after approval can't change quietly.
  async returnPlan(user: AuthenticatedUser, id: string, dto: MarketingPlanReasonDto, context: Ctx) {
    const plan = await this.requirePlan(user, id);
    if (!this.canManage(user)) throw new ForbiddenException("Only a manager can send a plan back.");
    if (user.id === plan.marketerId) throw new ForbiddenException("You cannot send back your own plan — a different manager must review it.");
    if (plan.status !== "SUBMITTED" && plan.status !== "APPROVED") throw new BadRequestException("Only a submitted or approved plan can be sent back. A closed week is final.");
    const wasApproved = plan.status === "APPROVED";
    const advanced = await this.prisma.marketingPlan.updateMany({
      where: { id, status: plan.status },
      data: {
        status: "DRAFT",
        approvedAt: null,
        approvedById: null,
        submittedAt: null,
        returnedAt: new Date(),
        returnedById: user.id,
        returnReason: dto.reason.trim(),
        ...(wasApproved ? { revision: { increment: 1 } } : {}),
        updatedById: user.id
      }
    });
    if (advanced.count === 0) throw new BadRequestException("This plan changed while you were looking at it — reload and try again.");
    await this.writeAudit(user, "REJECT", plan, `Sent weekly plan ${plan.planNumber} back to draft${wasApproved ? " after approval" : ""}: ${dto.reason.trim()}`, context);
    return { data: await this.prisma.marketingPlan.findUniqueOrThrow({ where: { id }, include: { lines: true } }) };
  }

  // Closing the week files the report: the sales credited to the marketer are set against
  // the plan and frozen onto it. From then on the report says what it said on the day.
  async closePlan(user: AuthenticatedUser, id: string, dto: CloseMarketingPlanDto, context: Ctx) {
    const plan = await this.requirePlan(user, id);
    const isOwner = plan.marketerId === user.id;
    if (!isOwner && !this.canManage(user)) throw new ForbiddenException("Only the marketer or a manager can close this week.");
    if (plan.status === "CLOSED") throw new BadRequestException("This week is already closed.");
    if (plan.status !== "APPROVED") throw new BadRequestException("Only an approved plan can be closed. Submit it and have a manager approve it first.");
    const now = new Date();
    if (!canCloseWeek(plan.weekStart, now)) throw new BadRequestException("The week can be closed from its last day (Sunday).");

    const ctx = await this.loadWeek(user, plan.weekStart, [plan.marketerId]);
    const { ledger } = this.ledgerFor(ctx, plan.marketerId);

    const knownLines = new Set(plan.lines.map((l) => l.id));
    const reasons = new Map<string, string>();
    for (const r of dto.reasons ?? []) {
      if (!knownLines.has(r.lineId)) throw new BadRequestException("A reason was given for a line that is not on this plan.");
      if (r.reason.trim()) reasons.set(r.lineId, r.reason.trim());
    }

    // The marketer explains every line that fell short; a manager closing on their behalf need not.
    if (isOwner) {
      const missing = linesNeedingReason(ledger.lines).filter((lineId) => !reasons.has(lineId));
      if (missing.length) {
        const { customers, products } = await this.lookups(user.companyId, ledger.lines.map((l) => l.customerId), ledger.lines.map((l) => l.productId));
        const labels = ledger.lines.filter((l) => missing.includes(l.id)).map((l) => `${customers.get(l.customerId)?.name ?? "Customer"} – ${products.get(l.productId)?.name ?? "Product"}`);
        throw new BadRequestException(`Give a short reason for each line that fell short of plan: ${labels.join("; ")}.`);
      }
    }

    const snapshot: CloseSnapshot = {
      version: 1,
      computedAt: now.toISOString(),
      totals: ledger.totals,
      unplanned: ledger.unplanned,
      orders: (ctx.credited.get(plan.marketerId) ?? []).map(toRef)
    };

    await this.prisma.$transaction(async (tx) => {
      const advanced = await tx.marketingPlan.updateMany({
        where: { id, status: "APPROVED" },
        data: {
          status: "CLOSED",
          closedAt: now,
          closedById: user.id,
          closingNote: dto.closingNote?.trim() || null,
          closeSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          updatedById: user.id
        }
      });
      if (advanced.count === 0) throw new BadRequestException("This week was already closed.");
      for (const line of ledger.lines) {
        await tx.marketingPlanLine.update({ where: { id: line.id }, data: { actualQuantity: line.actualQuantity, actualValue: line.actualValue, missReason: reasons.get(line.id) ?? null } });
      }
    });
    await this.writeAudit(
      user,
      "UPDATE",
      plan,
      `Closed weekly plan ${plan.planNumber}: planned GHS ${ledger.totals.plannedValue}, sold GHS ${ledger.totals.soldValue}${ledger.totals.attainmentPct !== null ? ` (${ledger.totals.attainmentPct}%)` : ""}`,
      context
    );
    return { data: await this.prisma.marketingPlan.findUniqueOrThrow({ where: { id }, include: { lines: true } }) };
  }

  async signOffPlan(user: AuthenticatedUser, id: string, dto: SignOffMarketingPlanDto, context: Ctx) {
    const plan = await this.requirePlan(user, id);
    if (!this.canManage(user)) throw new ForbiddenException("Only a manager can sign off a week.");
    if (user.id === plan.marketerId) throw new ForbiddenException("You cannot sign off your own week — a different manager must review it.");
    if (plan.status !== "CLOSED") throw new BadRequestException("Only a closed week can be signed off.");
    const advanced = await this.prisma.marketingPlan.updateMany({
      where: { id, status: "CLOSED", signedOffAt: null },
      data: { signedOffAt: new Date(), signedOffById: user.id, signOffNote: dto.note?.trim() || null, updatedById: user.id }
    });
    if (advanced.count === 0) throw new BadRequestException("This week was already signed off.");
    await this.writeAudit(user, "APPROVE", plan, `Signed off weekly plan ${plan.planNumber}${dto.note?.trim() ? `: ${dto.note.trim()}` : ""}`, context);
    return { data: await this.prisma.marketingPlan.findUniqueOrThrow({ where: { id }, include: { lines: true } }) };
  }

  private assertOwnerOrManager(user: AuthenticatedUser, plan: { marketerId: string }) {
    if (plan.marketerId !== user.id && !this.canManage(user)) throw new ForbiddenException("You can only act on your own plan.");
  }

  private async writeAudit(user: AuthenticatedUser, action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT", plan: { id: string; branchId: string | null }, summary: string, context: Ctx) {
    await this.audit.write({
      companyId: user.companyId,
      branchId: plan.branchId ?? undefined,
      actorUserId: user.id,
      action,
      entityType: "MarketingPlan",
      entityId: plan.id,
      summary,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });
  }
}
