import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthenticatedUser } from "@jokas/shared";
import { MarketingLedgerService } from "./marketing-ledger.service";

jest.mock("../../common/next-ref", () => ({ nextRef: jest.fn().mockResolvedValue("ML-2026-0001") }));

// packages/shared/src holds old compiled permissions.js / index.js next to the .ts files, and this
// jest config looks for .js first, so a plain import of "@jokas/shared" here would load a copy
// from before "market-planning.submit" existed (PERMISSIONS.MARKET_PLANNING_SUBMIT === undefined)
// and a marketer would look like a read-only auditor. Production builds from the .ts, so only the
// tests need pointing at the real file.
jest.mock("@jokas/shared", () => jest.requireActual("../../../../../packages/shared/src/permissions.ts"));

// "Now" is Thursday 12 Nov 2026; the week of 9-15 Nov is running.
const NOW = new Date("2026-11-12T10:00:00.000Z");
const THIS_MONDAY = new Date("2026-11-09T00:00:00.000Z");
const SUNDAY_EVENING = new Date("2026-11-15T18:00:00.000Z");

const ctx = { ipAddress: "1.1.1.1", userAgent: "jest" };

function user(id: string, permissions: string[], extra: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id, companyId: "co", email: `${id}@x.com`, fullName: id.toUpperCase(), roles: [], permissions, branchIds: [], farmIds: [], warehouseIds: [], productionSiteIds: [], hasGlobalAccess: false, ...extra };
}
const MARKETER = ["market-planning.read", "market-planning.submit"];
const MANAGER = ["market-planning.read", "market-planning.submit", "market-planning.manage"];
const ama = user("ama", MARKETER);
const kofi = user("kofi", MARKETER);
const boss = user("boss", MANAGER);
const auditor = user("auditor", ["market-planning.read"]);

type Row = Record<string, unknown>;

function planRow(over: Row = {}, lines: Row[] = []) {
  return {
    id: "plan-1",
    companyId: "co",
    branchId: null,
    marketerId: "ama",
    planNumber: "ML-2026-0001",
    weekStart: THIS_MONDAY,
    weekEnd: new Date("2026-11-15T00:00:00.000Z"),
    status: "DRAFT",
    notes: null,
    revision: 0,
    firstSubmittedAt: null,
    submittedAt: null,
    approvedById: null,
    approvedAt: null,
    returnedById: null,
    returnedAt: null,
    returnReason: null,
    closedById: null,
    closedAt: null,
    closingNote: null,
    signedOffById: null,
    signedOffAt: null,
    signOffNote: null,
    closeSnapshot: null,
    createdById: "ama",
    updatedById: null,
    createdAt: new Date("2026-11-08T09:00:00.000Z"),
    updatedAt: new Date("2026-11-08T09:00:00.000Z"),
    lines,
    ...over
  };
}

function lineRow(id: string, customerId: string, productId: string, qty: number, price: number, over: Row = {}) {
  return { id, companyId: "co", planId: "plan-1", customerId, productId, plannedQuantity: qty, plannedUnitPrice: price, plannedValue: qty * price, note: null, actualQuantity: null, actualValue: null, missReason: null, createdAt: new Date("2026-11-08T09:00:00.000Z"), ...over };
}

function orderRow(id: string, customerId: string, items: Array<[string, number, number]>, salespersonId: string | null = null) {
  return { id, orderNumber: `SO-${id}`, orderDate: new Date("2026-11-10T09:00:00.000Z"), customerId, salespersonId, items: items.map(([productId, quantity, lineTotal]) => ({ productId, quantity, lineTotal })) };
}

// A mock database. `data` is what the week's queries return; each test overrides what it needs.
function makeEnv(data: { plans?: Row[]; orders?: Row[]; markets?: Row[]; marketerUsers?: Row[]; userInfo?: Row[]; customers?: Row[]; products?: Row[] } = {}) {
  const tx = {
    marketingPlan: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), delete: jest.fn() },
    marketingPlanLine: { update: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) }
  };
  const prisma = {
    marketingPlan: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue(data.plans ?? []),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    market: { findMany: jest.fn().mockResolvedValue(data.markets ?? []), findFirst: jest.fn().mockResolvedValue(null) },
    // Two different reads share this table: "who has the Marketer role" and "names/status of these ids".
    user: {
      findMany: jest.fn(async (args: { where: { roles?: unknown } }) => (args.where.roles ? data.marketerUsers ?? [] : data.userInfo ?? [])),
      findFirst: jest.fn()
    },
    salesOrder: { findMany: jest.fn().mockResolvedValue(data.orders ?? []) },
    customer: { findMany: jest.fn().mockResolvedValue(data.customers ?? []) },
    product: { findMany: jest.fn().mockResolvedValue(data.products ?? []) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx))
  };
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const service = new MarketingLedgerService(prisma as never, audit as never);
  return { service, prisma, tx, audit };
}

