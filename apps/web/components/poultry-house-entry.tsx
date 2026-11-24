"use client";

// Whole-house entry for the Egg, Feed and Mortality record screens: pick a house and each of its pens appears as a
// small form, so the whole house is filled in and saved once instead of pen after pen. See lib/poultry-house-entry.ts
// for the rules. Every pen is saved with the same endpoint, and the same server checks, as the single-pen form;
// a pen the server turns down is reported next to that pen and does not stop the others.
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, CircleAlert, CircleCheckBig } from "lucide-react";
import { apiFetch } from "../lib/api";
import {
  EXTRA_EGG_FIELDS,
  HOUSE_FIELDS,
  LAYING_BIRD_TYPES,
  RECORDS_PAGE_SIZE,
  buildPenRows,
  cratesToEggs,
  eggsText,
  feedText,
  fieldsUsedBy,
  isConnectionProblem,
  newKey,
  planRow,
  recordedFor,
  recordsCoverDate,
  type FieldDef,
  type HouseEntryOptions,
  type HouseEntryType,
  type RowPlan
} from "../lib/poultry-house-entry";

type StockOption = { id: string; code?: string; sku?: string; name: string };

export type HouseEntryGridOptions = HouseEntryOptions & {
  warehouses: StockOption[];
  products: StockOption[];
  feedProducts?: StockOption[];
};

export type HouseEntryGridProps = {
  type: HouseEntryType;
  /** The create endpoint of this record screen, e.g. /poultry/egg-production-records. */
  endpoint: string;
  houseId: string;
  /** Optional: only the pens holding this batch. */
  batchId: string;
  recordDate: string;
  options: HouseEntryGridOptions;
  /** The screen's own store/product defaults for a batch (warehouseId, eggProductId / feedProductId). */
  defaultsForBatch: (batchId: string) => Record<string, string>;
  /** The records the screen has loaded, to show what each pen already has for the date. */
  records: Record<string, unknown>[];
  /** Called after a save so the screen reloads its list. */
  onSaved: () => void;
};

type RowOutcome = { saved: string[]; warnings: string[]; errors: string[] };
type Banner = { tone: "success" | "warning" | "error" | "info"; text: string };
type StockPick = { warehouseId?: string; productId?: string; secondsProductId?: string };

const COLUMNS: Record<HouseEntryType, string> = {
  eggs: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
  feed: "grid-cols-2",
  mortality: "grid-cols-2 sm:grid-cols-4"
};

const BANNER_STYLE: Record<Banner["tone"], string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-line bg-field text-ink/80"
};

const stockLabel = (o: StockOption) => [o.sku ?? o.code, o.name].filter(Boolean).join(" — ");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function StockSelect({ label, value, options, onChange }: { label: string; value: string; options: StockOption[]; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-ink/70">
      <span>{label}</span>
      <select className="min-h-11 rounded-md border border-line px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— none —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{stockLabel(o)}</option>
        ))}
      </select>
    </label>
  );
}

