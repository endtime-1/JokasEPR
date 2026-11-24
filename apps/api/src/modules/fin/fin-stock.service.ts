import { randomUUID } from "crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FinStockMoveType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FinDb } from "./fin-audit.service";
import { parseDay } from "./fin-ledger.service";
import { decimalToPesewas, pesewasToDecimal } from "./fin-money";
import { costOfStockOut, milliToString, qtyToMilli, tenThousandthsToString, unitCost4, valueOfStockIn } from "./fin-stock-math";

export type StockMoveInput = {
  companyId: string;
  itemId: string;
  date: Date | string;
  type: FinStockMoveType;
  /** Signed: positive puts stock in, negative takes it out. */
  quantityMilli: number;
  /** For stock coming IN: what it cost, in ten-thousandths of a cedi per unit. Required for in-movements unless `valuePesewas` is given. */
  cost4?: number;
  /** For stock coming IN: the total value, when that is the figure you have (it wins over cost4). */
  valuePesewas?: number;
  /** For stock coming IN that undoes an earlier out-movement (a sale return): put it back at exactly this value. */
  sourceModule: string;
  sourceId: string;
  reference?: string;
  notes?: string;
  userId: string;
  /** Only a person with the override permission may sell below zero. When true the shortfall is taken at zero cost. */
  allowNegative?: boolean;
};

export type StockMoveResult = {
  id: string;
  itemId: string;
  quantityMilli: number;
  /** Signed value of the movement in pesewas: negative for stock out (that is the COGS), positive for stock in. */
  valuePesewas: number;
  balanceQtyMilli: number;
  balanceValuePesewas: number;
  created: boolean;
};

type ItemLock = { id: string; qtyOnHand: unknown; stockValue: unknown; trackStock: unknown; isActive: unknown; name: string; kind: string };

/**
 * The only place stock quantities change. Every change is one append-only fin_stock_movements row, written in the same
 * transaction as the update to the item's running quantity and value, under a row lock on the item, so two sellers can never
 * both take the last unit. Idempotent per (sourceModule, sourceId): a retry returns the movement it already made.
 */
@Injectable()
export class FinStockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Moves stock. Must be called with a transaction (`db`), so it commits or rolls back together with whatever else the caller posts. */
  async move(db: FinDb, input: StockMoveInput): Promise<StockMoveResult> {
    const { companyId } = input;
    const existing = await db.finStockMovement.findFirst({ where: { companyId, sourceModule: input.sourceModule, sourceId: input.sourceId } });
    if (existing) {
      return {
        id: existing.id,
        itemId: existing.itemId,
        quantityMilli: qtyToMilli(existing.quantity.toString()),
        valuePesewas: decimalToPesewas(existing.value),
        balanceQtyMilli: qtyToMilli(existing.balanceQty.toString()),
        balanceValuePesewas: decimalToPesewas(existing.balanceValue),
        created: false
      };
    }
    if (!Number.isInteger(input.quantityMilli) || input.quantityMilli === 0) throw new BadRequestException("The quantity must be more than zero.");

    // Lock the item row: the quantity and value we read are the ones we update.
    const rows = await db.$queryRaw<ItemLock[]>`SELECT id, name, kind, qtyOnHand, stockValue, trackStock, isActive FROM fin_items WHERE id = ${input.itemId} AND companyId = ${companyId} FOR UPDATE`;
    const item = rows[0];
    if (!item) throw new NotFoundException("That item does not exist.");
    if (!truthy(item.trackStock)) throw new BadRequestException(`${item.name} does not track stock.`);

    const onHand = qtyToMilli(String(item.qtyOnHand));
    const value = decimalToPesewas(String(item.stockValue));
    const qty = input.quantityMilli;
    let valueChange: number;

    if (qty > 0) {
      if (input.valuePesewas !== undefined) valueChange = input.valuePesewas;
      else if (input.cost4 !== undefined) valueChange = valueOfStockIn(qty, input.cost4);
      else throw new BadRequestException("Stock coming in needs a cost.");
      if (valueChange < 0) throw new BadRequestException("The value of stock coming in cannot be negative.");
    } else {
      const out = -qty;
      if (out > onHand && !input.allowNegative) {
        throw new BadRequestException(`Only ${milliToString(Math.max(onHand, 0))} of ${item.name} in stock, so ${milliToString(out)} cannot be taken out.`);
      }
      // Anything beyond what we hold is taken at zero cost; what we do hold is taken at the average.
      const covered = Math.max(Math.min(out, onHand), 0);
      valueChange = -costOfStockOut(value, onHand, covered);
    }

    const newQty = onHand + qty;
    const newValue = value + valueChange;
    const id = randomUUID();
    await db.finStockMovement.create({
      data: {
        id,
        companyId,
        itemId: input.itemId,
        movementDate: parseDay(input.date),
        type: input.type,
        quantity: milliToString(qty),
        unitCost: tenThousandthsToString(unitCost4(valueChange, qty)),
        value: pesewasToDecimal(valueChange),
        balanceQty: milliToString(newQty),
        balanceValue: pesewasToDecimal(newValue),
        sourceModule: input.sourceModule,
        sourceId: input.sourceId,
        reference: input.reference?.slice(0, 100),
        notes: input.notes?.slice(0, 300),
        createdById: input.userId
      }
    });
    // Raw UPDATE: Prisma's own update re-reads the row and may not see a row another transaction just committed.
    await db.$executeRaw`UPDATE fin_items SET qtyOnHand = ${milliToString(newQty)}, stockValue = ${pesewasToDecimal(newValue)}, updatedAt = NOW(3) WHERE id = ${input.itemId}`;
    return { id, itemId: input.itemId, quantityMilli: qty, valuePesewas: valueChange, balanceQtyMilli: newQty, balanceValuePesewas: newValue, created: true };
  }

  /** Records which ledger entry a movement was posted to. Allowed once, by the database's own rule. */
  async linkJournal(db: FinDb, movementId: string, journalEntryId: string) {
    await db.$executeRaw`UPDATE fin_stock_movements SET journalEntryId = ${journalEntryId} WHERE id = ${movementId} AND journalEntryId IS NULL`;
  }
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === 1n || v === "1";
}