const people = [
  { id: "ama", fullName: "Ama Mensah", status: "ACTIVE", deletedAt: null },
  { id: "kofi", fullName: "Kofi Boateng", status: "ACTIVE", deletedAt: null },
  { id: "boss", fullName: "Boss Manager", status: "ACTIVE", deletedAt: null }
];
const customers = [
  { id: "c1", code: "C1", name: "Farm One", marketId: "mk-1" },
  { id: "c2", code: "C2", name: "Farm Two", marketId: "mk-1" },
  { id: "c9", code: "C9", name: "Walk-in", marketId: null }
];
const products = [{ id: "feed", sku: "L1C", name: "Layer 1 C", uom: { symbol: "bag", name: "Bag" } }];

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

const newLine = { customerId: "11111111-1111-4111-8111-111111111111", productId: "22222222-2222-4222-8222-222222222222", plannedQuantity: 100, plannedUnitPrice: 250 };

describe("MarketingLedgerService.createPlan", () => {
  function createEnv() {
    const env = makeEnv();
    env.prisma.user.findFirst.mockResolvedValue({ id: "ama", fullName: "Ama Mensah" });
    env.prisma.marketingPlan.findFirst.mockResolvedValue(null);
    env.prisma.customer.findMany.mockResolvedValue([{ id: newLine.customerId }]);
    env.prisma.product.findMany.mockResolvedValue([{ id: newLine.productId }]);
    env.prisma.marketingPlan.create.mockImplementation(async ({ data }: { data: Row }) => ({ ...planRow(), ...data, id: "plan-new", lines: [] }));
    return env;
  }

  it("creates a draft with each line's planned value worked out, and records who did it", async () => {
    const { service, prisma, audit } = createEnv();
    const res = await service.createPlan(ama, { weekStart: "2026-11-09", lines: [newLine] }, ctx);
    const data = prisma.marketingPlan.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ companyId: "co", marketerId: "ama", planNumber: "ML-2026-0001", createdById: "ama" });
    expect(data.weekEnd.toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(data.lines.create[0]).toMatchObject({ plannedQuantity: 100, plannedUnitPrice: 250, plannedValue: 25000 });
    expect(res.data.id).toBe("plan-new");
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "MarketingPlan", actorUserId: "ama" }));
  });

  it("insists on a Monday", async () => {
    const { service } = createEnv();
    await expect(service.createPlan(ama, { weekStart: "2026-11-10", lines: [newLine] }, ctx)).rejects.toThrow(/Monday/);
  });

  it("will not let a marketer plan for someone else", async () => {
    const { service } = createEnv();
    await expect(service.createPlan(ama, { weekStart: "2026-11-09", marketerId: "kofi", lines: [newLine] }, ctx)).rejects.toThrow(ForbiddenException);
  });

  it("will not let a marketer plan a week that is already over, or one too far ahead", async () => {
    const { service } = createEnv();
    await expect(service.createPlan(ama, { weekStart: "2026-11-02", lines: [newLine] }, ctx)).rejects.toThrow(/current week or a week ahead/);
    await expect(service.createPlan(ama, { weekStart: "2026-12-14", lines: [newLine] }, ctx)).rejects.toThrow(/four weeks ahead/);
    await expect(service.createPlan(ama, { weekStart: "2026-12-07", lines: [newLine] }, ctx)).resolves.toBeDefined(); // exactly four weeks ahead is fine
  });

  it("lets a manager plan on a marketer's behalf, even backfilling a past week", async () => {
    const { service, prisma } = createEnv();
    await service.createPlan(boss, { weekStart: "2026-11-02", marketerId: "ama", lines: [newLine] }, ctx);
    expect(prisma.marketingPlan.create.mock.calls[0][0].data).toMatchObject({ marketerId: "ama", createdById: "boss" });
  });

  it("refuses a second plan for the same marketer and week", async () => {
    const { service, prisma } = createEnv();
    prisma.marketingPlan.findFirst.mockResolvedValue({ planNumber: "ML-2026-0007" });
    await expect(service.createPlan(ama, { weekStart: "2026-11-09", lines: [newLine] }, ctx)).rejects.toThrow(/already has plan ML-2026-0007/);
    expect(prisma.marketingPlan.create).not.toHaveBeenCalled();
  });

  it("refuses the same customer and product twice", async () => {
    const { service } = createEnv();
    await expect(service.createPlan(ama, { weekStart: "2026-11-09", lines: [newLine, { ...newLine, plannedQuantity: 5 }] }, ctx)).rejects.toThrow(/appear twice/);
  });

  it("refuses a customer who is inactive, on hold or from another company", async () => {
    const { service, prisma } = createEnv();
    prisma.customer.findMany.mockResolvedValue([]);
    await expect(service.createPlan(ama, { weekStart: "2026-11-09", lines: [newLine] }, ctx)).rejects.toThrow(/customers were not found/);
  });
});

