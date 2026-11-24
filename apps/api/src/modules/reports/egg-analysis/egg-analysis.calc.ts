/**
 * Egg analysis: follows the eggs from the farm's production records, into the farm egg store, across to the head-office
 * egg store, out through egg sales, and through every adjustment. Pure functions only (no database), so the same rules
 * can be tested with exact figures. All quantities are CRATES; eggs = crates x piecesPerUnit (normally 30).
 */

export type RawMovement = {
  id: string;
  warehouseId: string | null;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  type: string;
  qty: number;
  referenceType: string | null;
  referenceId: string | null;
  date: Date;
  notes: string | null;
};
export type RawRecord = { id: string; date: Date; eggs: number; deletedAt: Date | null; updatedAt: Date; house: string | null };
export type RawTransfer = { id: string; number: string; date: Date; qty: number; received: number | null; status: string; fromId: string; toId: string };
export type RawDiscrepancy = { transferNumber: string; expected: number; received: number; difference: number; status: string; resolution: string | null; reason: string | null };
export type RawSale = { id: string; number: string; warehouseId: string; date: Date; crates: number; amount: number; buyer: string | null };
export type RawAdjustment = { id: string; number: string; warehouseId: string; type: string; qty: number; status: string; reason: string | null; createdAt: Date; requestedById: string | null; approvedById: string | null; requestedBy: string | null; approvedBy: string | null };
export type RawWarehouse = { id: string; name: string; type: string; farm: string | null; retired: boolean };

export type RawEggData = {
  perCrate: number;
  today: Date;
  warehouses: RawWarehouse[];
  onHand: { warehouseId: string; qty: number }[];
  movements: RawMovement[];
  records: RawRecord[];
  transfers: RawTransfer[];
  discrepancies: RawDiscrepancy[];
  sales: RawSale[];
  deletedSaleCount: number;
  adjustments: RawAdjustment[];
};

export type Finding = { level: "OK" | "WATCH" | "INFO"; title: string; detail: string };

export type EggAnalysis = {
  generatedAt: string;
  period: { from: string | null; to: string };
  perCrate: number;
  stores: StoreBlock[];
  headline: {
    producedPerRecords: number;
    sold: number;
    heldAtFarm: number;
    heldAtSalesStores: number;
    notAccountedFor: number;
    notAccountedForPercent: number;
    estimatedValue: number | null;
    averagePricePerCrate: number | null;
  };
  bridge: { label: string; crates: number; note?: string }[];
  shrinkage: { label: string; crates: number }[];
  months: MonthRow[];
  productionGap: ProductionGap;
  transfers: { rows: TransferRow[]; summary: TransferSummary; discrepancies: RawDiscrepancy[] };
  sales: { byMonth: { month: string; sales: number; crates: number; amount: number; averagePrice: number | null }[]; total: { sales: number; crates: number; amount: number }; withoutStockOut: { number: string; date: string; crates: number }[]; deletedSaleCount: number };
  adjustments: AdjustmentRow[];
  findings: Finding[];
};

export type StoreBlock = {
  id: string; name: string; role: "FARM" | "SALES" | "OTHER"; farm: string | null; retired: boolean;
  opening: number; lines: { label: string; crates: number }[]; closing: number; systemOnHand: number; agrees: boolean | null;
};
export type MonthRow = { month: string; recorded: number; credited: number; systemCorrections: number; writeOffs: number; sentOut: number; received: number; sold: number; soldAmount: number };
export type TransferRow = { number: string; date: string; from: string; to: string; sent: number; received: number | null; status: string; shortBy: number };
export type TransferSummary = { sent: number; received: number; shortBy: number; onTheWay: number; waitingApproval: number; shortCount: number };
export type AdjustmentRow = { date: string; number: string; store: string; type: string; crates: number; status: string; reason: string; requestedBy: string; approvedBy: string; sameApprover: boolean };
export type ProductionGap = {
  recordedLive: number; creditedGross: number; systemCorrections: number; creditedNet: number; difference: number;
  deleted: { date: string; house: string; credited: number; reversed: number; net: number; deletedOn: string }[];
  edited: { date: string; house: string; recordNow: number; credited: number; difference: number; editedOn: string }[];
  neverCredited: { count: number; crates: number };
  untiedCredits: { count: number; crates: number };
  explained: number; unexplained: number;
};

