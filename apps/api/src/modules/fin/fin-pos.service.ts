import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinPosPayMethod, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import {
  CloseSessionDto, CreateRefundDto, CreateRegisterDto, CreateSaleDto, OpenSessionDto, PosListQueryDto, UpdatePosSettingsDto, UpdateRegisterDto
} from "./dto/fin-pos.dto";
import { FinLedgerService, dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal, toPesewas } from "./fin-money";
import { FinNumberingService } from "./fin-numbering.service";
import { CartLineInput, checkPayments, computeCart, percentOf } from "./fin-pos-math";
import { retryOnDeadlock } from "./fin-retry";
import { FinStockService } from "./fin-stock.service";
import { milliToString, qtyToMilli } from "./fin-stock-math";
import { mulDivHalfUp } from "./fin-tax-math";
import { FinTaxService } from "./fin-tax.service";

/** What the signed-in person is allowed to do beyond ringing up a normal sale. Decided by the controller from their permissions. */
export type PosPowers = { supervisor: boolean };
export type PosUser = { id: string; fullName: string; companyId: string };

const money = (p: number) => pesewasToDecimal(p);
/** Payments have no sequence number, so a receipt lists them in a fixed order: cash, MoMo, card. */
const RANK: Record<string, number> = { CASH: 0, MOMO: 1, CARD: 2 };
const byMethod = <T extends { method: string }>(rows: T[]): T[] => [...rows].sort((a, b) => RANK[a.method] - RANK[b.method]);
const D = (v: { toString(): string } | null | undefined) => decimalToPesewas(v ?? 0);

type SaleWithAll = Prisma.FinPosSaleGetPayload<{ include: { lines: true; payments: true; refunds: { include: { lines: true; payments: true } } } }>;