describe("MarketingLedgerService — the approval trail", () => {
  it("lets only the marketer or a manager submit, and only a non-empty draft", async () => {
    const draft = planRow({}, [lineRow("L1", "c1", "feed", 10, 100)]);
    const a = makeEnv();
    a.prisma.marketingPlan.findFirst.mockResolvedValue(draft);
    a.prisma.marketingPlan.findUniqueOrThrow.mockResolvedValue({ ...draft, status: "SUBMITTED" });
    await expect(a.service.submitPlan(kofi, "plan-1", ctx)).rejects.toThrow(NotFoundException); // another marketer can't even see it
    await expect(a.service.submitPlan(ama, "plan-1", ctx)).resolves.toBeDefined();
    const patch = a.prisma.marketingPlan.updateMany.mock.calls[0][0];
    expect(patch.where).toEqual({ id: "plan-1", status: "DRAFT" });
    expect(patch.data).toMatchObject({ status: "SUBMITTED", submittedAt: NOW, firstSubmittedAt: NOW });

    const empty = makeEnv();
    empty.prisma.marketingPlan.findFirst.mockResolvedValue(planRow());
    await expect(empty.service.submitPlan(ama, "plan-1", ctx)).rejects.toThrow(/at least one customer line/);
  });

  it("keeps the first submission time when a returned plan is submitted again", async () => {
    const first = new Date("2026-11-09T08:00:00.000Z");
    const env = makeEnv();
    env.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ firstSubmittedAt: first }, [lineRow("L1", "c1", "feed", 10, 100)]));
    env.prisma.marketingPlan.findUniqueOrThrow.mockResolvedValue({});
    await env.service.submitPlan(ama, "plan-1", ctx);
    expect(env.prisma.marketingPlan.updateMany.mock.calls[0][0].data.firstSubmittedAt).toEqual(first);
  });

  it("will not let anyone approve a plan they wrote or own, and only a manager may approve", async () => {
    const submitted = planRow({ status: "SUBMITTED", createdById: "ama" });
    const env = makeEnv();
    env.prisma.marketingPlan.findFirst.mockResolvedValue(submitted);
    env.prisma.marketingPlan.findUniqueOrThrow.mockResolvedValue({});
    await expect(env.service.approvePlan(ama, "plan-1", ctx)).rejects.toThrow(ForbiddenException); // not a manager
    // A manager who is also the plan's owner cannot approve their own.
    const own = makeEnv();
    own.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "SUBMITTED", marketerId: "boss", createdById: "boss" }));
    await expect(own.service.approvePlan(boss, "plan-1", ctx)).rejects.toThrow(/cannot approve a plan you wrote or own/);
    await expect(env.service.approvePlan(boss, "plan-1", ctx)).resolves.toBeDefined();
    expect(env.prisma.marketingPlan.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "plan-1", status: "SUBMITTED" }, data: { status: "APPROVED", approvedById: "boss" } });
  });

  it("refuses to approve a plan that is not waiting for approval", async () => {
    const env = makeEnv();
    env.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "APPROVED" }));
    env.prisma.marketingPlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(env.service.approvePlan(boss, "plan-1", ctx)).rejects.toThrow(/Only a submitted plan/);
  });

  it("counts a send-back after approval as a revision, but not a send-back before it", async () => {
    const approved = makeEnv();
    approved.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "APPROVED" }));
    approved.prisma.marketingPlan.findUniqueOrThrow.mockResolvedValue({});
    await approved.service.returnPlan(boss, "plan-1", { reason: "Wrong customer on line 2" }, ctx);
    expect(approved.prisma.marketingPlan.updateMany.mock.calls[0][0].data).toMatchObject({ status: "DRAFT", returnReason: "Wrong customer on line 2", revision: { increment: 1 }, approvedAt: null });

    const submitted = makeEnv();
    submitted.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "SUBMITTED" }));
    submitted.prisma.marketingPlan.findUniqueOrThrow.mockResolvedValue({});
    await submitted.service.returnPlan(boss, "plan-1", { reason: "Prices look low" }, ctx);
    expect(submitted.prisma.marketingPlan.updateMany.mock.calls[0][0].data.revision).toBeUndefined();
  });

  it("cannot send a closed week back, and a manager cannot send back their own plan", async () => {
    const closed = makeEnv();
    closed.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "CLOSED" }));
    await expect(closed.service.returnPlan(boss, "plan-1", { reason: "Change of mind" }, ctx)).rejects.toThrow(/closed week is final/);
    const own = makeEnv();
    own.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "SUBMITTED", marketerId: "boss" }));
    await expect(own.service.returnPlan(boss, "plan-1", { reason: "Change of mind" }, ctx)).rejects.toThrow(ForbiddenException);
  });

  it("lets a draft be rewritten only while it is still a draft", async () => {
    const env = makeEnv();
    env.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "APPROVED" }));
    await expect(env.service.updatePlan(ama, "plan-1", { lines: [newLine] }, ctx)).rejects.toThrow(/Only a draft can be edited/);
  });

  it("lets a marketer delete only a draft they never submitted; a manager can delete any draft", async () => {
    const submittedOnce = planRow({ firstSubmittedAt: new Date("2026-11-09T08:00:00.000Z") });
    const a = makeEnv();
    a.prisma.marketingPlan.findFirst.mockResolvedValue(submittedOnce);
    await expect(a.service.deletePlan(ama, "plan-1", ctx)).rejects.toThrow(/only a manager can delete/);

    const b = makeEnv();
    b.prisma.marketingPlan.findFirst.mockResolvedValue(submittedOnce);
    b.tx.marketingPlan.findFirst.mockResolvedValue({ id: "plan-1" });
    await expect(b.service.deletePlan(boss, "plan-1", ctx)).resolves.toEqual({ success: true });
    expect(b.tx.marketingPlanLine.deleteMany).toHaveBeenCalledWith({ where: { planId: "plan-1" } });

    const c = makeEnv();
    c.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "APPROVED" }));
    await expect(c.service.deletePlan(boss, "plan-1", ctx)).rejects.toThrow(/Only a draft can be deleted/);
  });
});