export function HouseEntryGrid({ type, endpoint, houseId, batchId, recordDate, options, defaultsForBatch, records, onSaved }: HouseEntryGridProps) {
  const rows = useMemo(() => buildPenRows(options, houseId, batchId), [options, houseId, batchId]);
  const fields = HOUSE_FIELDS[type];

  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({});
  const [batchPick, setBatchPick] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Record<string, RowOutcome>>({});
  const [stockPick, setStockPick] = useState<StockPick>({});
  const [moreEggBoxes, setMoreEggBoxes] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [banner, setBanner] = useState<Banner | null>(null);

  const savingRef = useRef(false);
  const mounted = useRef(true);
  const keys = useRef(new Map<string, { fingerprint: string; key: string }>());
  const rootRef = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Store and product: the screen's own defaults for the first batch in the house, unless the person changed them.
  const firstBatchId = rows.find((r) => r.batches.length > 0)?.batches[0]?.id ?? "";
  const defaults = firstBatchId ? defaultsForBatch(firstBatchId) : {};
  const warehouseId = stockPick.warehouseId ?? defaults.warehouseId ?? "";
  const productId = stockPick.productId ?? (type === "eggs" ? defaults.eggProductId : defaults.feedProductId) ?? "";
  const secondsProductId = stockPick.secondsProductId ?? "";
  const feedProducts = options.feedProducts?.length ? options.feedProducts : options.products;

  const covered = recordsCoverDate(records, recordDate, RECORDS_PAGE_SIZE);
  const view = rows.map((row) => {
    const batch = row.batches.find((b) => b.id === batchPick[row.penId]) ?? row.batches[0];
    let blocked = "";
    if (!batch) blocked = "No birds in this pen right now.";
    else if (type === "eggs" && !LAYING_BIRD_TYPES.includes(batch.birdType)) blocked = `Batch ${batch.code} is not a laying flock, so it has no egg records.`;
    const plan: RowPlan =
      !batch || blocked
        ? { parts: [] }
        : planRow(type, row, batch, inputs[row.penId] ?? {}, { recordDate, warehouseId, productId, secondsProductId });
    return { row, batch, blocked, plan, recorded: covered ? recordedFor(type, records, row.penId, recordDate) : null };
  });
  const ready = view.filter((v) => v.plan.parts.length > 0);
  const problems = view.filter((v) => v.plan.error);

  function setField(penId: string, key: string, value: string) {
    setInputs((prev) => {
      const next = { ...(prev[penId] ?? {}), [key]: value };
      if (type === "eggs" && key === "crates") next.goodEggs = cratesToEggs(value);
      return { ...prev, [penId]: next };
    });
    setOutcome((prev) => {
      if (!prev[penId]) return prev;
      const next = { ...prev };
      delete next[penId];
      return next;
    });
    setBanner(null);
  }

  function clearFields(penId: string, keysToClear: string[]) {
    setInputs((prev) => {
      const next = { ...(prev[penId] ?? {}) };
      for (const k of keysToClear) next[k] = "";
      return { ...prev, [penId]: next };
    });
  }

  // Enter moves down the same column, to the next pen, like a sheet. After the last pen it lands on Save.
  function onCellKeyDown(event: KeyboardEvent<HTMLInputElement>, col: string) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const column = Array.from(root.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]:not(:disabled)`));
    const next = column[column.indexOf(event.currentTarget) + 1];
    if (next) {
      next.focus();
      try {
        next.select();
      } catch {
        /* some inputs cannot select; focus is enough */
      }
    } else saveButton.current?.focus();
  }

  // One key per pen and kind. The same figures sent again (after a dropped connection) reuse it, so the server
  // recognises the repeat and does not record it twice; changed figures get a fresh key.
  function keyFor(id: string, fingerprint: string): string {
    const known = keys.current.get(id);
    if (known && known.fingerprint === fingerprint) return known.key;
    const key = newKey();
    keys.current.set(id, { fingerprint, key });
    return key;
  }

  async function saveAll() {
    if (savingRef.current) return;
    if (!recordDate) {
      setBanner({ tone: "error", text: "Choose the record date first." });
      return;
    }
    if (ready.length === 0) {
      setBanner({
        tone: problems.length ? "error" : "info",
        text: problems.length ? "Nothing was saved. Fix the red messages and try again." : "Nothing to save yet. Type an amount for at least one pen."
      });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setBanner(null);
    const total = ready.reduce((n, v) => n + v.plan.parts.length, 0);
    setProgress({ done: 0, total });

    let done = 0;
    let stopped = false;
    const finished = new Map<string, RowOutcome>();
    for (const item of ready) {
      const out: RowOutcome = { saved: [], warnings: [], errors: [] };
      let allSaved = true;
      for (const part of item.plan.parts) {
        if (stopped) {
          out.errors.push(`${part.label}: not sent because the connection failed. Press Save again.`);
          allSaved = false;
          continue;
        }
        try {
          const response = await apiFetch<{ warning?: string }>(endpoint, {
            method: "POST",
            body: JSON.stringify({ ...part.payload, idempotencyKey: keyFor(part.id, JSON.stringify(part.payload)) })
          });
          keys.current.delete(part.id);
          out.saved.push(part.summary);
          if (response?.warning) out.warnings.push(response.warning);
          if (mounted.current) clearFields(part.penId, fieldsUsedBy(part));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not save.";
          out.errors.push(`${part.label}: ${message}`);
          allSaved = false;
          if (isConnectionProblem(message)) stopped = true;
        }
        done += 1;
        if (mounted.current) setProgress({ done, total });
      }
      // A mortality pen's reason belongs to its deaths and culls; clear it once they are all saved.
      if (allSaved && type === "mortality" && mounted.current) clearFields(item.row.penId, ["reason"]);
      finished.set(item.row.penId, out);
      if (mounted.current) setOutcome((prev) => ({ ...prev, [item.row.penId]: out }));
    }

    savingRef.current = false;
    onSaved();
    if (!mounted.current) return;
    setSaving(false);

    const pensSaved = [...finished.values()].filter((o) => o.saved.length > 0 && o.errors.length === 0).length;
    const pensFailed = [...finished.values()].filter((o) => o.errors.length > 0).length + problems.length;
    const anySaved = [...finished.values()].some((o) => o.saved.length > 0);
    if (pensFailed === 0) setBanner({ tone: "success", text: `Saved ${plural(pensSaved, "pen", "pens")}.` });
    else if (anySaved) {
      // A pen can be saved in part (deaths went in, culls did not), so do not say "0 pens saved" in that case.
      const lead = pensSaved > 0 ? `Saved ${plural(pensSaved, "pen", "pens")}.` : "Some records were saved.";
      setBanner({ tone: "warning", text: `${lead} ${plural(pensFailed, "pen needs", "pens need")} attention, see the red messages below. Press Save again to send only those.` });
    } else setBanner({ tone: "error", text: `Nothing was saved. ${plural(pensFailed, "pen needs", "pens need")} attention, see the red messages below.` });

    setTimeout(() => {
      rootRef.current?.querySelector('[data-failed="true"]')?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 60);
  }

  function renderField(f: FieldDef, penId: string, penNumber: number, value: string, hideOnPhone: boolean) {
    const numeric = f.kind !== "text";
    return (
      <label key={f.key} className={`${hideOnPhone ? "hidden sm:grid" : "grid"} gap-1 text-xs font-medium text-ink/70 ${f.key === "reason" ? "col-span-2" : ""}`}>
        <span>{f.label}</span>
        <input
          type={numeric ? "number" : "text"}
          inputMode={f.kind === "int" ? "numeric" : f.kind === "decimal" ? "decimal" : undefined}
          min={numeric ? 0 : undefined}
          step={f.kind === "int" ? 1 : f.kind === "decimal" ? "any" : undefined}
          value={value}
          disabled={saving}
          data-col={f.key}
          aria-label={`Pen ${penNumber} ${f.label}`}
          onChange={(e) => setField(penId, f.key, e.target.value)}
          onKeyDown={(e) => onCellKeyDown(e, f.key)}
          onWheel={numeric ? (e) => e.currentTarget.blur() : undefined}
          className={`min-h-11 w-full rounded-md border border-line px-2 text-sm ${numeric ? "text-right tabular-nums" : ""}`}
        />
      </label>
    );
  }

  const intro = "Every pen in this house is listed. Fill in the pens you want to record and save once. Pens left blank are skipped. To record a single pen, choose it in the Pen box above.";

  return (
    <div ref={rootRef} className="grid gap-3">
      <p className="text-xs text-ink/60">{intro}</p>

      {type !== "mortality" && rows.some((r) => r.batches.length > 0) && (
        <div className={`grid gap-3 rounded-md border border-line p-3 ${type === "eggs" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {type === "eggs" ? (
            <>
              <StockSelect label="Egg store" value={warehouseId} options={options.warehouses} onChange={(v) => setStockPick((p) => ({ ...p, warehouseId: v }))} />
              <StockSelect label="Egg product (eggs go into stock)" value={productId} options={options.products} onChange={(v) => setStockPick((p) => ({ ...p, productId: v }))} />
              <StockSelect label="Seconds product (cracked and dirty, optional)" value={secondsProductId} options={options.products} onChange={(v) => setStockPick((p) => ({ ...p, secondsProductId: v }))} />
            </>
          ) : (
            <>
              <StockSelect label="Feed product (comes out of stock)" value={productId} options={feedProducts} onChange={(v) => setStockPick((p) => ({ ...p, productId: v }))} />
              <StockSelect label="Feed store" value={warehouseId} options={options.warehouses} onChange={(v) => setStockPick((p) => ({ ...p, warehouseId: v }))} />
            </>
          )}
          {(!warehouseId || !productId) && (
            <p className="text-xs text-amber-700 sm:col-span-3">
              {type === "eggs"
                ? "Without an egg store and an egg product the eggs are recorded but not added to stock."
                : "Without a feed product and a feed store the feed is recorded but not taken out of stock."}
            </p>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <p className="rounded-md border border-line bg-field px-3 py-2 text-sm text-ink/70">
          {batchId ? "This batch has no birds in this house." : "This house has no pens yet. Add pens on the Poultry Houses page."}
        </p>
      )}
      {rows.length > 0 && rows.every((r) => r.batches.length === 0) && (
        <p className="rounded-md border border-line bg-field px-3 py-2 text-sm text-ink/70">No pen in this house holds birds right now, so there is nothing to record.</p>
      )}

      {view.map(({ row, batch, blocked, plan, recorded }) => {
        const result = outcome[row.penId];
        const failed = !!plan.error || (result?.errors.length ?? 0) > 0;
        const tone = failed ? "border-red-300 bg-red-50/40" : result && result.saved.length > 0 ? "border-green-300 bg-green-50/40" : "border-line";
        const typed = inputs[row.penId] ?? {};
        // On a phone the four rarely used egg boxes sit behind a toggle, and open by themselves once something is typed in them.
        const showExtra = !!moreEggBoxes[row.penId] || EXTRA_EGG_FIELDS.some((k) => (typed[k] ?? "") !== "");
        return (
          <div
            key={row.penId}
            data-pen-row={row.penId}
            data-failed={failed ? "true" : undefined}
            className={`rounded-lg border p-3 md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:items-start md:gap-4 ${tone} ${blocked ? "opacity-70" : ""}`}
          >
            <div className="mb-2 grid gap-1 md:mb-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-ink">Pen {row.penNumber}</span>
                <span className="text-xs text-ink/50">{row.penName ? `${row.penCode} · ${row.penName}` : row.penCode}</span>
              </div>
              {batch && row.batches.length > 1 ? (
                <select
                  aria-label={`Pen ${row.penNumber} batch`}
                  className="min-h-9 rounded-md border border-line px-2 text-xs"
                  value={batch.id}
                  disabled={saving}
                  onChange={(e) => setBatchPick((p) => ({ ...p, [row.penId]: e.target.value }))}
                >
                  {row.batches.map((b) => (
                    <option key={b.id} value={b.id}>Batch {b.code}</option>
                  ))}
                </select>
              ) : (
                batch && <span className="text-xs text-ink/60">Batch {batch.code}</span>
              )}
              {recorded && (
                <span className="w-fit rounded bg-field px-1.5 py-0.5 text-xs text-ink/70">Already recorded for this date: {recorded.text}</span>
              )}
            </div>

            {blocked ? (
              <p className="text-sm text-ink/60">{blocked}</p>
            ) : (
              <div className="grid gap-2">
                <div className={`grid gap-2 ${COLUMNS[type]}`}>
                  {fields.map((f, i) => (
                    <Fragment key={f.key}>
                      {renderField(f, row.penId, row.penNumber, typed[f.key] ?? "", type === "eggs" && !showExtra && EXTRA_EGG_FIELDS.includes(f.key))}
                      {type === "eggs" && i === 1 && (
                        <button
                          type="button"
                          className="col-span-2 flex min-h-9 items-center justify-center gap-1 rounded-md border border-line px-2 text-xs font-medium text-ink/70 sm:hidden"
                          aria-expanded={showExtra}
                          onClick={() => setMoreEggBoxes((p) => ({ ...p, [row.penId]: !showExtra }))}
                        >
                          {showExtra ? <ChevronUp aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" />}
                          {showExtra ? "Hide cracked, dirty, broken, rejected" : "Cracked, dirty, broken, rejected (optional)"}
                        </button>
                      )}
                    </Fragment>
                  ))}
                </div>
                {!plan.error && (plan.eggPieces || plan.feedKg) && (
                  <p className="text-xs text-ink/60">= {plan.eggPieces ? eggsText(plan.eggPieces) : feedText(plan.feedKg ?? 0)}</p>
                )}
                {recorded && plan.parts.length > 0 && (
                  <p className="text-xs text-amber-700">This pen already has {recorded.text} recorded for this date. Saving adds to it.</p>
                )}
                {plan.error && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-red-600" role="alert">
                    <CircleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" /> {plan.error}
                  </p>
                )}
                {result?.saved.map((s, i) => (
                  <p key={`s${i}`} className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                    <CircleCheckBig aria-hidden className="h-3.5 w-3.5 shrink-0" /> Saved: {s}
                  </p>
                ))}
                {result?.warnings.map((w, i) => (
                  <p key={`w${i}`} className="text-xs text-amber-700">{w}</p>
                ))}
                {result?.errors.map((e, i) => (
                  <p key={`e${i}`} className="flex items-start gap-1.5 text-xs font-medium text-red-600" role="alert">
                    <CircleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
                  </p>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {banner && (
        <p className={`rounded-md border px-3 py-2 text-sm ${BANNER_STYLE[banner.tone]}`} role="status">
          {banner.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={saveButton}
          type="button"
          onClick={saveAll}
          disabled={saving || ready.length === 0}
          className="min-h-11 rounded-md bg-brand px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? `Saving… ${progress.done} of ${progress.total}` : ready.length ? `Save ${plural(ready.length, "pen", "pens")}` : "Save"}
        </button>
        {problems.length > 0 && !saving && (
          <span className="text-xs text-red-600">{plural(problems.length, "pen has", "pens have")} a problem and will be skipped until fixed.</span>
        )}
      </div>
    </div>
  );
}
