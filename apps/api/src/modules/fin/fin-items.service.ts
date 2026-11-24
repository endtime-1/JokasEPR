import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinAuditService, FinDb, RequestMeta } from "./fin-audit.service";
import { parseCsvObjects, toCsv } from "./fin-csv";
import { AdjustStockDto, CreateItemDto, ImportItemsDto, ItemListQueryDto, MovementQueryDto, UpdateItemDto, ValuationQueryDto } from "./dto/fin-items.dto";
import { FinLedgerService, dayString, parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal, toPesewas } from "./fin-money";
import { ledgerBalancePesewas } from "./fin-payment-accounts.service";
import { FinStockService } from "./fin-stock.service";
import { costToTenThousandths, milliToString, qtyToMilli, valueOfStockIn } from "./fin-stock-math";
import { mulDivHalfUp } from "./fin-tax-math";

const CSV_HEADERS = ["sku", "name", "barcode", "type", "unit", "category", "sell_price", "price_includes_tax", "tax_code", "track_stock", "reorder_level", "opening_qty", "opening_unit_cost", "external_ref"];
const CSV_ALIASES: Record<string, string> = { price: "sell_price", selling_price: "sell_price", cost: "opening_unit_cost", opening_cost: "opening_unit_cost", qty: "opening_qty", quantity: "opening_qty", opening_quantity: "opening_qty", code: "sku", item_code: "sku", item: "name", item_name: "name", uom: "unit", group: "category", kind: "type" };

const yes = (v: string | undefined, fallback: boolean) => {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  if (["y", "yes", "true", "1"].includes(s)) return true;
  if (["n", "no", "false", "0"].includes(s)) return false;
  throw new BadRequestException(`"${v}" should be yes or no.`);
};
const blank = (v: string | null | undefined) => (v === null || v === undefined || v.trim() === "" ? null : v.trim());

type ItemRow = Prisma.FinItemGetPayload<object>;

export function presentItem(i: ItemRow) {
  const qty = qtyToMilli(i.qtyOnHand.toString());
  const value = decimalToPesewas(i.stockValue);
  return {
    id: i.id,
    sku: i.sku,
    name: i.name,
    barcode: i.barcode,
    kind: i.kind,
    unit: i.unit,
    category: i.category,
    sellPrice: i.sellPrice.toFixed(2),
    priceIncludesTax: i.priceIncludesTax,
    taxCodeId: i.taxCodeId,
    incomeAccountId: i.incomeAccountId,
    cogsAccountId: i.cogsAccountId,
    inventoryAccountId: i.inventoryAccountId,
    trackStock: i.trackStock,
    reorderLevel: i.reorderLevel.toString(),
    qtyOnHand: milliToString(qty),
    stockValue: pesewasToDecimal(value),
    avgCost: qty > 0 ? pesewasToDecimal(mulDivHalfUp(value, 1000, qty)) : "0.00",
    lowStock: i.trackStock && i.isActive && qty <= qtyToMilli(i.reorderLevel.toString()) && qtyToMilli(i.reorderLevel.toString()) > 0,
    isActive: i.isActive,
    notes: i.notes,
    externalRef: i.externalRef
  };
}

export type ImportPlan = { line: number; sku: string; name: string; action: "create" | "update" | "error"; messages: string[]; warnings: string[] };