describe("MarketingLedgerService.closePlan — filing the week-end report", () => {
  const approved = () =>
    planRow({ status: "APPROVED", firstSubmittedAt: new Date("2026-11-08T20:00:00.000Z") }, [lineRow("L1", "c1", "feed", 100, 200), lineRow("L2", "c2", "feed", 50, 200)]);

  function closeEnv(orders: Row[]) {
    const env = makeEnv({ plans: [approved()], orders, userInfo: people, customers, products, marketerUsers: [{ id: "ama" }] });
    env.prisma.marketingPlan.findFirst.mockResolvedValue(approved());
    env.prisma.marketingPlan.findUniqueOrThrow.mockResolvedValue({});
    return env;
  }

  it("is not open until the last day of the week", async () => {
    const env = closeEnv([]);
    await expect(env.service.closePlan(ama, "plan-1", {}, ctx)).rejects.toThrow(/from its last day/);
  });

  it("only closes a plan that was approved", async () => {
    jest.setSystemTime(SUNDAY_EVENING);
    const env = makeEnv();
    env.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "SUBMITTED" }));
    await expect(env.service.closePlan(ama, "plan-1", {}, ctx)).rejects.toThrow(/Only an approved plan can be closed/);
    env.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "CLOSED" }));
    await expect(env.service.closePlan(ama, "plan-1", {}, ctx)).rejects.toThrow(/already closed/);
  });

  it("makes the marketer explain every line that fell short before the week closes", async () => {
    jest.setSystemTime(SUNDAY_EVENING);
    // Farm One bought exactly as planned; Farm Two bought nothing.
    const env = closeEnv([orderRow("1", "c1", [["feed", 100, 20000]], "ama")]);
    await expect(env.service.closePlan(ama, "plan-1", {}, ctx)).rejects.toThrow(/Farm Two – Layer 1 C/);
    expect(env.tx.marketingPlan.updateMany).not.toHaveBeenCalled();
  });

  it("freezes the actuals, the unplanned sales and the explanations onto the plan", async () => {
    jest.setSystemTime(SUNDAY_EVENING);
    const env = closeEnv([orderRow("1", "c1", [["feed", 100, 20000]], "ama"), orderRow("2", "c9", [["feed", 10, 2200]], "ama")]);
    await env.service.closePlan(ama, "plan-1", { closingNote: "Farm Two was waiting for their egg money", reasons: [{ lineId: "L2", reason: "Customer postponed to next week" }] }, ctx);

    const closed = env.tx.marketingPlan.updateMany.mock.calls[0][0];
    expect(closed.where).toEqual({ id: "plan-1", status: "APPROVED" });
    expect(closed.data).toMatchObject({ status: "CLOSED", closedById: "ama", closingNote: "Farm Two was waiting for their egg money" });
    const snap = closed.data.closeSnapshot;
    expect(snap.version).toBe(1);
    expect(snap.totals).toMatchObject({ plannedValue: 30000, soldValue: 22200, plannedLineSoldValue: 20000, unplannedValue: 2200, hitRatePct: 50 });
    expect(snap.unplanned).toEqual([expect.objectContaining({ customerId: "c9", value: 2200 })]);
    expect(snap.orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(["SO-1", "SO-2"]);

    const lineWrites = env.tx.marketingPlanLine.update.mock.calls.map((c) => c[0]);
    expect(lineWrites).toEqual(
      expect.arrayContaining([
        { where: { id: "L1" }, data: { actualQuantity: 100, actualValue: 20000, missReason: null } },
        { where: { id: "L2" }, data: { actualQuantity: 0, actualValue: 0, missReason: "Customer postponed to next week" } }
      ])
    );
  });

  it("lets a manager close the week for a marketer without reasons", async () => {
    jest.setSystemTime(SUNDAY_EVENING);
    const env = closeEnv([]);
    await expect(env.service.closePlan(boss, "plan-1", {}, ctx)).resolves.toBeDefined();
    expect(env.tx.marketingPlan.updateMany).toHaveBeenCalledTimes(1);
  });

  it("stops another marketer closing it, and rejects a reason for a line that is not on the plan", async () => {
    jest.setSystemTime(SUNDAY_EVENING);
    const env = closeEnv([]);
    await expect(env.service.closePlan(kofi, "plan-1", {}, ctx)).rejects.toThrow(NotFoundException);
    await expect(env.service.closePlan(boss, "plan-1", { reasons: [{ lineId: "not-a-line", reason: "x" }] }, ctx)).rejects.toThrow(/not on this plan/);
  });

  it("does not close twice if two people press the button at once", async () => {
    jest.setSystemTime(SUNDAY_EVENING);
    const env = closeEnv([]);
    env.tx.marketingPlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(env.service.closePlan(boss, "plan-1", {}, ctx)).rejects.toThrow(BadRequestException);
    expect(env.tx.marketingPlanLine.update).not.toHaveBeenCalled();
  });
});

