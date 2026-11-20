import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SalesLineDto } from "./dto/fin-sales.dto";
import { FinDb } from "./fin-audit.service";
import { LineMoney, computeLine, parsePercent, parseQuantity, sumLines, DocTotals } from "./fin-sales-math";
import { FinTaxService } from "./fin-tax.service";
import { pesewasToDecimal, toPesewas } from "./fin-money";

/** A line ready to be stored: every amount already worked out and formatted for the DECIMAL columns. */
export type PreparedLine = {
  lineNo: number;
  itemId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  discountAmount: string;
  taxCodeId: string | null;
  taxRatePercent: string;
  accountId: string | null;
  isCharge: boolean;
  lineNet: string;
  lineTax: string;
  lineTotal: string;
  money: LineMoney;
};

export function formatQuantity(q4: number): string {
  return `${Math.floor(q4 / 10_000)}.${String(q4 % 10_000).padStart(4, "0")}`;
}

export function formatPercent(hundredths: number): string {
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

/**
 * Validates caller lines and works out every amount. The tax percentage is looked up for the DOCUMENT'S date and
 * copied onto the line, so a later rate change never alters a document that already exists.
 */
export async function prepareLines(
  db: FinDb | PrismaService,
  tax: FinTaxService,
  companyId: string,
  input: SalesLineDto[],
  on: Date
): Promise<{ lines: PreparedLine[]; totals: DocTotals }> {
  if (!input?.length) throw new BadRequestException("Add at least one line.");

  const accountIds = [...new Set(input.map((l) => l.accountId).filter((x): x is string => !!x))];
  if (accountIds.length) {
    const found = await db.finAccount.findMany({ where: { id: { in: accountIds }, companyId }, select: { id: true, code: true, name: true, type: true, isActive: true, isPostable: true } });
    const byId = new Map(found.map((a) => [a.id, a]));
    for (const id of accountIds) {
      const a = byId.get(id);
      if (!a) throw new BadRequestException("One of the income accounts does not exist.");
      if (a.type !== "REVENUE") throw new BadRequestException(`${a.code} ${a.name} is not an income account.`);
      if (!a.isActive || !a.isPostable) throw new BadRequestException(`${a.code} ${a.name} cannot be posted to.`);
    }
  }

  const taxCache = new Map<string, string>();
  const lines: PreparedLine[] = [];
  for (let i = 0; i < input.length; i++) {
    const l = input[i];
    const label = `Line ${i + 1}`;
    const description = (l.description ?? "").trim();
    if (!description) throw new BadRequestException(`${label}: enter a description.`);

    let rate = "0.0000";
    if (l.taxCodeId) {
      if (!taxCache.has(l.taxCodeId)) {
        const t = await tax.resolve(companyId, l.taxCodeId, on, db);
        if (t.appliesTo === "PURCHASES") throw new BadRequestException(`${label}: the tax code ${t.code} is for purchases only.`);
        taxCache.set(l.taxCodeId, t.ratePercent);
      }
      rate = taxCache.get(l.taxCodeId)!;
    }

    let money: LineMoney;
    try {
      money = computeLine({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxRatePercent: rate });
    } catch (e) {
      throw new BadRequestException(`${label}: ${e instanceof Error ? e.message : "invalid amount"}`);
    }
    lines.push({
      lineNo: i + 1,
      itemId: l.itemId ?? null,
      description: description.slice(0, 300),
      quantity: formatQuantity(parseQuantity(l.quantity)),
      unitPrice: pesewasToDecimal(toPesewas(l.unitPrice, "The unit price")),
      discountPercent: formatPercent(parsePercent(l.discountPercent)),
      discountAmount: pesewasToDecimal(money.discount),
      taxCodeId: l.taxCodeId ?? null,
      taxRatePercent: rate,
      accountId: l.accountId ?? null,
      isCharge: l.isCharge ?? false,
      lineNet: pesewasToDecimal(money.net),
      lineTax: pesewasToDecimal(money.tax),
      lineTotal: pesewasToDecimal(money.total),
      money
    });
  }
  return { lines, totals: sumLines(lines.map((x) => x.money)) };
}

/** What Prisma wants for a nested lines.create / createMany (the helper's `money` is not a column). */
export function lineRows(lines: PreparedLine[]) {
  return lines.map(({ money: _money, ...row }) => {
    void _money;
    return row;
  });
}