const IN_TYPES = ["OPENING_BALANCE", "PURCHASE_RECEIPT", "PRODUCTION_OUTPUT", "ADJUSTMENT_IN", "RETURN_IN"];
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const day = (d: Date) => d.toISOString().slice(0, 10);
const month = (d: Date) => d.toISOString().slice(0, 7);
const sum = <T>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) < tol;

/** The same direction rule the Warehouse screen uses: a transfer leg is IN if it landed here; everything else by type. */
export function isIn(m: RawMovement, warehouseId: string): boolean {
  if (m.type === "TRANSFER") return m.toWarehouseId === warehouseId;
  return IN_TYPES.includes(m.type);
}

export function analyseEggs(raw: RawEggData, opts: { from?: Date | null; to?: Date | null } = {}): EggAnalysis {
  const per = raw.perCrate || 30;
  const from = opts.from ?? null;
  const to = opts.to ?? raw.today;
  const inRange = (d: Date) => (!from || d >= from) && d <= new Date(to.getTime() + 86_399_999);
  const before = (d: Date) => !!from && d < from;
  const names = new Map(raw.warehouses.map((w) => [w.id, w.name]));
  const nameOf = (id: string) => names.get(id) ?? "(unknown store)";

  // ── which stores are which ──
  const mv = raw.movements.filter((m) => m.warehouseId);
  const farmIds = new Set(mv.filter((m) => m.type === "PRODUCTION_OUTPUT").map((m) => m.warehouseId as string));
  const salesIds = new Set([...mv.filter((m) => m.type === "SALE_DISPATCH").map((m) => m.warehouseId as string), ...raw.sales.map((s) => s.warehouseId)]);
  for (const f of farmIds) salesIds.delete(f);
  const role = (id: string): "FARM" | "SALES" | "OTHER" => (farmIds.has(id) ? "FARM" : salesIds.has(id) ? "SALES" : "OTHER");
  const chain = (id: string) => role(id) !== "OTHER";
  const inMv = mv.filter((m) => inRange(m.date));
  const at = (ids: Set<string>) => (m: RawMovement) => ids.has(m.warehouseId as string);
  const atFarm = at(farmIds), atSales = at(salesIds);
  const isSystemCorrection = (m: RawMovement) => m.referenceType === "EggProductionRecord";

  // ── each store ──
  const onHandOf = new Map(raw.onHand.map((o) => [o.warehouseId, o.qty]));
  const storeIds = [...new Set([...mv.map((m) => m.warehouseId as string), ...raw.onHand.map((o) => o.warehouseId)])];
  const stores: StoreBlock[] = storeIds.map((id) => {
    const w = raw.warehouses.find((x) => x.id === id);
    const mine = mv.filter((m) => m.warehouseId === id);
    const opening = r4(sum(mine.filter((m) => before(m.date)), (m) => (isIn(m, id) ? m.qty : -m.qty)));
    const lines = new Map<string, number>();
    for (const m of mine.filter((m) => inRange(m.date))) {
      const out = !isIn(m, id);
      const label = `${out ? "Out" : "In"}: ${m.type === "TRANSFER" ? (out ? "transferred out" : "transferred in") : m.type === "PRODUCTION_OUTPUT" ? "production credited" : m.type === "SALE_DISPATCH" ? "egg sales" : m.type === "RETURN_IN" ? "returned to stock" : m.type === "ADJUSTMENT_OUT" ? (isSystemCorrection(m) ? "system reversal of a production record" : "stock adjustment") : m.type === "WASTE" ? "write-off / damage" : m.type === "PURCHASE_RECEIPT" ? "purchase receipt" : m.type === "ADJUSTMENT_IN" ? "stock adjustment" : m.type.toLowerCase()}`;
      lines.set(label, r4((lines.get(label) ?? 0) + (out ? -m.qty : m.qty)));
    }
    const closing = r4(opening + sum([...lines.values()], (v) => v));
    const systemOnHand = r4(onHandOf.get(id) ?? 0);
    const upToNow = to >= raw.today || near(to.getTime(), raw.today.getTime(), 86_400_000);
    return { id, name: nameOf(id), role: role(id), farm: w?.farm ?? null, retired: w?.retired ?? false, opening, lines: [...lines].map(([label, crates]) => ({ label, crates })).sort((a, b) => a.label.localeCompare(b.label)), closing, systemOnHand, agrees: upToNow ? near(closing, systemOnHand, 0.01) : null };
  }).sort((a, b) => ["FARM", "SALES", "OTHER"].indexOf(a.role) - ["FARM", "SALES", "OTHER"].indexOf(b.role) || a.name.localeCompare(b.name));

  // ── production vs stock ──
  const liveRecords = raw.records.filter((r) => !r.deletedAt && inRange(r.date));
  const recordedLive = r4(sum(liveRecords, (r) => r.eggs / per));
  const creditsAtFarm = inMv.filter(atFarm).filter((m) => m.type === "PRODUCTION_OUTPUT");
  const corrections = inMv.filter(atFarm).filter((m) => m.type === "ADJUSTMENT_OUT" && isSystemCorrection(m));
  const creditedGross = r4(sum(creditsAtFarm, (m) => m.qty));
  const systemCorrections = r4(sum(corrections, (m) => m.qty));
  const creditedNet = r4(creditedGross - systemCorrections);
  const tied = creditsAtFarm.filter((m) => m.referenceType === "EggProductionRecord");
  const untied = creditsAtFarm.filter((m) => m.referenceType !== "EggProductionRecord");
  const byRec = new Map(raw.records.map((r) => [r.id, r]));
  const creditFor = new Map<string, number>(), reverseFor = new Map<string, number>();
  for (const m of tied) creditFor.set(m.referenceId as string, (creditFor.get(m.referenceId as string) ?? 0) + m.qty);
  for (const m of corrections) reverseFor.set(m.referenceId as string, (reverseFor.get(m.referenceId as string) ?? 0) + m.qty);
  const deleted = [...creditFor].flatMap(([id, credited]) => {
    const r = byRec.get(id);
    if (r && !r.deletedAt) return [];
    const reversed = reverseFor.get(id) ?? 0;
    return [{ date: r ? day(r.date) : "", house: r?.house ?? "", credited: r4(credited), reversed: r4(reversed), net: r4(credited - reversed), deletedOn: r?.deletedAt ? day(r.deletedAt) : "" }];
  }).sort((a, b) => a.date.localeCompare(b.date));
  const edited = liveRecords.flatMap((r) => {
    if (!creditFor.has(r.id)) return [];
    const net = (creditFor.get(r.id) ?? 0) - (reverseFor.get(r.id) ?? 0);
    const diffEggs = Math.round(net * per - r.eggs);
    return Math.abs(diffEggs) >= 1 ? [{ date: day(r.date), house: r.house ?? "", recordNow: r.eggs, credited: Math.round(net * per), difference: diffEggs, editedOn: day(r.updatedAt) }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
  const never = liveRecords.filter((r) => !creditFor.has(r.id));
  const neverCrates = r4(sum(never, (r) => r.eggs / per));
  const untiedCrates = r4(sum(untied, (m) => m.qty));
  const deletedNet = sum(deleted, (d) => d.net);
  const editedCrates = r4(sum(edited, (e) => e.difference) / per);
  const difference = r4(creditedNet - recordedLive);
  const explained = r4(deletedNet + editedCrates + (untiedCrates - neverCrates));
  const productionGap: ProductionGap = { recordedLive, creditedGross, systemCorrections, creditedNet, difference, deleted, edited, neverCredited: { count: never.length, crates: neverCrates }, untiedCredits: { count: untied.length, crates: untiedCrates }, explained, unexplained: r4(difference - explained) };

  // ── transfers ──
  const trs = raw.transfers.filter((t) => inRange(t.date));
  const trRows: TransferRow[] = trs.map((t) => ({ number: t.number, date: day(t.date), from: nameOf(t.fromId), to: nameOf(t.toId), sent: r4(t.qty), received: t.received === null ? null : r4(t.received), status: t.status, shortBy: t.status === "COMPLETED" && t.received !== null && t.received < t.qty ? r4(t.qty - t.received) : 0 })).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const done = trs.filter((t) => t.status === "COMPLETED");
  const tSummary: TransferSummary = {
    sent: r4(sum(done, (t) => t.qty)), received: r4(sum(done, (t) => t.received ?? t.qty)), shortBy: r4(sum(trRows, (t) => t.shortBy)),
    onTheWay: r4(sum(trs.filter((t) => ["APPROVED", "IN_TRANSIT"].includes(t.status)), (t) => t.qty)), waitingApproval: r4(sum(trs.filter((t) => ["PENDING_APPROVAL", "DRAFT"].includes(t.status)), (t) => t.qty)), shortCount: trRows.filter((t) => t.shortBy > 0).length
  };
  const trNumbers = new Set(trs.map((t) => t.number));
  const discrepancies = raw.discrepancies.filter((d) => trNumbers.has(d.transferNumber));

  // ── sales ──
  const sales = raw.sales.filter((s) => inRange(s.date));
  const salesByMonth = new Map<string, { sales: number; crates: number; amount: number }>();
  for (const s of sales) { const k = month(s.date); const b = salesByMonth.get(k) ?? { sales: 0, crates: 0, amount: 0 }; b.sales++; b.crates += s.crates; b.amount += s.amount; salesByMonth.set(k, b); }
  const dispatchFor = new Map<string, number>();
  for (const m of mv.filter((m) => m.type === "SALE_DISPATCH" && m.referenceType === "EggSale")) dispatchFor.set(m.referenceId as string, (dispatchFor.get(m.referenceId as string) ?? 0) + m.qty);
  const withoutStockOut = sales.filter((s) => !dispatchFor.has(s.id)).map((s) => ({ number: s.number, date: day(s.date), crates: r4(s.crates) }));
  const salesTotal = { sales: sales.length, crates: r4(sum(sales, (s) => s.crates)), amount: Math.round(sum(sales, (s) => s.amount) * 100) / 100 };
  const avgPrice = salesTotal.crates > 0 ? Math.round((salesTotal.amount / salesTotal.crates) * 100) / 100 : null;

  // ── adjustments ──
  const adjustments: AdjustmentRow[] = raw.adjustments.filter((a) => inRange(a.createdAt)).map((a) => ({ date: day(a.createdAt), number: a.number, store: nameOf(a.warehouseId), type: a.type, crates: r4(a.qty), status: a.status, reason: a.reason ?? "", requestedBy: a.requestedBy ?? "", approvedBy: a.approvedBy ?? "", sameApprover: !!a.requestedById && a.requestedById === a.approvedById })).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  // ── months ──
  const months = new Map<string, MonthRow>();
  const mrow = (k: string) => months.get(k) ?? months.set(k, { month: k, recorded: 0, credited: 0, systemCorrections: 0, writeOffs: 0, sentOut: 0, received: 0, sold: 0, soldAmount: 0 }).get(k)!;
  for (const r of liveRecords) mrow(month(r.date)).recorded += r.eggs / per;
  for (const m of inMv.filter(atFarm)) {
    const row = mrow(month(m.date));
    if (m.type === "PRODUCTION_OUTPUT") row.credited += m.qty;
    else if (m.type === "ADJUSTMENT_OUT" && isSystemCorrection(m)) row.systemCorrections += m.qty;
    else if (m.type === "ADJUSTMENT_OUT" || m.type === "WASTE") row.writeOffs += m.qty;
    else if (m.type === "ADJUSTMENT_IN") row.writeOffs -= m.qty;
    else if (m.type === "TRANSFER" && !isIn(m, m.warehouseId as string)) row.sentOut += m.qty;
  }
  for (const m of inMv.filter(atSales)) { const row = mrow(month(m.date)); if (m.type === "TRANSFER" && isIn(m, m.warehouseId as string)) row.received += m.qty; if (m.type === "SALE_DISPATCH") row.sold += m.qty; if (m.type === "RETURN_IN") row.sold -= m.qty; }
  for (const s of sales) mrow(month(s.date)).soldAmount += s.amount;
  const monthRows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, recorded: r4(m.recorded), credited: r4(m.credited), systemCorrections: r4(m.systemCorrections), writeOffs: r4(m.writeOffs), sentOut: r4(m.sentOut), received: r4(m.received), sold: r4(m.sold), soldAmount: Math.round(m.soldAmount * 100) / 100 }));

  // ── where the eggs went ──
  const chainStores = stores.filter((s) => s.role !== "OTHER");
  const openingTotal = r4(sum(chainStores, (s) => s.opening));
  const closingFarm = r4(sum(chainStores.filter((s) => s.role === "FARM"), (s) => s.closing));
  const closingSales = r4(sum(chainStores.filter((s) => s.role === "SALES"), (s) => s.closing));
  const chainMv = inMv.filter((m) => chain(m.warehouseId as string));
  const soldNet = r4(sum(chainMv.filter((m) => m.type === "SALE_DISPATCH"), (m) => m.qty) - sum(chainMv.filter((m) => m.type === "RETURN_IN"), (m) => m.qty));
  const purchases = r4(sum(chainMv.filter((m) => m.type === "PURCHASE_RECEIPT" || m.type === "OPENING_BALANCE"), (m) => m.qty));
  const writeOffsNet = r4(sum(chainMv.filter((m) => (m.type === "ADJUSTMENT_OUT" && !isSystemCorrection(m)) || m.type === "WASTE"), (m) => m.qty) - sum(chainMv.filter((m) => m.type === "ADJUSTMENT_IN"), (m) => m.qty));
  const farmWriteOffs = r4(sum(chainMv.filter(atFarm).filter((m) => (m.type === "ADJUSTMENT_OUT" && !isSystemCorrection(m)) || m.type === "WASTE"), (m) => m.qty));
  const lostInTransit = tSummary.shortBy;
  const notAccounted = r4(openingTotal + recordedLive + purchases - soldNet - closingFarm - closingSales);
  const overCredit = r4(creditedNet - recordedLive);
  const otherDiff = r4(notAccounted - (writeOffsNet + lostInTransit - overCredit));
  const shrinkage = [
    { label: "Written off or corrected by approved stock adjustments", crates: writeOffsNet },
    { label: "Lost in transit (received short at the head office)", crates: lostInTransit },
    { label: "Less: stock credited for production that the records no longer show (not corrected)", crates: r4(-overCredit) },
    ...(Math.abs(otherDiff) >= 0.01 ? [{ label: "Other / unexplained", crates: otherDiff }] : [])
  ];
  const bridge = [
    ...(Math.abs(openingTotal) >= 0.01 ? [{ label: "Eggs already in stock at the start of the period", crates: openingTotal }] : []),
    { label: "Eggs produced, per the farm's production records", crates: recordedLive },
    ...(Math.abs(purchases) >= 0.01 ? [{ label: "Eggs bought / opening balances", crates: purchases }] : []),
    { label: "Eggs sold (egg sales, net of returns)", crates: -soldNet },
    { label: "Eggs in the farm egg store now", crates: -closingFarm },
    { label: "Eggs in the head-office egg store now", crates: -closingSales },
    { label: "NOT ACCOUNTED FOR (production records minus sales and stock)", crates: notAccounted, note: "Explained in the next table" }
  ];
  const pct = recordedLive > 0 ? Math.round((notAccounted / recordedLive) * 10_000) / 100 : 0;

  // ── plain-language findings ──
  const findings: Finding[] = [];
  for (const s of chainStores) findings.push(s.agrees === null ? { level: "INFO", title: `${s.name}: closing stock`, detail: `${r4(s.closing)} crates at the end of the period.` } : s.agrees ? { level: "OK", title: `${s.name}: stock agrees with its records`, detail: `The stock movements say ${r4(s.closing)} crates (${Math.round(s.closing * per).toLocaleString("en-GB")} eggs) and the system shows the same.` } : { level: "WATCH", title: `${s.name}: stock does NOT agree with its records`, detail: `Movements say ${r4(s.closing)} crates but the system shows ${s.systemOnHand}. The difference needs explaining.` });
  if (tSummary.shortBy > 0.001) findings.push({ level: "WATCH", title: "Eggs lost in transit", detail: `${tSummary.shortCount} transfer(s) were received short, ${tSummary.shortBy} crates (${Math.round(tSummary.shortBy * per)} eggs) in total. ${discrepancies.filter((d) => d.status === "RESOLVED").length} of ${discrepancies.length} discrepancy record(s) are resolved.` });
  else findings.push({ level: "OK", title: "Transfers", detail: "Everything sent to the head office was received in full." });
  if (tSummary.onTheWay > 0.001) findings.push({ level: "WATCH", title: "Eggs still on the way", detail: `${tSummary.onTheWay} crates were approved for transfer but not yet received.` });
  if (tSummary.waitingApproval > 0.001) findings.push({ level: "INFO", title: "Transfers waiting for approval", detail: `${tSummary.waitingApproval} crates (stock has not moved yet).` });
  if (deleted.length) findings.push(deleted.every((d) => Math.abs(d.net) < 0.001) ? { level: "OK", title: "Deleted production records", detail: `${deleted.length} record(s) were deleted after their stock was credited, and the system reversed the credit (${r4(sum(deleted, (d) => d.credited))} crates).` } : { level: "WATCH", title: "Deleted production records still credited", detail: `${deleted.filter((d) => Math.abs(d.net) >= 0.001).length} deleted record(s) still have stock credited: ${r4(sum(deleted, (d) => d.net))} crates.` });
  if (edited.length) findings.push({ level: "WATCH", title: "Production records edited after their stock was credited", detail: `${edited.length} record(s) now show a different egg count than was credited to stock: net ${sum(edited, (e) => e.difference)} eggs (${editedCrates} crates). The stock was not corrected for these.` });
  if (never.length && Math.abs(untiedCrates - neverCrates) >= 0.05) findings.push({ level: "WATCH", title: "Production records that never reached stock", detail: `${never.length} record(s) (${neverCrates} crates) did not credit the store, and the older per-day credits (${untiedCrates} crates) do not cover them exactly.` });
  const same = adjustments.filter((a) => a.sameApprover).length;
  if (adjustments.length) findings.push({ level: same ? "WATCH" : "OK", title: "Stock adjustments", detail: `${adjustments.length} adjustment(s), ${r4(sum(adjustments, (a) => a.crates))} crates in total.${same ? ` ${same} of them were approved by the same person who entered them, so nobody else reviewed them.` : ""}` });
  const pendingAdj = adjustments.filter((a) => a.status !== "APPROVED" && a.status !== "REJECTED" && a.status !== "CANCELLED").length;
  if (pendingAdj) findings.push({ level: "INFO", title: "Adjustments not yet approved", detail: `${pendingAdj} adjustment(s) are still waiting.` });
  if (withoutStockOut.length) findings.push({ level: "WATCH", title: "Egg sales that took no stock out", detail: `${withoutStockOut.length} sale(s) did not reduce the egg stock, so stock may be overstated.` });
  if (raw.deletedSaleCount > 0) findings.push({ level: "INFO", title: "Deleted egg sales", detail: `${raw.deletedSaleCount} sale(s) were deleted. Their stock was put back, so they do not affect the totals.` });
  findings.push({ level: pct > 0.5 ? "WATCH" : "INFO", title: "Eggs not accounted for", detail: `${notAccounted} crates (${Math.round(notAccounted * per).toLocaleString("en-GH")} eggs), ${pct}% of recorded production, vanished between the production records and the sales and stock. See the next table for the reasons.${avgPrice !== null ? ` At the average selling price (GHS ${avgPrice} a crate) that is about GHS ${(Math.round(notAccounted * avgPrice * 100) / 100).toLocaleString("en-GH")}.` : ""}` });
  void farmWriteOffs;

  return {
    generatedAt: new Date().toISOString(), period: { from: from ? day(from) : null, to: day(to) }, perCrate: per, stores,
    headline: { producedPerRecords: recordedLive, sold: soldNet, heldAtFarm: closingFarm, heldAtSalesStores: closingSales, notAccountedFor: notAccounted, notAccountedForPercent: pct, estimatedValue: avgPrice === null ? null : Math.round(notAccounted * avgPrice * 100) / 100, averagePricePerCrate: avgPrice },
    bridge, shrinkage, months: monthRows, productionGap,
    transfers: { rows: trRows, summary: tSummary, discrepancies },
    sales: { byMonth: [...salesByMonth].sort(([a], [b]) => a.localeCompare(b)).map(([m, b]) => ({ month: m, sales: b.sales, crates: r4(b.crates), amount: Math.round(b.amount * 100) / 100, averagePrice: b.crates > 0 ? Math.round((b.amount / b.crates) * 100) / 100 : null })), total: salesTotal, withoutStockOut, deletedSaleCount: raw.deletedSaleCount },
    adjustments, findings
  };
}