describe("MarketingLedgerService.signOffPlan", () => {
  it("lets a different manager sign off a closed week, once", async () => {
    const env = makeEnv();
    env.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "CLOSED" }));
    env.prisma.marketingPlan.findUniqueOrThrow.mockResolvedValue({});
    await env.service.signOffPlan(boss, "plan-1", { note: "Discussed in Monday meeting" }, ctx);
    expect(env.prisma.marketingPlan.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "plan-1", status: "CLOSED", signedOffAt: null }, data: { signedOffById: "boss", signOffNote: "Discussed in Monday meeting" } });

    env.prisma.marketingPlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(env.service.signOffPlan(boss, "plan-1", {}, ctx)).rejects.toThrow(/already signed off/);
  });

  it("refuses an open week, the marketer's own week, and anyone who is not a manager", async () => {
    const open = makeEnv();
    open.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "APPROVED" }));
    await expect(open.service.signOffPlan(boss, "plan-1", {}, ctx)).rejects.toThrow(/Only a closed week/);
    const own = makeEnv();
    own.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "CLOSED", marketerId: "boss" }));
    await expect(own.service.signOffPlan(boss, "plan-1", {}, ctx)).rejects.toThrow(/your own week/);
    const nonManager = makeEnv();
    nonManager.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ status: "CLOSED" }));
    await expect(nonManager.service.signOffPlan(ama, "plan-1", {}, ctx)).rejects.toThrow(ForbiddenException);
  });
});