@Injectable()
export class FinPosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly ledger: FinLedgerService,
    private readonly numbering: FinNumberingService,
    private readonly stock: FinStockService,
    private readonly tax: FinTaxService
  ) {}

  // ─── settings and tills ─────────────────────────────────────────────────────

  async settings(companyId: string) {
    const s = await this.prisma.finPosSettings.findUnique({ where: { companyId } });
    return {
      momoPaymentAccountId: s?.momoPaymentAccountId ?? null,
      cardPaymentAccountId: s?.cardPaymentAccountId ?? null,
      floatSourceAccountId: s?.floatSourceAccountId ?? null,
      maxDiscountPercent: (s?.maxDiscountPercent ?? new Prisma.Decimal(10)).toFixed(2),
      refundApprovalAbove: s?.refundApprovalAbove ? s.refundApprovalAbove.toFixed(2) : null,
      receiptHeader: s?.receiptHeader ?? null,
      receiptFooter: s?.receiptFooter ?? null
    };
  }

  async updateSettings(companyId: string, userId: string, dto: UpdatePosSettingsDto, meta: RequestMeta) {
    for (const id of [dto.momoPaymentAccountId, dto.cardPaymentAccountId, dto.floatSourceAccountId]) {
      if (!id) continue;
      const pa = await this.prisma.finPaymentAccount.findFirst({ where: { id, companyId } });
      if (!pa || !pa.isActive) throw new BadRequestException("Choose an active payment account.");
    }
    const data: Prisma.FinPosSettingsUncheckedUpdateInput = { updatedById: userId };
    if (dto.momoPaymentAccountId !== undefined) data.momoPaymentAccountId = dto.momoPaymentAccountId || null;
    if (dto.cardPaymentAccountId !== undefined) data.cardPaymentAccountId = dto.cardPaymentAccountId || null;
    if (dto.floatSourceAccountId !== undefined) data.floatSourceAccountId = dto.floatSourceAccountId || null;
    if (dto.maxDiscountPercent !== undefined) {
      const p = Number(dto.maxDiscountPercent);
      if (!Number.isFinite(p) || p < 0 || p > 100) throw new BadRequestException("The discount limit must be between 0 and 100.");
      data.maxDiscountPercent = p.toFixed(2);
    }
    if (dto.refundApprovalAbove !== undefined) {
      const raw = dto.refundApprovalAbove === null || String(dto.refundApprovalAbove).trim() === "" ? null : toPesewas(dto.refundApprovalAbove, "The refund limit");
      data.refundApprovalAbove = raw === null ? null : money(raw);
    }
    if (dto.receiptHeader !== undefined) data.receiptHeader = dto.receiptHeader?.trim() || null;
    if (dto.receiptFooter !== undefined) data.receiptFooter = dto.receiptFooter?.trim() || null;
    await this.prisma.finPosSettings.upsert({ where: { companyId }, update: data, create: { ...(data as Prisma.FinPosSettingsUncheckedCreateInput), companyId } });
    await this.audit.write({ companyId, userId, area: "pos", action: "SETTINGS", entityType: "FinPosSettings", summary: "Changed the POS settings", ...meta });
    return this.settings(companyId);
  }

  async registers(companyId: string) {
    const [regs, open] = await Promise.all([
      this.prisma.finPosRegister.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
      this.prisma.finPosSession.findMany({ where: { companyId, status: "OPEN" } })
    ]);
    const accounts = await this.prisma.finPaymentAccount.findMany({ where: { companyId, id: { in: regs.map((r) => r.cashAccountId) } }, select: { id: true, name: true } });
    const name = new Map(accounts.map((a) => [a.id, a.name]));
    return regs.map((r) => {
      const s = open.find((o) => o.registerId === r.id);
      return { id: r.id, name: r.name, cashAccountId: r.cashAccountId, cashAccountName: name.get(r.cashAccountId) ?? "", isActive: r.isActive, openSession: s ? { id: s.id, number: s.number, cashierName: s.cashierName, openedAt: s.openedAt } : null };
    });
  }

  async createRegister(companyId: string, userId: string, dto: CreateRegisterDto, meta: RequestMeta) {
    const pa = await this.prisma.finPaymentAccount.findFirst({ where: { id: dto.cashAccountId, companyId } });
    if (!pa || pa.type !== "CASH" || !pa.isActive) throw new BadRequestException("Choose an active cash payment account for the drawer.");
    if (await this.prisma.finPosRegister.findFirst({ where: { companyId, cashAccountId: dto.cashAccountId } })) throw new ConflictException("Another till already uses that cash account. Each till needs its own drawer account.");
    try {
      const r = await this.prisma.finPosRegister.create({ data: { companyId, name: dto.name.trim(), cashAccountId: dto.cashAccountId, createdById: userId } });
      await this.audit.write({ companyId, userId, area: "pos", action: "CREATE_REGISTER", entityType: "FinPosRegister", entityId: r.id, summary: `Added the till ${r.name}`, ...meta });
      return (await this.registers(companyId)).find((x) => x.id === r.id)!;
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") throw new ConflictException(`A till called ${dto.name.trim()} already exists.`);
      throw e;
    }
  }

  async updateRegister(companyId: string, userId: string, id: string, dto: UpdateRegisterDto, meta: RequestMeta) {
    const reg = await this.prisma.finPosRegister.findFirst({ where: { id, companyId } });
    if (!reg) throw new NotFoundException("Till not found.");
    const open = await this.prisma.finPosSession.findFirst({ where: { registerId: id, status: "OPEN" } });
    if (open && (dto.isActive === false || dto.cashAccountId)) throw new BadRequestException("This till has an open session. Close it first.");
    const data: Prisma.FinPosRegisterUncheckedUpdateInput = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.cashAccountId) {
      const pa = await this.prisma.finPaymentAccount.findFirst({ where: { id: dto.cashAccountId, companyId } });
      if (!pa || pa.type !== "CASH" || !pa.isActive) throw new BadRequestException("Choose an active cash payment account for the drawer.");
      data.cashAccountId = dto.cashAccountId;
    }
    await this.prisma.finPosRegister.update({ where: { id }, data });
    await this.audit.write({ companyId, userId, area: "pos", action: "UPDATE_REGISTER", entityType: "FinPosRegister", entityId: id, summary: `Changed the till ${reg.name}`, ...meta });
    return (await this.registers(companyId)).find((x) => x.id === id)!;
  }

  // ─── till sessions ──────────────────────────────────────────────────────────

  /** The cashier's open session, if any. */
  async currentSession(companyId: string, cashierId: string) {
    const s = await this.prisma.finPosSession.findFirst({ where: { companyId, cashierId, status: "OPEN" }, include: { register: true } });
    return s ? this.presentSession(s, await this.sessionTotals(s.id)) : null;
  }

  async openSession(companyId: string, user: PosUser, dto: OpenSessionDto, meta: RequestMeta) {
    const float = dto.openingFloat === undefined || String(dto.openingFloat).trim() === "" ? 0 : toPesewas(dto.openingFloat, "The opening float");
    if (float < 0) throw new BadRequestException("The opening float cannot be negative.");
    return retryOnDeadlock(() =>
      this.prisma.$transaction(async (tx) => {
        const reg = await tx.finPosRegister.findFirst({ where: { id: dto.registerId, companyId } });
        if (!reg || !reg.isActive) throw new BadRequestException("Choose an active till.");
        const mine = await tx.finPosSession.findFirst({ where: { companyId, cashierId: user.id, status: "OPEN" }, include: { register: true } });
        if (mine) throw new ConflictException(`You already have ${mine.register.name} open (${mine.number}). Close it first.`);
        const busy = await tx.finPosSession.findFirst({ where: { companyId, registerId: reg.id, status: "OPEN" } });
        if (busy) throw new ConflictException(`${reg.name} is already open (${busy.number}, ${busy.cashierName}).`);
        const settings = await tx.finPosSettings.findUnique({ where: { companyId } });
        const id = randomUUID();
        const number = await this.numbering.next(companyId, "POS_SESSION", tx, new Date());
        let entryId: string | null = null;
        if (float > 0 && settings?.floatSourceAccountId) {
          const [from, to] = await Promise.all([tx.finPaymentAccount.findFirst({ where: { id: settings.floatSourceAccountId, companyId } }), tx.finPaymentAccount.findFirst({ where: { id: reg.cashAccountId, companyId } })]);
          if (!from || !to) throw new BadRequestException("The float source or the till's cash account is missing.");
          const e = await this.ledger.post({ companyId, userId: user.id, entryDate: new Date(), description: `Till float ${number} (${reg.name})`, sourceModule: "FIN_POS_FLOAT", sourceId: id, meta, lines: [{ accountId: to.ledgerAccountId, debit: money(float), description: `Float for ${reg.name}` }, { accountId: from.ledgerAccountId, credit: money(float), description: "Till float" }] }, tx);
          entryId = e.id;
        }
        await tx.finPosSession.create({ data: { id, companyId, registerId: reg.id, number, cashierId: user.id, cashierName: user.fullName.slice(0, 160), openingFloat: money(float), floatTransferId: entryId } });
        await this.audit.write({ companyId, userId: user.id, area: "pos", action: "OPEN_TILL", entityType: "FinPosSession", entityId: id, summary: `Opened ${reg.name} (${number}) with a float of ${money(float)}`, ...meta }, tx);
        const s = await tx.finPosSession.findUniqueOrThrow({ where: { id }, include: { register: true } });
        return this.presentSession(s, await this.sessionTotals(id, tx));
      })
    );
  }

  /** Cash the drawer should hold: the float, plus cash taken (net of change), minus cash refunded. */
  async sessionTotals(sessionId: string, db: FinDb | PrismaService = this.prisma) {
    const [sales, pays, refunds, refundPays] = await Promise.all([
      db.finPosSale.aggregate({ where: { sessionId }, _count: { _all: true }, _sum: { total: true } }),
      db.finPosPayment.groupBy({ by: ["method"], where: { sale: { sessionId } }, _sum: { amount: true } }),
      db.finPosRefund.aggregate({ where: { sessionId }, _count: { _all: true }, _sum: { total: true } }),
      db.finPosRefundPayment.groupBy({ by: ["method"], where: { refund: { sessionId } }, _sum: { amount: true } })
    ]);
    const by = (rows: { method: FinPosPayMethod; _sum: { amount: Prisma.Decimal | null } }[], m: FinPosPayMethod) => D(rows.find((r) => r.method === m)?._sum.amount);
    const session = await db.finPosSession.findUniqueOrThrow({ where: { id: sessionId } });
    const cashIn = by(pays as never, "CASH");
    const cashOut = by(refundPays as never, "CASH");
    return {
      salesCount: sales._count._all,
      salesTotal: D(sales._sum.total),
      refundsCount: refunds._count._all,
      refundsTotal: D(refunds._sum.total),
      cashIn,
      cashOut,
      momo: by(pays as never, "MOMO") - by(refundPays as never, "MOMO"),
      card: by(pays as never, "CARD") - by(refundPays as never, "CARD"),
      expectedCash: D(session.openingFloat) + cashIn - cashOut
    };
  }

  async closeSession(companyId: string, user: PosUser, id: string, dto: CloseSessionDto, powers: PosPowers, meta: RequestMeta) {
    const counted = toPesewas(dto.countedCash, "The cash count");
    if (counted < 0) throw new BadRequestException("The cash count cannot be negative.");
    return retryOnDeadlock(() =>
      this.prisma.$transaction(async (tx) => {
        const s = await tx.finPosSession.findFirst({ where: { id, companyId }, include: { register: true } });
        if (!s) throw new NotFoundException("Till session not found.");
        if (s.status !== "OPEN") throw new BadRequestException("This till session is already closed.");
        if (s.cashierId !== user.id && !powers.supervisor) throw new ForbiddenException("Only the cashier, or a supervisor, can close this till.");
        // Lock the session row so nothing is rung up while it closes.
        await tx.$queryRaw`SELECT id FROM fin_pos_sessions WHERE id = ${id} FOR UPDATE`;
        const totals = await this.sessionTotals(id, tx);
        const expected = totals.expectedCash;
        const variance = counted - expected;
        let entryId: string | null = null;
        if (variance !== 0) {
          const pa = await tx.finPaymentAccount.findFirst({ where: { id: s.register.cashAccountId, companyId } });
          if (!pa) throw new BadRequestException("The till's cash account is missing.");
          const over = variance > 0;
          const e = await this.ledger.post(
            {
              companyId, userId: user.id, entryDate: new Date(), description: `Till ${s.number} cash ${over ? "over" : "short"} ${money(Math.abs(variance))}`, sourceModule: "FIN_POS_VARIANCE", sourceId: id, meta,
              lines: over
                ? [{ accountId: pa.ledgerAccountId, debit: money(variance), description: "Cash counted above expected" }, { role: "cash_over_short", credit: money(variance), description: `Till ${s.number}` }]
                : [{ role: "cash_over_short", debit: money(-variance), description: `Till ${s.number}` }, { accountId: pa.ledgerAccountId, credit: money(-variance), description: "Cash counted below expected" }]
            },
            tx
          );
          entryId = e.id;
        }
        await tx.finPosSession.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date(), closedById: user.id, expectedCash: money(expected), countedCash: money(counted), variance: money(variance), closeNote: dto.note?.trim() || null, varianceEntryId: entryId } });
        await this.audit.write({ companyId, userId: user.id, area: "pos", action: "CLOSE_TILL", entityType: "FinPosSession", entityId: id, summary: `Closed ${s.register.name} (${s.number}): expected ${money(expected)}, counted ${money(counted)}, variance ${money(variance)}`, after: { expected: money(expected), counted: money(counted), variance: money(variance) }, ...meta }, tx);
        const closed = await tx.finPosSession.findUniqueOrThrow({ where: { id }, include: { register: true } });
        return this.presentSession(closed, await this.sessionTotals(id, tx));
      })
    );
  }

  async sessions(companyId: string, q: PosListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinPosSessionWhereInput = {
      companyId,
      ...(q.cashierId ? { cashierId: q.cashierId } : {}),
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.from || q.to ? { openedAt: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lt: new Date(parseDay(q.to).getTime() + 86_400_000) } : {}) } } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.finPosSession.findMany({ where, orderBy: [{ openedAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take, include: { register: true } }),
      this.prisma.finPosSession.count({ where })
    ]);
    const out = [];
    for (const s of rows) out.push(this.presentSession(s, await this.sessionTotals(s.id)));
    return { rows: out, total, page, take };
  }

  async getSession(companyId: string, id: string) {
    const s = await this.prisma.finPosSession.findFirst({ where: { id, companyId }, include: { register: true } });
    if (!s) throw new NotFoundException("Till session not found.");
    return this.presentSession(s, await this.sessionTotals(id));
  }

  private presentSession(s: Prisma.FinPosSessionGetPayload<{ include: { register: true } }>, t: Awaited<ReturnType<FinPosService["sessionTotals"]>>) {
    return {
      id: s.id, number: s.number, registerId: s.registerId, registerName: s.register.name, cashierId: s.cashierId, cashierName: s.cashierName, status: s.status,
      openedAt: s.openedAt, closedAt: s.closedAt, openingFloat: s.openingFloat.toFixed(2),
      expectedCash: s.status === "OPEN" ? money(t.expectedCash) : s.expectedCash?.toFixed(2) ?? null,
      countedCash: s.countedCash?.toFixed(2) ?? null, variance: s.variance?.toFixed(2) ?? null, closeNote: s.closeNote,
      totals: { sales: t.salesCount, salesTotal: money(t.salesTotal), refunds: t.refundsCount, refundsTotal: money(t.refundsTotal), cash: money(t.cashIn - t.cashOut), momo: money(t.momo), card: money(t.card) }
    };
  }

  // ─── selling ────────────────────────────────────────────────────────────────

  /** Rings up a sale: stock out, one balanced ledger entry (payments, sales, tax, cost of goods), all or nothing. */
  async sell(companyId: string, user: PosUser, dto: CreateSaleDto, powers: PosPowers, meta: RequestMeta) {
    return retryOnDeadlock(() => this.prisma.$transaction((tx) => this.sellTx(tx, companyId, user, dto, powers, meta)));
  }

  private async sellTx(tx: Prisma.TransactionClient, companyId: string, user: PosUser, dto: CreateSaleDto, powers: PosPowers, meta: RequestMeta) {
    const again = await tx.finPosSale.findFirst({ where: { companyId, clientKey: dto.clientKey }, select: { id: true } });
    if (again) return this.getSale(companyId, again.id, tx);

    const session = await tx.finPosSession.findFirst({ where: { companyId, cashierId: user.id, status: "OPEN" }, include: { register: true } });
    if (!session) throw new BadRequestException("Open your till before selling.");
    const settings = await tx.finPosSettings.findUnique({ where: { companyId } });
    const today = parseDay(new Date());

    let contactId: string | null = null;
    let customerName = dto.customerName?.trim() || null;
    if (dto.contactId) {
      const c = await tx.finContact.findFirst({ where: { id: dto.contactId, companyId, isCustomer: true, isActive: true } });
      if (!c) throw new BadRequestException("Choose an active customer, or leave it as a walk-in.");
      contactId = c.id;
      customerName = c.name;
    }

    const { built, cart, overridden } = await this.buildCart(tx, companyId, dto, powers, settings, today);

    // ── payments ──
    const accountFor = async (method: FinPosPayMethod): Promise<string> => {
      const id = method === "CASH" ? session.register.cashAccountId : method === "MOMO" ? settings?.momoPaymentAccountId : settings?.cardPaymentAccountId;
      if (!id) throw new BadRequestException(method === "MOMO" ? "Choose the MoMo account under POS settings first." : "Choose the card account under POS settings first.");
      const pa = await tx.finPaymentAccount.findFirst({ where: { id, companyId } });
      if (!pa || !pa.isActive) throw new BadRequestException(`The ${method === "CASH" ? "till's cash" : method === "MOMO" ? "MoMo" : "card"} account is missing or switched off.`);
      return pa.id;
    };
    const pays = dto.payments.map((p) => {
      const amount = toPesewas(p.amount, "A payment");
      const tendered = p.tendered === undefined || String(p.tendered).trim() === "" ? amount : toPesewas(p.tendered, "The money handed over");
      return { method: p.method, amount, tendered, reference: p.reference?.trim() || null };
    });
    const paid = checkPayments(cart.total, pays);
    const payAccounts = await Promise.all(pays.map((p) => accountFor(p.method)));
    const accountRows = await tx.finPaymentAccount.findMany({ where: { id: { in: payAccounts } } });
    const ledgerOf = new Map(accountRows.map((a) => [a.id, a.ledgerAccountId]));

    // ── stock: in a fixed order, so two tills selling the same items can never wait on each other in a circle ──
    const saleId = randomUUID();
    const order = built.map((b, i) => ({ b, i })).filter((x) => x.b.trackStock).sort((a, c) => (a.b.itemId! < c.b.itemId! ? -1 : a.b.itemId! > c.b.itemId! ? 1 : a.i - c.i));
    const costs = new Array<number>(built.length).fill(0);
    const movementIds = new Array<string | null>(built.length).fill(null);
    for (const { b, i } of order) {
      const m = await this.stock.move(tx, { companyId, itemId: b.itemId!, date: today, type: "SALE", quantityMilli: -b.qtyMilli, sourceModule: "FIN_POS_SALE", sourceId: `${saleId}:${i + 1}`, userId: user.id, allowNegative: powers.supervisor && dto.allowNegativeStock === true });
      costs[i] = -m.valuePesewas;
      movementIds[i] = m.id;
    }

    // ── the ledger entry ──
    const lines: { accountId?: string; role?: string; debit?: string; credit?: string; description?: string }[] = [];
    pays.forEach((p, k) => lines.push({ accountId: ledgerOf.get(payAccounts[k])!, debit: money(p.amount), description: `${p.method === "CASH" ? "Cash" : p.method === "MOMO" ? "MoMo" : "Card"} payment` }));
    const salesBy = new Map<string, { accountId?: string; role?: string; net: number }>();
    const cogsBy = new Map<string, { accountId?: string; role?: string; amount: number }>();
    const invBy = new Map<string, { accountId?: string; role?: string; amount: number }>();
    built.forEach((b, i) => {
      const key = b.incomeAccountId ?? "role:sales";
      const e = salesBy.get(key) ?? (b.incomeAccountId ? { accountId: b.incomeAccountId, net: 0 } : { role: "sales", net: 0 });
      e.net += cart.lines[i].net;
      salesBy.set(key, e);
      if (costs[i] > 0 && b.item) {
        const ck = b.item.cogsAccountId ?? "role:cogs";
        const ce = cogsBy.get(ck) ?? (b.item.cogsAccountId ? { accountId: b.item.cogsAccountId, amount: 0 } : { role: "cogs", amount: 0 });
        ce.amount += costs[i];
        cogsBy.set(ck, ce);
        const ik = b.item.inventoryAccountId ?? "role:inventory";
        const ie = invBy.get(ik) ?? (b.item.inventoryAccountId ? { accountId: b.item.inventoryAccountId, amount: 0 } : { role: "inventory", amount: 0 });
        ie.amount += costs[i];
        invBy.set(ik, ie);
      }
    });
    for (const e of salesBy.values()) if (e.net !== 0) lines.push({ ...(e.accountId ? { accountId: e.accountId } : { role: e.role }), credit: money(e.net), description: "POS sales" });
    if (cart.taxTotal > 0) lines.push({ role: "tax_payable", credit: money(cart.taxTotal), description: "Tax on POS sales" });
    for (const e of cogsBy.values()) lines.push({ ...(e.accountId ? { accountId: e.accountId } : { role: e.role }), debit: money(e.amount), description: "Cost of goods sold" });
    for (const e of invBy.values()) lines.push({ ...(e.accountId ? { accountId: e.accountId } : { role: e.role }), credit: money(e.amount), description: "Stock sold" });

    const number = await this.numbering.next(companyId, "POS_SALE", tx, today);
    const entry = await this.ledger.post({ companyId, userId: user.id, entryDate: today, description: `POS sale ${number}${customerName ? ` to ${customerName}` : ""}`.slice(0, 240), sourceModule: "FIN_POS_SALE", sourceId: saleId, meta, lines }, tx);
    for (const mid of movementIds) if (mid) await this.stock.linkJournal(tx, mid, entry.id);

    const costTotal = costs.reduce((s, c) => s + c, 0);
    await tx.finPosSale.create({
      data: {
        id: saleId, companyId, number, sessionId: session.id, registerId: session.registerId, cashierId: user.id, cashierName: user.fullName.slice(0, 160), contactId, customerName, saleDate: today,
        subtotal: money(cart.subtotal), discountTotal: money(cart.discountTotal), taxTotal: money(cart.taxTotal), total: money(cart.total), tendered: money(paid.tendered), changeGiven: money(paid.change),
        costTotal: money(costTotal), clientKey: dto.clientKey, journalEntryId: entry.id, notes: dto.notes?.trim() || null,
        lines: {
          create: built.map((b, i) => ({
            lineNo: i + 1, itemId: b.itemId, description: b.description, quantity: milliToString(b.qtyMilli), unitPrice: money(b.unitPesewas), priceIncludesTax: b.includesTax, discountAmount: money(b.discount + cart.lines[i].share),
            taxCodeId: b.taxCodeId, taxRatePercent: b.rate, lineNet: money(cart.lines[i].net), lineTax: money(cart.lines[i].tax), lineTotal: money(cart.lines[i].total), cost: money(costs[i]), incomeAccountId: b.incomeAccountId, isCharge: b.isCharge, movementId: movementIds[i]
          }))
        },
        payments: { create: pays.map((p, k) => ({ method: p.method, paymentAccountId: payAccounts[k], amount: money(p.amount), tendered: money(p.tendered), reference: p.reference })) }
      }
    });
    await this.audit.write({ companyId, userId: user.id, area: "pos", action: "SALE", entityType: "FinPosSale", entityId: saleId, summary: `Sale ${number}: ${money(cart.total)} (${pays.map((p) => p.method).join("+")})`, after: { total: money(cart.total), lines: built.length, ...(overridden.length ? { priceOverrides: overridden } : {}) }, ...meta }, tx);
    return this.getSale(companyId, saleId, tx);
  }


  /**
   * Prices a cart: shelf prices (or a supervisor's override), line and overall discounts, tax, and the discount limit.
   * A sale and the till's "what will this cost" check both use this, so they can never disagree.
   */
  private async buildCart(
    tx: Prisma.TransactionClient | PrismaService,
    companyId: string,
    dto: { lines: CreateSaleDto["lines"]; discountPercent?: string | number; discountAmount?: string | number },
    powers: PosPowers,
    settings: { maxDiscountPercent: Prisma.Decimal } | null,
    today: Date
  ) {
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId).filter((x): x is string => !!x))];
    const items = await tx.finItem.findMany({ where: { id: { in: itemIds }, companyId } });
    const byId = new Map(items.map((i) => [i.id, i]));
    type Built = { itemId: string | null; description: string; qtyMilli: number; unitPesewas: number; discount: number; isCharge: boolean; taxCodeId: string | null; rate: string; includesTax: boolean; incomeAccountId: string | null; trackStock: boolean; item: (typeof items)[number] | null };
    const built: Built[] = [];
    const overridden: string[] = [];
    for (const [idx, l] of dto.lines.entries()) {
      const qtyMilli = qtyToMilli(l.quantity, `Line ${idx + 1} quantity`);
      if (qtyMilli <= 0) throw new BadRequestException(`Line ${idx + 1}: the quantity must be more than zero.`);
      const isCharge = l.isCharge === true || !l.itemId;
      let item: (typeof items)[number] | null = null;
      if (l.itemId) {
        item = byId.get(l.itemId) ?? null;
        if (!item || !item.isActive) throw new BadRequestException(`Line ${idx + 1}: that item does not exist or is switched off.`);
      } else if (!l.description?.trim()) throw new BadRequestException(`Line ${idx + 1}: an extra charge needs a description.`);
      const shelf = item ? D(item.sellPrice) : null;
      let unit: number;
      if (l.unitPrice !== undefined && String(l.unitPrice).trim() !== "") {
        unit = toPesewas(l.unitPrice, `Line ${idx + 1} price`);
        if (unit < 0) throw new BadRequestException(`Line ${idx + 1}: the price cannot be negative.`);
        if (item && unit !== shelf) {
          if (!powers.supervisor) throw new ForbiddenException(`${item.name}: a supervisor must approve a different price.`);
          overridden.push(`${item.sku} ${money(shelf ?? 0)} -> ${money(unit)}`);
        }
      } else if (item) unit = shelf ?? 0;
      else throw new BadRequestException(`Line ${idx + 1}: an extra charge needs a price.`);
      const lineGross = mulDivHalfUp(unit, qtyMilli, 1000);
      let discount = 0;
      if (l.discountAmount !== undefined && String(l.discountAmount).trim() !== "") discount = toPesewas(l.discountAmount, `Line ${idx + 1} discount`);
      else if (l.discountPercent !== undefined && String(l.discountPercent).trim() !== "") discount = percentOf(lineGross, l.discountPercent);
      const taxCodeId = item?.taxCodeId ?? null;
      const rate = taxCodeId ? (await this.tax.resolve(companyId, taxCodeId, today, tx)).ratePercent : "0";
      built.push({ itemId: item?.id ?? null, description: item ? (item.name.length > 300 ? item.name.slice(0, 300) : item.name) : l.description!.trim().slice(0, 300), qtyMilli, unitPesewas: unit, discount, isCharge, taxCodeId, rate, includesTax: item ? item.priceIncludesTax : true, incomeAccountId: item?.incomeAccountId ?? null, trackStock: !!item && item.trackStock && item.kind === "GOODS", item });
    }

    // ── overall discount ──
    const afterLines = built.map((b) => mulDivHalfUp(b.unitPesewas, b.qtyMilli, 1000) - b.discount);
    const sumAfter = afterLines.reduce((s, a) => s + a, 0);
    let overall = 0;
    if (dto.discountAmount !== undefined && String(dto.discountAmount).trim() !== "") overall = toPesewas(dto.discountAmount, "The discount");
    else if (dto.discountPercent !== undefined && String(dto.discountPercent).trim() !== "") overall = percentOf(sumAfter, dto.discountPercent);

    const cart = computeCart(built.map((b): CartLineInput => ({ qtyMilli: b.qtyMilli, unitPesewas: b.unitPesewas, discountPesewas: b.discount, taxRatePercent: b.rate, priceIncludesTax: b.includesTax })), overall);
    if (cart.total <= 0) throw new BadRequestException("The sale total must be more than zero.");

    // A discount above the limit needs a supervisor.
    const grossSum = built.reduce((s, b) => s + mulDivHalfUp(b.unitPesewas, b.qtyMilli, 1000), 0);
    const limitHundredths = Math.round(Number(settings?.maxDiscountPercent ?? 10) * 100);
    if (!powers.supervisor && grossSum > 0 && BigInt(cart.discountTotal) * 10_000n > BigInt(grossSum) * BigInt(limitHundredths)) {
      throw new ForbiddenException(`A discount of more than ${(limitHundredths / 100).toFixed(2)}% needs a supervisor.`);
    }

    return { built, cart, overridden };
  }

  /** What this cart costs, exactly (tax, discounts and rounding included), with stock warnings. Changes nothing. */
  async quote(companyId: string, dto: { lines: CreateSaleDto["lines"]; discountPercent?: string | number; discountAmount?: string | number }, powers: PosPowers) {
    const settings = await this.prisma.finPosSettings.findUnique({ where: { companyId } });
    const { built, cart } = await this.buildCart(this.prisma, companyId, dto, powers, settings, parseDay(new Date()));
    const warnings: string[] = [];
    const need = new Map<string, number>();
    for (const b of built) if (b.trackStock && b.itemId) need.set(b.itemId, (need.get(b.itemId) ?? 0) + b.qtyMilli);
    if (need.size > 0) {
      const rows = await this.prisma.finItem.findMany({ where: { companyId, id: { in: [...need.keys()] } }, select: { id: true, name: true, qtyOnHand: true } });
      for (const r of rows) if (qtyToMilli(r.qtyOnHand.toString()) < need.get(r.id)!) warnings.push(`Only ${r.qtyOnHand.toFixed(3)} of ${r.name} in stock.`);
    }
    return {
      lines: built.map((b, i) => ({ itemId: b.itemId, description: b.description, quantity: milliToString(b.qtyMilli), unitPrice: money(b.unitPesewas), discount: money(b.discount + cart.lines[i].share), net: money(cart.lines[i].net), tax: money(cart.lines[i].tax), total: money(cart.lines[i].total), taxRatePercent: b.rate })),
      subtotal: money(cart.subtotal), discountTotal: money(cart.discountTotal), taxTotal: money(cart.taxTotal), total: money(cart.total), warnings
    };
  }

  // ─── reading sales ──────────────────────────────────────────────────────────

  async getSale(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const s = await db.finPosSale.findFirst({ where: { id, companyId }, include: { lines: { orderBy: { lineNo: "asc" } }, payments: true, refunds: { include: { lines: true, payments: true }, orderBy: { createdAt: "asc" } } } });
    if (!s) throw new NotFoundException("Sale not found.");
    return this.presentSale(s);
  }

  async listSales(companyId: string, q: PosListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinPosSaleWhereInput = {
      companyId,
      ...(q.sessionId ? { sessionId: q.sessionId } : {}),
      ...(q.cashierId ? { cashierId: q.cashierId } : {}),
      ...(q.search ? { OR: [{ number: { contains: q.search.trim() } }, { customerName: { contains: q.search.trim() } }] } : {}),
      ...(q.from || q.to ? { saleDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.finPosSale.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take, include: { lines: { orderBy: { lineNo: "asc" } }, payments: true, refunds: { include: { lines: true, payments: true } } } }),
      this.prisma.finPosSale.count({ where })
    ]);
    return { rows: rows.map((r) => this.presentSale(r)), total, page, take };
  }

  private presentSale(s: SaleWithAll) {
    const refundedByLine = new Map<string, number>();
    for (const r of s.refunds) for (const l of r.lines) refundedByLine.set(l.saleLineId, (refundedByLine.get(l.saleLineId) ?? 0) + qtyToMilli(l.quantity.toString()));
    const refundedTotal = s.refunds.reduce((t, r) => t + D(r.total), 0);
    return {
      id: s.id, number: s.number, sessionId: s.sessionId, cashierId: s.cashierId, cashierName: s.cashierName, contactId: s.contactId, customerName: s.customerName, saleDate: dayString(s.saleDate), createdAt: s.createdAt,
      subtotal: s.subtotal.toFixed(2), discountTotal: s.discountTotal.toFixed(2), taxTotal: s.taxTotal.toFixed(2), total: s.total.toFixed(2), tendered: s.tendered.toFixed(2), changeGiven: s.changeGiven.toFixed(2),
      notes: s.notes, journalEntryId: s.journalEntryId,
      refundedTotal: money(refundedTotal), status: refundedTotal === 0 ? "COMPLETE" : refundedTotal >= D(s.total) ? "REFUNDED" : "PART_REFUNDED",
      lines: s.lines.map((l) => ({
        id: l.id, lineNo: l.lineNo, itemId: l.itemId, description: l.description, quantity: l.quantity.toFixed(3), unitPrice: l.unitPrice.toFixed(2), discountAmount: l.discountAmount.toFixed(2), taxRatePercent: l.taxRatePercent.toFixed(4),
        lineNet: l.lineNet.toFixed(2), lineTax: l.lineTax.toFixed(2), lineTotal: l.lineTotal.toFixed(2), isCharge: l.isCharge,
        refundedQuantity: milliToString(refundedByLine.get(l.id) ?? 0), refundableQuantity: milliToString(qtyToMilli(l.quantity.toString()) - (refundedByLine.get(l.id) ?? 0))
      })),
      payments: byMethod(s.payments).map((p) => ({ method: p.method, amount: p.amount.toFixed(2), tendered: p.tendered.toFixed(2), reference: p.reference })),
      refunds: s.refunds.map((r) => ({ id: r.id, number: r.number, date: dayString(r.refundDate), reason: r.reason, total: r.total.toFixed(2), restock: r.restock, cashierName: r.cashierName, payments: byMethod(r.payments).map((p) => ({ method: p.method, amount: p.amount.toFixed(2) })) }))
    };
  }

  // ─── refunds ────────────────────────────────────────────────────────────────

  /** Returns goods from a past sale: reverses sales, tax and cost proportionally, puts stock back, pays the customer. */
  async refund(companyId: string, user: PosUser, dto: CreateRefundDto, powers: PosPowers, meta: RequestMeta) {
    return retryOnDeadlock(() => this.prisma.$transaction((tx) => this.refundTx(tx, companyId, user, dto, powers, meta)));
  }

  private async refundTx(tx: Prisma.TransactionClient, companyId: string, user: PosUser, dto: CreateRefundDto, powers: PosPowers, meta: RequestMeta) {
    const again = await tx.finPosRefund.findFirst({ where: { companyId, clientKey: dto.clientKey }, select: { id: true, saleId: true } });
    if (again) return this.getSale(companyId, again.saleId, tx);

    const session = await tx.finPosSession.findFirst({ where: { companyId, cashierId: user.id, status: "OPEN" }, include: { register: true } });
    if (!session) throw new BadRequestException("Open your till before refunding: the money comes from it.");
    // Lock the sale so two refunds of the same receipt cannot both take the last unit.
    await tx.$queryRaw`SELECT id FROM fin_pos_sales WHERE id = ${dto.saleId} AND companyId = ${companyId} FOR UPDATE`;
    const sale = await tx.finPosSale.findFirst({ where: { id: dto.saleId, companyId }, include: { lines: true, refunds: { include: { lines: true } } } });
    if (!sale) throw new NotFoundException("That sale does not exist.");
    const settings = await tx.finPosSettings.findUnique({ where: { companyId } });
    const today = parseDay(new Date());
    const restock = dto.restock !== false;

    const doneQty = new Map<string, number>();
    const doneAmt = new Map<string, { net: number; tax: number; total: number; cost: number }>();
    for (const r of sale.refunds) for (const l of r.lines) {
      doneQty.set(l.saleLineId, (doneQty.get(l.saleLineId) ?? 0) + qtyToMilli(l.quantity.toString()));
      const a = doneAmt.get(l.saleLineId) ?? { net: 0, tax: 0, total: 0, cost: 0 };
      doneAmt.set(l.saleLineId, { net: a.net + D(l.net), tax: a.tax + D(l.tax), total: a.total + D(l.total), cost: a.cost + D(l.costReturned) });
    }
    const seen = new Set<string>();
    const refundId = randomUUID();
    const parts: { line: (typeof sale.lines)[number]; qtyMilli: number; net: number; tax: number; total: number; cost: number }[] = [];
    for (const r of dto.lines) {
      if (seen.has(r.saleLineId)) throw new BadRequestException("A line appears twice in the refund.");
      seen.add(r.saleLineId);
      const line = sale.lines.find((l) => l.id === r.saleLineId);
      if (!line) throw new BadRequestException("A refund line does not belong to this sale.");
      const qty = qtyToMilli(r.quantity, "The refund quantity");
      const sold = qtyToMilli(line.quantity.toString());
      const left = sold - (doneQty.get(line.id) ?? 0);
      if (qty <= 0) throw new BadRequestException(`${line.description}: the refund quantity must be more than zero.`);
      if (qty > left) throw new BadRequestException(`${line.description}: only ${milliToString(left)} can still be refunded.`);
      const prior = doneAmt.get(line.id) ?? { net: 0, tax: 0, total: 0, cost: 0 };
      const last = qty === left; // the last bit refunded takes whatever is left, so rounding never leaves a pesewa behind
      const share = (full: number, taken: number) => (last ? full - taken : mulDivHalfUp(full, qty, sold));
      parts.push({ line, qtyMilli: qty, net: share(D(line.lineNet), prior.net), tax: share(D(line.lineTax), prior.tax), total: share(D(line.lineTotal), prior.total), cost: restock ? share(D(line.cost), prior.cost) : 0 });
    }
    const total = parts.reduce((s, p) => s + p.total, 0);
    const net = parts.reduce((s, p) => s + p.net, 0);
    const taxTotal = parts.reduce((s, p) => s + p.tax, 0);
    const costReturned = parts.reduce((s, p) => s + p.cost, 0);
    if (total <= 0) throw new BadRequestException("There is nothing to refund.");

    // Approval: every refund needs a supervisor unless it is under the limit.
    const limit = settings?.refundApprovalAbove ? D(settings.refundApprovalAbove) : null;
    const needsApproval = limit === null || total > limit;
    if (needsApproval && !powers.supervisor) throw new ForbiddenException(limit === null ? "A refund needs a supervisor's approval." : `A refund of more than ${money(limit)} needs a supervisor's approval.`);

    // Payments out
    const blankAmount = (p: { amount?: string | number }) => p.amount === undefined || String(p.amount).trim() === "";
    if (dto.payments.length > 1 && dto.payments.some(blankAmount)) throw new BadRequestException("Give the amount of each refund payment.");
    const pays = dto.payments.map((p) => ({ method: p.method, amount: blankAmount(p) ? total : toPesewas(p.amount!, "A refund payment"), reference: p.reference?.trim() || null }));
    if (pays.some((p) => p.amount <= 0)) throw new BadRequestException("Each refund payment must be more than zero.");
    const paidOut = pays.reduce((s, p) => s + p.amount, 0);
    if (paidOut !== total) throw new BadRequestException(`The refund payments add up to ${money(paidOut)} but the refund is ${money(total)}.`);
    const payAccounts: string[] = [];
    for (const p of pays) {
      const id = p.method === "CASH" ? session.register.cashAccountId : p.method === "MOMO" ? settings?.momoPaymentAccountId : settings?.cardPaymentAccountId;
      if (!id) throw new BadRequestException(p.method === "MOMO" ? "Choose the MoMo account under POS settings first." : "Choose the card account under POS settings first.");
      payAccounts.push(id);
    }
    const accountRows = await tx.finPaymentAccount.findMany({ where: { id: { in: payAccounts }, companyId } });
    const ledgerOf = new Map(accountRows.map((a) => [a.id, a.ledgerAccountId]));
    if (accountRows.length !== new Set(payAccounts).size) throw new BadRequestException("A payment account for this refund is missing.");

    // Stock back in at what it cost, line by line, in a fixed order.
    const movementOf = new Map<string, string>();
    if (restock) {
      const stockParts = parts.filter((p) => p.line.itemId && p.cost >= 0).sort((a, b) => (a.line.itemId! < b.line.itemId! ? -1 : a.line.itemId! > b.line.itemId! ? 1 : a.line.lineNo - b.line.lineNo));
      for (const p of stockParts) {
        const item = await tx.finItem.findFirst({ where: { id: p.line.itemId!, companyId }, select: { trackStock: true } });
        if (!item?.trackStock || !p.line.movementId) continue; // a service or a charge has no stock to put back
        const m = await this.stock.move(tx, { companyId, itemId: p.line.itemId!, date: today, type: "SALE_RETURN", quantityMilli: p.qtyMilli, valuePesewas: p.cost, sourceModule: "FIN_POS_REFUND", sourceId: `${refundId}:${p.line.lineNo}`, userId: user.id, notes: dto.reason });
        movementOf.set(p.line.id, m.id);
      }
    }

    // The ledger entry: the mirror image of the sale.
    const lines: { accountId?: string; role?: string; debit?: string; credit?: string; description?: string }[] = [];
    if (net > 0) lines.push({ role: "sales_returns", debit: money(net), description: "POS refund" });
    if (taxTotal > 0) lines.push({ role: "tax_payable", debit: money(taxTotal), description: "Tax refunded" });
    pays.forEach((p, k) => lines.push({ accountId: ledgerOf.get(payAccounts[k])!, credit: money(p.amount), description: `${p.method === "CASH" ? "Cash" : p.method === "MOMO" ? "MoMo" : "Card"} refund` }));
    const invBy = new Map<string, { accountId?: string; role?: string; amount: number }>();
    const cogsBy = new Map<string, { accountId?: string; role?: string; amount: number }>();
    for (const p of parts) {
      if (p.cost <= 0 || !p.line.itemId) continue;
      const item = await tx.finItem.findFirst({ where: { id: p.line.itemId, companyId } });
      if (!item) continue;
      const ik = item.inventoryAccountId ?? "role:inventory";
      const ie = invBy.get(ik) ?? (item.inventoryAccountId ? { accountId: item.inventoryAccountId, amount: 0 } : { role: "inventory", amount: 0 });
      ie.amount += p.cost;
      invBy.set(ik, ie);
      const ck = item.cogsAccountId ?? "role:cogs";
      const ce = cogsBy.get(ck) ?? (item.cogsAccountId ? { accountId: item.cogsAccountId, amount: 0 } : { role: "cogs", amount: 0 });
      ce.amount += p.cost;
      cogsBy.set(ck, ce);
    }
    for (const e of invBy.values()) lines.push({ ...(e.accountId ? { accountId: e.accountId } : { role: e.role }), debit: money(e.amount), description: "Stock returned" });
    for (const e of cogsBy.values()) lines.push({ ...(e.accountId ? { accountId: e.accountId } : { role: e.role }), credit: money(e.amount), description: "Cost of goods sold reversed" });

    const number = await this.numbering.next(companyId, "POS_REFUND", tx, today);
    const entry = await this.ledger.post({ companyId, userId: user.id, entryDate: today, description: `POS refund ${number} for sale ${sale.number}`.slice(0, 240), sourceModule: "FIN_POS_REFUND", sourceId: refundId, meta, lines }, tx);
    for (const mid of movementOf.values()) await this.stock.linkJournal(tx, mid, entry.id);

    await tx.finPosRefund.create({
      data: {
        id: refundId, companyId, number, saleId: sale.id, sessionId: session.id, cashierId: user.id, cashierName: user.fullName.slice(0, 160), approvedById: needsApproval ? user.id : null, refundDate: today, reason: dto.reason.trim(), restock,
        netTotal: money(net), taxTotal: money(taxTotal), total: money(total), costReturned: money(costReturned), clientKey: dto.clientKey, journalEntryId: entry.id,
        lines: { create: parts.map((p) => ({ saleLineId: p.line.id, quantity: milliToString(p.qtyMilli), net: money(p.net), tax: money(p.tax), total: money(p.total), costReturned: money(p.cost), movementId: movementOf.get(p.line.id) ?? null })) },
        payments: { create: pays.map((p, k) => ({ method: p.method, paymentAccountId: payAccounts[k], amount: money(p.amount), reference: p.reference })) }
      }
    });
    await this.audit.write({ companyId, userId: user.id, area: "pos", action: "REFUND", entityType: "FinPosRefund", entityId: refundId, summary: `Refund ${number} of ${money(total)} on sale ${sale.number}: ${dto.reason.trim()}`.slice(0, 500), after: { total: money(total), restock }, ...meta }, tx);
    return this.getSale(companyId, sale.id, tx);
  }

  // ─── reports ────────────────────────────────────────────────────────────────

  /** Sales by day, cashier, item or payment method, net of refunds, for any date range. */
  async report(companyId: string, q: { from?: string; to?: string; groupBy?: "day" | "cashier" | "item" | "method" }) {
    const to = q.to ? parseDay(q.to) : parseDay(new Date());
    const from = q.from ? parseDay(q.from) : new Date(to.getTime() - 29 * 86_400_000);
    const groupBy = q.groupBy ?? "day";
    type Row = { key: string; label: string; count: number; quantity: number; sales: number; discounts: number; tax: number; refunds: number; refundTax: number; cost: number; costReturned: number };
    const rows = new Map<string, Row>();
    const get = (key: string, label: string) => {
      let r = rows.get(key);
      if (!r) rows.set(key, (r = { key, label, count: 0, quantity: 0, sales: 0, discounts: 0, tax: 0, refunds: 0, refundTax: 0, cost: 0, costReturned: 0 }));
      return r;
    };

    if (groupBy === "day" || groupBy === "cashier") {
      const sales = await this.prisma.$queryRaw<{ k: string; label: string; n: bigint; total: unknown; disc: unknown; tax: unknown; cost: unknown }[]>(
        groupBy === "day"
          ? Prisma.sql`SELECT DATE_FORMAT(saleDate, '%Y-%m-%d') AS k, DATE_FORMAT(saleDate, '%Y-%m-%d') AS label, COUNT(*) AS n, SUM(total) AS total, SUM(discountTotal) AS disc, SUM(taxTotal) AS tax, SUM(costTotal) AS cost FROM fin_pos_sales WHERE companyId = ${companyId} AND saleDate BETWEEN ${from} AND ${to} GROUP BY saleDate`
          : Prisma.sql`SELECT cashierId AS k, MAX(cashierName) AS label, COUNT(*) AS n, SUM(total) AS total, SUM(discountTotal) AS disc, SUM(taxTotal) AS tax, SUM(costTotal) AS cost FROM fin_pos_sales WHERE companyId = ${companyId} AND saleDate BETWEEN ${from} AND ${to} GROUP BY cashierId`
      );
      for (const s of sales) {
        const r = get(s.k, s.label);
        r.count = Number(s.n); r.sales = D(String(s.total)); r.discounts = D(String(s.disc)); r.tax = D(String(s.tax)); r.cost = D(String(s.cost));
      }
      const refunds = await this.prisma.$queryRaw<{ k: string; label: string; total: unknown; rtax: unknown; cost: unknown }[]>(
        groupBy === "day"
          ? Prisma.sql`SELECT DATE_FORMAT(refundDate, '%Y-%m-%d') AS k, DATE_FORMAT(refundDate, '%Y-%m-%d') AS label, SUM(total) AS total, SUM(taxTotal) AS rtax, SUM(costReturned) AS cost FROM fin_pos_refunds WHERE companyId = ${companyId} AND refundDate BETWEEN ${from} AND ${to} GROUP BY refundDate`
          : Prisma.sql`SELECT cashierId AS k, MAX(cashierName) AS label, SUM(total) AS total, SUM(taxTotal) AS rtax, SUM(costReturned) AS cost FROM fin_pos_refunds WHERE companyId = ${companyId} AND refundDate BETWEEN ${from} AND ${to} GROUP BY cashierId`
      );
      for (const f of refunds) {
        const r = get(f.k, f.label);
        r.refunds = D(String(f.total)); r.refundTax = D(String(f.rtax)); r.costReturned = D(String(f.cost));
      }
    } else if (groupBy === "item") {
      const sales = await this.prisma.$queryRaw<{ k: string; label: string; qty: unknown; total: unknown; tax: unknown; disc: unknown; cost: unknown }[]>(
        Prisma.sql`SELECT COALESCE(l.itemId, l.description) AS k, MAX(l.description) AS label, SUM(l.quantity) AS qty, SUM(l.lineTotal) AS total, SUM(l.lineTax) AS tax, SUM(l.discountAmount) AS disc, SUM(l.cost) AS cost
                   FROM fin_pos_sale_lines l JOIN fin_pos_sales s ON s.id = l.saleId WHERE s.companyId = ${companyId} AND s.saleDate BETWEEN ${from} AND ${to} GROUP BY COALESCE(l.itemId, l.description)`
      );
      for (const s of sales) {
        const r = get(s.k, s.label);
        r.quantity = qtyToMilli(String(s.qty)); r.sales = D(String(s.total)); r.tax = D(String(s.tax)); r.discounts = D(String(s.disc)); r.cost = D(String(s.cost));
      }
      const refunds = await this.prisma.$queryRaw<{ k: string; label: string; qty: unknown; total: unknown; rtax: unknown; cost: unknown }[]>(
        Prisma.sql`SELECT COALESCE(l.itemId, l.description) AS k, MAX(l.description) AS label, SUM(rl.quantity) AS qty, SUM(rl.total) AS total, SUM(rl.tax) AS rtax, SUM(rl.costReturned) AS cost
                   FROM fin_pos_refund_lines rl JOIN fin_pos_refunds r ON r.id = rl.refundId JOIN fin_pos_sale_lines l ON l.id = rl.saleLineId
                   WHERE r.companyId = ${companyId} AND r.refundDate BETWEEN ${from} AND ${to} GROUP BY COALESCE(l.itemId, l.description)`
      );
      for (const f of refunds) {
        const r = get(f.k, f.label);
        r.quantity -= qtyToMilli(String(f.qty)); r.refunds = D(String(f.total)); r.refundTax = D(String(f.rtax)); r.costReturned = D(String(f.cost));
      }
    } else {
      const pays = await this.prisma.$queryRaw<{ k: string; n: bigint; total: unknown }[]>(
        Prisma.sql`SELECT p.method AS k, COUNT(*) AS n, SUM(p.amount) AS total FROM fin_pos_payments p JOIN fin_pos_sales s ON s.id = p.saleId WHERE s.companyId = ${companyId} AND s.saleDate BETWEEN ${from} AND ${to} GROUP BY p.method`
      );
      for (const p of pays) {
        const r = get(p.k, p.k === "CASH" ? "Cash" : p.k === "MOMO" ? "MoMo" : "Card");
        r.count = Number(p.n); r.sales = D(String(p.total));
      }
      const refunds = await this.prisma.$queryRaw<{ k: string; total: unknown }[]>(
        Prisma.sql`SELECT p.method AS k, SUM(p.amount) AS total FROM fin_pos_refund_payments p JOIN fin_pos_refunds r ON r.id = p.refundId WHERE r.companyId = ${companyId} AND r.refundDate BETWEEN ${from} AND ${to} GROUP BY p.method`
      );
      for (const f of refunds) {
        const r = get(f.k, f.k === "CASH" ? "Cash" : f.k === "MOMO" ? "MoMo" : "Card");
        r.refunds = D(String(f.total));
      }
    }

    const list = [...rows.values()].sort((a, b) => (groupBy === "day" ? (a.key < b.key ? -1 : 1) : b.sales - a.sales));
    const present = (r: Row) => ({ key: r.key, label: r.label, count: r.count, quantity: r.quantity ? milliToString(r.quantity) : null, sales: money(r.sales), discounts: money(r.discounts), tax: money(r.tax), refunds: money(r.refunds), net: money(r.sales - r.refunds), cost: money(r.cost - r.costReturned), profit: groupBy === "method" ? null : money(r.sales - r.tax - (r.refunds - r.refundTax) - (r.cost - r.costReturned)) });
    const totals = list.reduce((t, r) => ({ count: t.count + r.count, sales: t.sales + r.sales, discounts: t.discounts + r.discounts, tax: t.tax + r.tax, refunds: t.refunds + r.refunds, cost: t.cost + r.cost - r.costReturned }), { count: 0, sales: 0, discounts: 0, tax: 0, refunds: 0, cost: 0 });
    return { from: dayString(from), to: dayString(to), groupBy, rows: list.map(present), totals: { count: totals.count, sales: money(totals.sales), discounts: money(totals.discounts), tax: money(totals.tax), refunds: money(totals.refunds), net: money(totals.sales - totals.refunds), cost: money(totals.cost) } };
  }
}