@Injectable()
export class FinItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinAuditService,
    private readonly ledger: FinLedgerService,
    private readonly stock: FinStockService
  ) {}

  // ─── items ──────────────────────────────────────────────────────────────────

  async list(companyId: string, q: ItemListQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const search = q.search?.trim();
    const where: Prisma.FinItemWhereInput = {
      companyId,
      ...(q.activeOnly === "false" ? {} : { isActive: true }),
      ...(q.category ? { category: q.category } : {}),
      ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: { contains: search } }] } : {})
    };
    // "Low stock" compares two columns, which Prisma cannot express, so it is applied to the page-sized result set below.
    const [rows, total, agg] = await Promise.all([
      this.prisma.finItem.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: q.lowStock ? 0 : (page - 1) * take, take: q.lowStock ? 1000 : take }),
      this.prisma.finItem.count({ where }),
      this.prisma.finItem.aggregate({ where: { companyId, isActive: true }, _sum: { stockValue: true }, _count: { _all: true } })
    ]);
    let items = rows.map(presentItem);
    let count = total;
    if (q.lowStock) {
      items = items.filter((i) => i.lowStock);
      count = items.length;
      items = items.slice((page - 1) * take, page * take);
    }
    return { rows: items, total: count, page, take, totals: { items: agg._count._all, stockValue: pesewasToDecimal(decimalToPesewas(agg._sum.stockValue)) } };
  }

  async get(companyId: string, id: string, db: FinDb | PrismaService = this.prisma) {
    const item = await db.finItem.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException("Item not found.");
    const recent = await db.finStockMovement.findMany({ where: { companyId, itemId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20 });
    return { ...presentItem(item), recentMovements: recent.map(presentMovement) };
  }

  /** For the till: an exact barcode or SKU scan wins; otherwise a name search. */
  async lookup(companyId: string, code: string) {
    const c = code.trim();
    if (!c) return { exact: null, matches: [] };
    const exact = await this.prisma.finItem.findFirst({ where: { companyId, isActive: true, OR: [{ barcode: c }, { sku: c }] } });
    if (exact) return { exact: presentItem(exact), matches: [] };
    const matches = await this.prisma.finItem.findMany({ where: { companyId, isActive: true, OR: [{ name: { contains: c } }, { sku: { contains: c } }, { barcode: { contains: c } }] }, orderBy: { name: "asc" }, take: 12 });
    return { exact: null, matches: matches.map(presentItem) };
  }

  async create(companyId: string, userId: string, dto: CreateItemDto, meta: RequestMeta) {
    const sku = dto.sku.trim();
    const kind = dto.kind ?? "GOODS";
    const trackStock = kind === "SERVICE" ? false : dto.trackStock ?? true;
    const sellPrice = toPesewas(dto.sellPrice ?? 0, "The price");
    if (sellPrice < 0) throw new BadRequestException("The price cannot be negative.");
    const reorder = qtyToMilli(dto.reorderLevel ?? 0, "The reorder level");
    if (reorder < 0) throw new BadRequestException("The reorder level cannot be negative.");
    if (dto.openingStock && !trackStock) throw new BadRequestException("Opening stock only applies to items that track stock.");
    return this.prisma.$transaction(async (tx) => {
      await this.checkAccounts(tx, companyId, dto);
      await this.assertFree(tx, companyId, sku, blank(dto.barcode));
      const id = randomUUID();
      await tx.finItem.create({
        data: {
          id, companyId, sku, name: dto.name.trim(), barcode: blank(dto.barcode), kind, unit: (dto.unit ?? "each").trim() || "each", category: blank(dto.category),
          sellPrice: pesewasToDecimal(sellPrice), priceIncludesTax: dto.priceIncludesTax ?? true, taxCodeId: dto.taxCodeId ?? null, incomeAccountId: dto.incomeAccountId ?? null,
          cogsAccountId: dto.cogsAccountId ?? null, inventoryAccountId: dto.inventoryAccountId ?? null, trackStock, reorderLevel: milliToString(reorder), notes: blank(dto.notes),
          externalRef: blank(dto.externalRef), createdById: userId
        }
      });
      if (dto.openingStock) {
        const qty = qtyToMilli(dto.openingStock.quantity, "The opening quantity");
        if (qty <= 0) throw new BadRequestException("The opening quantity must be more than zero.");
        await this.postOpening(tx, companyId, userId, [{ itemId: id, qtyMilli: qty, cost4: costToTenThousandths(dto.openingStock.unitCost, "The opening unit cost") }], dto.openingStock.date ?? dayString(new Date()), `Opening stock: ${dto.name.trim()}`, meta);
      }
      await this.audit.write({ companyId, userId, area: "items", action: "CREATE", entityType: "FinItem", entityId: id, summary: `Created item ${sku} ${dto.name.trim()}`, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  async update(companyId: string, userId: string, id: string, dto: UpdateItemDto, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.finItem.findFirst({ where: { id, companyId } });
      if (!item) throw new NotFoundException("Item not found.");
      await this.checkAccounts(tx, companyId, dto);
      const data: Prisma.FinItemUncheckedUpdateInput = { updatedById: userId };
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.barcode !== undefined) {
        const b = blank(dto.barcode);
        if (b && b !== item.barcode) await this.assertFree(tx, companyId, null, b, id);
        data.barcode = b;
      }
      const hasMovements = (await tx.finStockMovement.count({ where: { itemId: id } })) > 0;
      if (dto.unit !== undefined) {
        if (hasMovements && dto.unit.trim() !== item.unit) throw new BadRequestException("The unit cannot change once the item has stock history.");
        data.unit = dto.unit.trim() || "each";
      }
      if (dto.trackStock !== undefined && dto.trackStock !== item.trackStock) {
        if (item.kind === "SERVICE" && dto.trackStock) throw new BadRequestException("A service does not track stock.");
        if (hasMovements) throw new BadRequestException("Stock tracking cannot change once the item has stock history.");
        data.trackStock = dto.trackStock;
      }
      if (dto.category !== undefined) data.category = blank(dto.category);
      if (dto.sellPrice !== undefined) {
        const p = toPesewas(dto.sellPrice, "The price");
        if (p < 0) throw new BadRequestException("The price cannot be negative.");
        data.sellPrice = pesewasToDecimal(p);
      }
      if (dto.priceIncludesTax !== undefined) data.priceIncludesTax = dto.priceIncludesTax;
      for (const k of ["taxCodeId", "incomeAccountId", "cogsAccountId", "inventoryAccountId"] as const) if (dto[k] !== undefined) data[k] = dto[k] || null;
      if (dto.reorderLevel !== undefined) data.reorderLevel = milliToString(Math.max(0, qtyToMilli(dto.reorderLevel, "The reorder level")));
      if (dto.notes !== undefined) data.notes = blank(dto.notes);
      if (dto.externalRef !== undefined) data.externalRef = blank(dto.externalRef);
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      await tx.finItem.update({ where: { id }, data });
      await this.audit.write({ companyId, userId, area: "items", action: dto.isActive === false ? "DEACTIVATE" : "UPDATE", entityType: "FinItem", entityId: id, summary: `Updated item ${item.sku}`, ...meta }, tx);
      return this.get(companyId, id, tx);
    });
  }

  // ─── stock adjustments ──────────────────────────────────────────────────────

  /** A stock count or correction: moves the quantity and posts the difference to the stock adjustment account. */
  async adjust(companyId: string, userId: string, dto: AdjustStockDto, meta: RequestMeta) {
    if ((dto.quantityChange === undefined) === (dto.newQuantity === undefined)) throw new BadRequestException("Give either the change in quantity or the new quantity, not both.");
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; name: string; sku: string; qtyOnHand: unknown; stockValue: unknown; trackStock: unknown; inventoryAccountId: string | null }[]>`
        SELECT id, name, sku, qtyOnHand, stockValue, trackStock, inventoryAccountId FROM fin_items WHERE id = ${dto.itemId} AND companyId = ${companyId} FOR UPDATE`;
      const item = rows[0];
      if (!item) throw new NotFoundException("Item not found.");
      const onHand = qtyToMilli(String(item.qtyOnHand));
      const value = decimalToPesewas(String(item.stockValue));
      const change = dto.quantityChange !== undefined ? qtyToMilli(dto.quantityChange, "The change") : qtyToMilli(dto.newQuantity!, "The new quantity") - onHand;
      if (dto.newQuantity !== undefined && qtyToMilli(dto.newQuantity, "The new quantity") < 0) throw new BadRequestException("The new quantity cannot be negative.");
      if (change === 0) throw new BadRequestException("That is the quantity already in stock, so there is nothing to adjust.");

      let move;
      if (change > 0) {
        let valuePesewas: number;
        if (dto.unitCost !== undefined && String(dto.unitCost).trim() !== "") valuePesewas = valueOfStockIn(change, costToTenThousandths(dto.unitCost, "The unit cost"));
        else if (onHand > 0 && value > 0) valuePesewas = mulDivHalfUp(value, change, onHand);
        else throw new BadRequestException("Enter the cost per unit: there is no average cost to use yet.");
        move = await this.stock.move(tx, { companyId, itemId: dto.itemId, date: dto.date, type: "ADJUSTMENT", quantityMilli: change, valuePesewas, sourceModule: "FIN_STOCK_ADJ", sourceId: randomUUID(), notes: dto.reason, userId });
      } else {
        move = await this.stock.move(tx, { companyId, itemId: dto.itemId, date: dto.date, type: "ADJUSTMENT", quantityMilli: change, sourceModule: "FIN_STOCK_ADJ", sourceId: randomUUID(), notes: dto.reason, userId });
      }
      const amount = Math.abs(move.valuePesewas);
      let journalId: string | null = null;
      if (amount > 0) {
        const inv = item.inventoryAccountId ? { accountId: item.inventoryAccountId } : { role: "inventory" };
        const gain = move.valuePesewas > 0;
        const posted = await this.ledger.post(
          {
            companyId, userId, entryDate: dto.date, description: `Stock ${gain ? "gain" : "loss"}: ${item.sku} ${item.name}`.slice(0, 240), sourceModule: "FIN_STOCK_ADJ", sourceId: move.id, notes: dto.reason, meta,
            lines: gain
              ? [{ ...inv, debit: pesewasToDecimal(amount), description: item.name }, { role: "stock_adjustment", credit: pesewasToDecimal(amount), description: dto.reason }]
              : [{ role: "stock_adjustment", debit: pesewasToDecimal(amount), description: dto.reason }, { ...inv, credit: pesewasToDecimal(amount), description: item.name }]
          },
          tx
        );
        journalId = posted.id;
        await this.stock.linkJournal(tx, move.id, posted.id);
      }
      await this.audit.write({ companyId, userId, area: "items", action: "ADJUST_STOCK", entityType: "FinItem", entityId: dto.itemId, summary: `Adjusted stock of ${item.sku} by ${milliToString(change)} (${dto.reason})`.slice(0, 500), after: { change: milliToString(change), value: pesewasToDecimal(move.valuePesewas) }, ...meta }, tx);
      return { movementId: move.id, journalEntryId: journalId, quantityChange: milliToString(change), valueChange: pesewasToDecimal(move.valuePesewas), item: await this.get(companyId, dto.itemId, tx) };
    });
  }

  /** Books opening stock for several items at once: one movement each and ONE journal entry (Dr Inventory, Cr Opening Balance Equity). */
  private async postOpening(tx: FinDb, companyId: string, userId: string, lines: { itemId: string; qtyMilli: number; cost4: number }[], date: string, description: string, meta: RequestMeta) {
    const items = await tx.finItem.findMany({ where: { id: { in: lines.map((l) => l.itemId) }, companyId } });
    const byId = new Map(items.map((i) => [i.id, i]));
    const perAccount = new Map<string, { accountId?: string; role?: string; total: number }>();
    const movements: string[] = [];
    let total = 0;
    for (const l of lines) {
      const item = byId.get(l.itemId)!;
      const m = await this.stock.move(tx, { companyId, itemId: l.itemId, date, type: "OPENING", quantityMilli: l.qtyMilli, cost4: l.cost4, sourceModule: "FIN_STOCK_OPENING", sourceId: l.itemId, userId, notes: "Opening stock" });
      if (!m.created) continue;
      movements.push(m.id);
      total += m.valuePesewas;
      const key = item.inventoryAccountId ?? "role:inventory";
      const row = perAccount.get(key) ?? (item.inventoryAccountId ? { accountId: item.inventoryAccountId, total: 0 } : { role: "inventory", total: 0 });
      row.total += m.valuePesewas;
      perAccount.set(key, row);
    }
    if (total <= 0 || movements.length === 0) return null;
    const entry = await this.ledger.post(
      {
        companyId, userId, entryDate: date, description: description.slice(0, 240), sourceModule: "FIN_STOCK_OPENING", sourceId: movements[0], type: "OPENING", meta,
        lines: [
          ...[...perAccount.values()].filter((r) => r.total > 0).map((r) => ({ ...(r.accountId ? { accountId: r.accountId } : { role: r.role }), debit: pesewasToDecimal(r.total), description: "Opening stock" })),
          { role: "opening_equity", credit: pesewasToDecimal(total), description: "Opening stock" }
        ]
      },
      tx
    );
    for (const id of movements) await this.stock.linkJournal(tx, id, entry.id);
    return entry;
  }

  // ─── history and valuation ──────────────────────────────────────────────────

  async movements(companyId: string, q: MovementQueryDto) {
    const take = Math.min(Math.max(1, q.take ?? 50), 200);
    const page = Math.max(1, q.page ?? 1);
    const where: Prisma.FinStockMovementWhereInput = {
      companyId,
      ...(q.itemId ? { itemId: q.itemId } : {}),
      ...(q.type ? { type: q.type as never } : {}),
      ...(q.from || q.to ? { movementDate: { ...(q.from ? { gte: parseDay(q.from) } : {}), ...(q.to ? { lte: parseDay(q.to) } : {}) } } : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.finStockMovement.findMany({ where, orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take, include: { item: { select: { sku: true, name: true, unit: true } } } }),
      this.prisma.finStockMovement.count({ where })
    ]);
    return { rows: rows.map((m) => ({ ...presentMovement(m), sku: m.item.sku, itemName: m.item.name, unit: m.item.unit })), total, page, take };
  }

  /** Stock on hand and its value as at a date, from the movements, with a tie-out to the inventory accounts in the ledger. */
  async valuation(companyId: string, q: ValuationQueryDto) {
    const asOf = q.asOf ? parseDay(q.asOf) : parseDay(new Date());
    const sums = await this.prisma.finStockMovement.groupBy({ by: ["itemId"], where: { companyId, movementDate: { lte: asOf } }, _sum: { quantity: true, value: true } });
    const items = await this.prisma.finItem.findMany({ where: { companyId, trackStock: true }, orderBy: { name: "asc" } });
    const byItem = new Map(sums.map((s) => [s.itemId, s._sum]));
    let totalValue = 0;
    const rows = items
      .map((i) => {
        const s = byItem.get(i.id);
        const qty = qtyToMilli((s?.quantity ?? 0).toString());
        const value = decimalToPesewas(s?.value ?? 0);
        totalValue += value;
        return { id: i.id, sku: i.sku, name: i.name, unit: i.unit, category: i.category, qty, value, isActive: i.isActive, inventoryAccountId: i.inventoryAccountId };
      })
      .filter((r) => q.includeZero === "true" || r.qty !== 0 || r.value !== 0);
    // The ledger side: the default Inventory account plus any account an item points at.
    const roleAcc = await this.prisma.finAccount.findFirst({ where: { companyId, systemRole: "inventory" }, select: { id: true } });
    const accountIds = new Set<string>([...(roleAcc ? [roleAcc.id] : []), ...items.map((i) => i.inventoryAccountId).filter((x): x is string => !!x)]);
    let ledgerBalance = 0;
    for (const id of accountIds) ledgerBalance += await ledgerBalancePesewas(this.prisma, companyId, id, asOf);
    return {
      asOf: dayString(asOf),
      rows: rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name, unit: r.unit, category: r.category, isActive: r.isActive, quantity: milliToString(r.qty), value: pesewasToDecimal(r.value), avgCost: r.qty > 0 ? pesewasToDecimal(mulDivHalfUp(r.value, 1000, r.qty)) : "0.00" })),
      totalValue: pesewasToDecimal(totalValue),
      ledgerInventoryBalance: pesewasToDecimal(ledgerBalance),
      // Stock bought without a matching item (a manual journal to Inventory) shows here instead of being hidden.
      difference: pesewasToDecimal(ledgerBalance - totalValue)
    };
  }

  // ─── CSV ────────────────────────────────────────────────────────────────────

  async exportCsv(companyId: string) {
    const [rows, codes] = await Promise.all([this.prisma.finItem.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 20000 }), this.prisma.finTaxCode.findMany({ where: { companyId } })]);
    const code = new Map(codes.map((c) => [c.id, c.code]));
    return toCsv(CSV_HEADERS, rows.map((i) => [i.sku, i.name, i.barcode, i.kind === "SERVICE" ? "service" : "goods", i.unit, i.category, i.sellPrice.toFixed(2), i.priceIncludesTax ? "yes" : "no", i.taxCodeId ? code.get(i.taxCodeId) ?? "" : "", i.trackStock ? "yes" : "no", i.reorderLevel.toString(), "", "", i.externalRef]));
  }

  templateCsv() {
    return toCsv(CSV_HEADERS, [["FD-L1C", "Layer 1 C feed, 50 kg bag", "6001234567890", "goods", "bag", "Feed", "336.00", "yes", "", "yes", "20", "100", "310.00", ""], ["DEL", "Delivery", "", "service", "each", "Services", "50.00", "yes", "", "no", "", "", "", ""]]);
  }

  async analyseImport(companyId: string, csv: string): Promise<{ plans: ImportPlan[]; creates: { line: number; data: Prisma.FinItemUncheckedCreateInput; opening: { qtyMilli: number; cost4: number } | null; updateId?: string }[] }> {
    const { headers, rows } = parseCsvObjects(csv, CSV_ALIASES);
    for (const need of ["sku", "name"]) if (!headers.includes(need)) throw new BadRequestException(`The CSV needs a "${need}" column.`);
    const [existing, codes] = await Promise.all([this.prisma.finItem.findMany({ where: { companyId } }), this.prisma.finTaxCode.findMany({ where: { companyId, isActive: true } })]);
    const bySku = new Map(existing.map((i) => [i.sku.toLowerCase(), i]));
    const byBarcode = new Map(existing.filter((i) => i.barcode).map((i) => [i.barcode!.toLowerCase(), i]));
    const codeByName = new Map(codes.filter((c) => c.appliesTo !== "PURCHASES").map((c) => [c.code.toLowerCase(), c]));
    const seenSku = new Set<string>();
    const seenBarcode = new Set<string>();
    const plans: ImportPlan[] = [];
    const creates: { line: number; data: Prisma.FinItemUncheckedCreateInput; opening: { qtyMilli: number; cost4: number } | null; updateId?: string }[] = [];

    for (const r of rows) {
      const v = r.values;
      const sku = (v.sku ?? "").trim();
      const plan: ImportPlan = { line: r.line, sku, name: (v.name ?? "").trim(), action: "create", messages: [], warnings: [] };
      try {
        if (!sku) throw new BadRequestException("The SKU is empty.");
        if (!/^[A-Za-z0-9._\-/ ]{1,60}$/.test(sku)) throw new BadRequestException("The SKU can only use letters, digits, space and . _ - /");
        if (!plan.name || plan.name.length < 2) throw new BadRequestException("The name is empty.");
        if (seenSku.has(sku.toLowerCase())) throw new BadRequestException(`The SKU ${sku} appears twice in the file.`);
        seenSku.add(sku.toLowerCase());
        const barcode = blank(v.barcode);
        if (barcode) {
          if (seenBarcode.has(barcode.toLowerCase())) throw new BadRequestException(`The barcode ${barcode} appears twice in the file.`);
          seenBarcode.add(barcode.toLowerCase());
        }
        const found = bySku.get(sku.toLowerCase());
        const clash = barcode ? byBarcode.get(barcode.toLowerCase()) : undefined;
        if (clash && clash.id !== found?.id) throw new BadRequestException(`The barcode ${barcode} already belongs to ${clash.sku}.`);
        const kind = (v.type ?? "").trim().toLowerCase() === "service" ? "SERVICE" : "GOODS";
        const trackStock = kind === "SERVICE" ? false : yes(v.track_stock, true);
        const price = v.sell_price?.trim() ? toPesewas(v.sell_price, "The price") : 0;
        if (price < 0) throw new BadRequestException("The price cannot be negative.");
        let taxCodeId: string | null = null;
        if (v.tax_code?.trim()) {
          const t = codeByName.get(v.tax_code.trim().toLowerCase());
          if (!t) throw new BadRequestException(`The tax code "${v.tax_code}" is not an active sales tax code.`);
          taxCodeId = t.id;
        }
        const reorder = v.reorder_level?.trim() ? qtyToMilli(v.reorder_level, "The reorder level") : 0;
        let opening: { qtyMilli: number; cost4: number } | null = null;
        if (v.opening_qty?.trim()) {
          const q = qtyToMilli(v.opening_qty, "The opening quantity");
          if (q < 0) throw new BadRequestException("The opening quantity cannot be negative.");
          if (q > 0) {
            if (!trackStock) throw new BadRequestException("Opening stock needs an item that tracks stock.");
            if (found) plan.warnings.push("Opening stock is ignored: the item already exists. Use a stock adjustment instead.");
            else if (!v.opening_unit_cost?.trim()) throw new BadRequestException("Opening stock needs an opening_unit_cost.");
            else opening = { qtyMilli: q, cost4: costToTenThousandths(v.opening_unit_cost, "The opening unit cost") };
          }
        }
        plan.action = found ? "update" : "create";
        creates.push({
          line: r.line,
          updateId: found?.id,
          opening,
          data: {
            companyId, sku, name: plan.name.slice(0, 200), barcode, kind, unit: blank(v.unit) ?? "each", category: blank(v.category), sellPrice: pesewasToDecimal(price),
            priceIncludesTax: yes(v.price_includes_tax, true), taxCodeId, trackStock, reorderLevel: milliToString(reorder), externalRef: blank(v.external_ref)
          }
        });
      } catch (e) {
        plan.action = "error";
        plan.messages.push(e instanceof Error ? e.message : "Could not read this row.");
      }
      plans.push(plan);
    }
    return { plans, creates };
  }

  async previewImport(companyId: string, dto: ImportItemsDto) {
    const { plans } = await this.analyseImport(companyId, dto.csv);
    return { total: plans.length, toCreate: plans.filter((p) => p.action === "create").length, toUpdate: plans.filter((p) => p.action === "update").length, errors: plans.filter((p) => p.action === "error").length, plans: plans.slice(0, 500) };
  }

  async commitImport(companyId: string, userId: string, dto: ImportItemsDto, meta: RequestMeta) {
    const { plans, creates } = await this.analyseImport(companyId, dto.csv);
    const errors = plans.filter((p) => p.action === "error");
    if (errors.length > 0 && !dto.skipBadRows) throw new BadRequestException(`${errors.length} row(s) have problems, so nothing was imported. First problem: line ${errors[0].line}: ${errors[0].messages[0]}`);
    if (creates.length === 0) throw new BadRequestException("There are no items to import.");
    const date = dto.openingDate ?? dayString(new Date());
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      const openings: { itemId: string; qtyMilli: number; cost4: number }[] = [];
      for (const c of creates) {
        if (c.updateId) {
          const hasMovements = (await tx.finStockMovement.count({ where: { itemId: c.updateId } })) > 0;
          const { companyId: _c, sku: _s, trackStock, kind, unit, ...rest } = c.data;
          void _c; void _s;
          await tx.finItem.update({ where: { id: c.updateId }, data: { ...rest, updatedById: userId, ...(hasMovements ? {} : { trackStock, kind, unit }) } });
          updated++;
        } else {
          const id = randomUUID();
          await tx.finItem.create({ data: { ...c.data, id, createdById: userId } });
          created++;
          if (c.opening) openings.push({ itemId: id, ...c.opening });
        }
      }
      let openingValue = 0;
      if (openings.length) {
        const entry = await this.postOpening(tx, companyId, userId, openings, date, `Opening stock (import of ${openings.length} item${openings.length === 1 ? "" : "s"})`, meta);
        if (entry) {
          const j = await tx.finJournalEntry.findUnique({ where: { id: entry.id }, select: { totalDebit: true } });
          openingValue = decimalToPesewas(j?.totalDebit ?? 0);
        }
      }
      await this.audit.write({ companyId, userId, area: "items", action: "IMPORT", entityType: "FinItem", summary: `Imported items: ${created} new, ${updated} updated, ${errors.length} skipped`, after: { created, updated, skipped: errors.length, openingValue: pesewasToDecimal(openingValue) }, ...meta }, tx);
      return { created, updated, skipped: errors.length, openingValue: pesewasToDecimal(openingValue) };
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private async assertFree(db: FinDb, companyId: string, sku: string | null, barcode: string | null, exceptId?: string) {
    if (sku) {
      const dup = await db.finItem.findFirst({ where: { companyId, sku }, select: { id: true } });
      if (dup && dup.id !== exceptId) throw new ConflictException(`An item with the SKU ${sku} already exists.`);
    }
    if (barcode) {
      const dup = await db.finItem.findFirst({ where: { companyId, barcode }, select: { id: true, sku: true } });
      if (dup && dup.id !== exceptId) throw new ConflictException(`The barcode ${barcode} already belongs to ${dup.sku}.`);
    }
  }

  private async checkAccounts(db: FinDb, companyId: string, dto: { taxCodeId?: string | null; incomeAccountId?: string | null; cogsAccountId?: string | null; inventoryAccountId?: string | null }) {
    if (dto.taxCodeId) {
      const t = await db.finTaxCode.findFirst({ where: { id: dto.taxCodeId, companyId } });
      if (!t || !t.isActive || t.appliesTo === "PURCHASES") throw new BadRequestException("Choose an active tax code that applies to sales.");
    }
    const check = async (id: string | null | undefined, type: "REVENUE" | "EXPENSE" | "ASSET", label: string) => {
      if (!id) return;
      const a = await db.finAccount.findFirst({ where: { id, companyId } });
      if (!a || a.type !== type || !a.isPostable || !a.isActive) throw new BadRequestException(`Choose an active ${label} account that can be posted to.`);
    };
    await check(dto.incomeAccountId, "REVENUE", "income");
    await check(dto.cogsAccountId, "EXPENSE", "cost of goods sold");
    await check(dto.inventoryAccountId, "ASSET", "inventory");
  }
}

export function presentMovement(m: Prisma.FinStockMovementGetPayload<object>) {
  return {
    id: m.id,
    itemId: m.itemId,
    date: dayString(m.movementDate),
    type: m.type,
    quantity: m.quantity.toFixed(3),
    unitCost: m.unitCost.toFixed(4),
    value: m.value.toFixed(2),
    balanceQty: m.balanceQty.toFixed(3),
    balanceValue: m.balanceValue.toFixed(2),
    sourceModule: m.sourceModule,
    reference: m.reference,
    notes: m.notes,
    journalEntryId: m.journalEntryId,
    createdAt: m.createdAt
  };
}