describe("MarketingLedgerService.week — what each person sees", () => {
  const plans = [
    planRow({ id: "plan-ama", marketerId: "ama", status: "APPROVED", firstSubmittedAt: new Date("2026-11-08T20:00:00.000Z") }, [lineRow("L1", "c1", "feed", 100, 200)]),
    planRow({ id: "plan-kofi", planNumber: "ML-2026-0002", marketerId: "kofi", status: "SUBMITTED", firstSubmittedAt: new Date("2026-11-11T08:00:00.000Z"), createdById: "kofi" }, [lineRow("L9", "c2", "feed", 40, 200, { planId: "plan-kofi" })])
  ];
  const orders = [orderRow("1", "c1", [["feed", 60, 12000]], "ama"), orderRow("2", "c2", [["feed", 10, 2000]]), orderRow("3", "c9", [["feed", 5, 1000]])];
  const env = () => makeEnv({ plans, orders, userInfo: people, customers, products, marketerUsers: [{ id: "ama" }, { id: "kofi" }] });

  it("shows a manager every marketer, the company totals and the sales nobody could be credited with", async () => {
    const { service } = env();
    const { data } = await service.week(boss, { weekStart: "2026-11-12" }); // any day snaps to the week's Monday
    expect(data.week).toMatchObject({ start: "2026-11-09", end: "2026-11-15", isCurrent: true, isOver: false });
    expect(data.scope).toBe("ALL");
    expect(data.rows.map((r) => r.marketerName)).toEqual(["Ama Mensah", "Kofi Boateng"]);

    const [amaRow, kofiRow] = data.rows;
    expect(amaRow.totals).toMatchObject({ plannedValue: 20000, soldValue: 12000, attainmentPct: 60 });
    expect(amaRow.flags).toEqual([]); // on time, approved, week still running
    expect(kofiRow.totals).toMatchObject({ plannedValue: 8000, soldValue: 2000, attainmentPct: 25 });
    expect(kofiRow.flags).toEqual(expect.arrayContaining(["AWAITING_APPROVAL", "LATE_PLAN"]));

    expect(data.summary).toMatchObject({ marketers: 2, plansFiled: 2, plannedValue: 28000, soldValue: 14000, varianceValue: -14000, totalSalesValue: 15000, totalOrders: 3, unattributedValue: 1000 });
    expect(data.unattributed).toMatchObject({ value: 1000, orders: 1, customers: [{ name: "Walk-in", value: 1000 }] });
  });

  it("shows a marketer only their own page, with no company figures", async () => {
    const { service } = env();
    const { data } = await service.week(ama, {});
    expect(data.scope).toBe("OWN");
    expect(data.rows.map((r) => r.marketerId)).toEqual(["ama"]);
    expect(data.summary).toBeNull();
    expect(data.unattributed).toBeNull();
  });

  it("gives a marketer with no plan a row that invites them to start one", async () => {
    const { service } = makeEnv({ plans: [], orders: [], userInfo: people, customers, products, marketerUsers: [{ id: "ama" }] }) ;
    const { data } = await service.week(ama, {});
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ marketerId: "ama", plan: null, flags: ["NO_PLAN"] });
  });

  it("lets someone who can read but does not plan (an auditor) see everything", async () => {
    const { service } = env();
    const { data } = await service.week(auditor, {});
    expect(data.scope).toBe("ALL");
    expect(data.rows).toHaveLength(2);
  });

  it("flags a marketer who has no plan once the week has started", async () => {
    const { service } = makeEnv({ plans: [], orders: [], userInfo: people, customers, products, marketerUsers: [{ id: "ama" }, { id: "kofi" }] });
    const { data } = await service.week(boss, {});
    expect(data.rows.every((r) => r.flags.includes("NO_PLAN"))).toBe(true);
    // A week still to come has nothing to be late about.
    const next = await service.week(boss, { weekStart: "2026-11-16" });
    expect(next.data.rows.every((r) => r.flags.length === 0)).toBe(true);
  });
});

