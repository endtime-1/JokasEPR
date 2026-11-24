import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The ONLY place finance reads another module's tables. It is read-only, and it sits behind an interface so the rest of
 * finance (and its tests) never touch the other module's schema. Nothing in the other modules is changed or called.
 */

/** A confirmed sales order, already converted to whole pesewas. */
export type SourceOrder = {
  id: string;
  orderNumber: string;
  orderDate: Date;
  approvedAt: Date;
  status: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  notes: string | null;
  discountPesewas: number;
  taxPesewas: number;
  totalPesewas: number;
  lines: { description: string; quantity: string; lineTotalPesewas: number }[];
};

export interface SalesOrderSource {
  /** Orders confirmed (approved or later, never cancelled) at or after `since`, oldest first, skipping `excludeIds`. */
  listConfirmed(companyId: string, since: Date, excludeIds: string[], limit: number): Promise<SourceOrder[]>;
  /** Current status of the given orders (e.g. CANCELLED), so a finance draft can be flagged when its order is cancelled. */
  statuses(companyId: string, ids: string[]): Promise<Map<string, string>>;
}

export const SALES_ORDER_SOURCE = Symbol("FIN_SALES_ORDER_SOURCE");

/** A Prisma Decimal(18,4) (or number/string) as whole pesewas, rounding half up. */
export function decimalToPesewasRounded(value: { toString(): string } | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return 0;
  const negative = raw.startsWith("-");
  const [whole, frac = ""] = raw.replace("-", "").split(".");
  const tenThousandths = Number(whole) * 10_000 + Number((frac + "0000").slice(0, 4));
  const pesewas = Math.floor((tenThousandths + 50) / 100);
  return negative ? -pesewas : pesewas;
}

/** A quantity as a plain decimal string with at most 4 decimals and no trailing zeros. */
export function quantityString(value: { toString(): string } | number | string): string {
  const raw = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return "0";
  const [whole, frac = ""] = raw.split(".");
  const f = frac.slice(0, 4).replace(/0+$/, "");
  return f ? `${whole}.${f}` : whole;
}

@Injectable()
export class PrismaSalesOrderSource implements SalesOrderSource {
  constructor(private readonly prisma: PrismaService) {}

  async listConfirmed(companyId: string, since: Date, excludeIds: string[], limit: number): Promise<SourceOrder[]> {
    const rows = await this.prisma.salesOrder.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["APPROVED", "FULFILLED"] },
        stockApprovedAt: { gte: since },
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {})
      },
      orderBy: [{ stockApprovedAt: "asc" }, { id: "asc" }],
      take: limit,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        items: { include: { product: { select: { name: true, sku: true } } }, orderBy: { createdAt: "asc" } }
      }
    });
    return rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      orderDate: o.orderDate,
      approvedAt: o.stockApprovedAt ?? o.orderDate,
      status: o.status,
      customerId: o.customer.id,
      customerName: o.customer.name,
      customerPhone: o.customer.phone,
      customerEmail: o.customer.email,
      notes: o.notes,
      discountPesewas: decimalToPesewasRounded(o.discountAmount),
      taxPesewas: decimalToPesewasRounded(o.taxAmount),
      totalPesewas: decimalToPesewasRounded(o.totalAmount),
      lines: o.items.map((i) => ({
        description: i.product.sku ? `${i.product.name} (${i.product.sku})` : i.product.name,
        quantity: quantityString(i.quantity),
        lineTotalPesewas: decimalToPesewasRounded(i.lineTotal)
      }))
    }));
  }

  async statuses(companyId: string, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.salesOrder.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, status: true, deletedAt: true } });
    return new Map(rows.map((r) => [r.id, r.deletedAt ? "CANCELLED" : r.status]));
  }
}