describe("MarketingLedgerService.getPlan", () => {
  it("shows an open week live, and lists what the marketer will have to explain", async () => {
    const plan = planRow({ status: "APPROVED", firstSubmittedAt: new Date("2026-11-08T20:00:00.000Z") }, [lineRow("L1", "c1", "feed", 100, 200), lineRow("L2", "c2", "feed", 50, 200)]);
    const env = makeEnv({ plans: [plan], orders: [orderRow("1", "c1", [["feed", 100, 20000]], "ama")], userInfo: people, customers, products, marketerUsers: [{ id: "ama" }] });
    env.prisma.marketingPlan.findFirst.mockResolvedValue(plan);
    const { data } = await env.service.getPlan(ama, "plan-1");
    expect(data.totals).toMatchObject({ plannedValue: 30000, soldValue: 20000 });
    expect(data.lines.map((l) => [l.customerName, l.status])).toEqual([["Farm One", "ON_PLAN"], ["Farm Two", "NO_SALE"]]);
    expect(data.needReason).toEqual(["L2"]);
    expect(data.live).toBeNull();
    expect(data.actions).toMatchObject({ canEdit: false, canClose: false, canApprove: false, mustExplain: true }); // week not over yet
  });

  it("reads a closed week from what was frozen, and shows when the sales records have moved since", async () => {
    const snapshot = {
      version: 1,
      computedAt: SUNDAY_EVENING.toISOString(),
      totals: { plannedValue: 20000, soldValue: 12000, plannedLineSoldValue: 12000, unplannedValue: 0, varianceValue: -8000, attainmentPct: 60, volumeVariance: -8000, priceVariance: 0, unplannedVariance: 0, customersPlanned: 1, customersBought: 1, hitRatePct: 100, accuracyPct: 60, linesPlanned: 1, linesOnPlan: 0, orderCount: 1, units: [{ unit: "bag", planned: 100, sold: 60 }] },
      unplanned: [],
      orders: [{ id: "1", orderNumber: "SO-1", orderDate: "2026-11-10T09:00:00.000Z", customerId: "c1", value: 12000, basis: "PLANNED_CUSTOMER" }]
    };
    const closed = planRow({ status: "CLOSED", closedAt: SUNDAY_EVENING, closedById: "ama", closeSnapshot: snapshot, firstSubmittedAt: new Date("2026-11-08T20:00:00.000Z") }, [
      lineRow("L1", "c1", "feed", 100, 200, { actualQuantity: 60, actualValue: 12000, missReason: "Customer short of cash" })
    ]);
    // Since the close, another 20 bags were entered for the same customer, dated inside the week.
    const env = makeEnv({ plans: [closed], orders: [orderRow("1", "c1", [["feed", 60, 12000]], "ama"), orderRow("5", "c1", [["feed", 20, 4000]], "clerk")], userInfo: people, customers, products, marketerUsers: [{ id: "ama" }] });
    env.prisma.marketingPlan.findFirst.mockResolvedValue(closed);
    jest.setSystemTime(new Date("2026-11-18T09:00:00.000Z"));

    const { data } = await env.service.getPlan(boss, "plan-1");
    expect(data.totals.soldValue).toBe(12000); // the report says what it said on the day
    expect(data.lines[0]).toMatchObject({ actualQuantity: 60, actualValue: 12000, status: "SHORT", missReason: "Customer short of cash" });
    expect(data.live).toEqual({ soldValue: 16000, driftValue: 4000 });
    expect(data.orders.map((o) => o.orderNumber)).toEqual(["SO-1"]);
    expect(data.needReason).toEqual([]);
    expect(data.actions).toMatchObject({ canSignOff: true, canClose: false, canEdit: false });
  });

  it("hides another marketer's page from a marketer", async () => {
    const env = makeEnv();
    env.prisma.marketingPlan.findFirst.mockResolvedValue(planRow({ marketerId: "ama" }));
    await expect(env.service.getPlan(kofi, "plan-1")).rejects.toThrow(NotFoundException);
  });
});
