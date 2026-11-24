"use client";

import { ChangeEvent, FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FormField } from "../form-field";
import { Badge, Modal, Spinner } from "../ui";
import { errMsg, finGet, finSend, today, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { BankingTabs, PayAccount, Pager, control, useLedgerAccounts, usePayAccounts, usePaged } from "./fin-banking-parts";
import { money } from "./fin-sales-parts";
import { useFinHeader } from "./fin-shell";

type Line = { id: string; date: string; description: string; reference: string | null; amount: string; balance: string | null; status: "UNMATCHED" | "MATCHED" | "IGNORED"; matchMethod: string | null; ledger: { reference: string; description: string; voided: boolean } | null };
type Candidate = { journalLineId: string; entryId: string; date: string; reference: string; description: string; amount: string; sameAmount?: boolean; daysApart?: number };
type Report = {
  account: { id: string; name: string; reconcileFrom: string | null };
  asOf: string; statementBalance: string; ledgerBalance: string; adjustedLedgerBalance: string; difference: string; reconciled: boolean; canClose: boolean; reconciledThrough: string | null; matchedLines: number;
  outstandingLedgerEntries: { net: string; count: number; items: Candidate[] };
  statementLinesNotInLedger: { net: string; count: number; items: (Line & { staleMatch: boolean })[] };
};

export function FinReconcilePage() {
  return (
    <Suspense fallback={null}>
      <ReconcileInner />
    </Suspense>
  );
}

function ReconcileInner() {
  useFinHeader("Banking", "Cash, bank and mobile money accounts, payments, transfers and reconciliation");
  const sp = useSearchParams();
  const { accounts, loading } = usePayAccounts();
  const [accountId, setAccountId] = useState(sp.get("account") ?? "");
  const [tab, setTab] = useState<"match" | "import" | "report">("match");
  const [version, setVersion] = useState(0); // bumped after any change so every tab reloads
  const bump = () => setVersion((v) => v + 1);
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts.find((a) => a.isActive && a.type !== "CASH")?.id ?? accounts[0].id);
  }, [accounts, accountId]);
  const account = accounts.find((a) => a.id === accountId);

  return (
    <FinGuard permission="fin.banking.view">
      <BankingTabs />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select className="app-control" value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account to reconcile">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {account && <span className="text-sm text-ink/55">Books say <b className="tabular-nums text-ink">{money(account.balance)}</b> · {account.reconciledThrough ? `reconciled to ${account.reconciledThrough}` : "not reconciled yet"}</span>}
          <div className="flex-1" />
          <div className="flex gap-1">
            {([["match", "Match"], ["import", "Import statement"], ["report", "Report"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3.5 py-2 text-sm font-medium ${tab === k ? "bg-brand text-white" : "text-ink/65 hover:bg-field"}`}>{l}</button>
            ))}
          </div>
        </div>
        {!account && !loading && <div className="app-card px-6 py-10 text-center text-ink/55">Add a payment account first.</div>}
        {account && tab === "import" && <ImportTab account={account} onDone={() => { bump(); setTab("match"); }} />}
        {account && tab === "match" && <MatchTab key={`m${version}`} account={account} onChanged={bump} />}
        {account && tab === "report" && <ReportTab key={`r${version}`} account={account} onChanged={bump} />}
      </div>
    </FinGuard>
  );
}

// ─── import ──────────────────────────────────────────────────────────────────

type Mapping = { date: number; description: number; reference?: number; amount?: number; moneyIn?: number; moneyOut?: number; balance?: number };
type Preview = { totalLines: number; newLines: number; alreadyImported: number; errors: { lineNo: number; message: string }[]; moneyIn: string; moneyOut: string; from: string | null; to: string | null; lastBalance: number | null; sample: { lineNo: number; date: string; description: string; reference: string | null; amount: string; isNew: boolean }[]; canImport: boolean };

function ImportTab({ account, onDone }: { account: PayAccount; onDone: () => void }) {
  const canImport = useFinPermission("fin.banking.create");
  const [file, setFile] = useState<{ name: string; csv?: string; fileBase64?: string } | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping>({ date: 0, description: 1 });
  const [mode, setMode] = useState<"split" | "single">("split");
  const [closing, setClosing] = useState("");
  const [skipBad, setSkipBad] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(""); setPreview(null); setDone("");
    try {
      const isExcel = /\.xlsx?$/i.test(f.name);
      let payload: { name: string; csv?: string; fileBase64?: string };
      if (isExcel) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        payload = { name: f.name, fileBase64: btoa(bin) };
      } else {
        payload = { name: f.name, csv: await f.text() };
      }
      setFile(payload);
      const r = await finSend<{ rows: string[][]; guess: Mapping & { amount?: number } }>("POST", "/banking/reconciliation/peek", { csv: payload.csv, fileBase64: payload.fileBase64 });
      setGrid(r.data.rows);
      setMap(r.data.guess);
      setMode(r.data.guess.amount !== undefined && r.data.guess.moneyIn === undefined ? "single" : "split");
    } catch (err) {
      setError(errMsg(err, "Could not read that file."));
      setFile(null);
    }
  }

  const body = () => {
    const mapping: Record<string, unknown> = { date: map.date, description: map.description, hasHeader: true };
    if (map.reference !== undefined) mapping.reference = map.reference;
    if (map.balance !== undefined) mapping.balance = map.balance;
    if (mode === "single") mapping.amount = map.amount;
    else { mapping.moneyIn = map.moneyIn; mapping.moneyOut = map.moneyOut; }
    return { paymentAccountId: account.id, csv: file?.csv, fileBase64: file?.fileBase64, fileName: file?.name, mapping, skipBadRows: skipBad, ...(closing.trim() ? { closingBalance: closing.trim() } : {}) };
  };

  async function doPreview(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setDone("");
    try {
      setPreview((await finSend<Preview>("POST", "/banking/reconciliation/import/preview", body())).data);
    } catch (err) {
      setError(errMsg(err, "Could not read the statement."));
    } finally {
      setBusy(false);
    }
  }
  async function doImport() {
    setBusy(true); setError("");
    try {
      const r = await finSend<{ added: number; alreadyImported: number; autoMatched: number }>("POST", "/banking/reconciliation/import", body());
      setDone(`Imported ${r.data.added} line${r.data.added === 1 ? "" : "s"} (${r.data.alreadyImported} already there). ${r.data.autoMatched} matched automatically.`);
      setPreview(null); setFile(null); setGrid([]);
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not import the statement."));
    } finally {
      setBusy(false);
    }
  }

  const cols = grid[0]?.map((h, i) => ({ i, label: `${i + 1}. ${h || "(blank)"}` })) ?? [];
  const colSelect = (label: string, key: keyof Mapping, optional = false) => (
    <FormField label={label}>
      <select className={control} value={map[key] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [key]: e.target.value === "" ? undefined : Number(e.target.value) }) as Mapping)}>
        {optional && <option value="">Not in the file</option>}
        {cols.map((c) => <option key={c.i} value={c.i}>{c.label}</option>)}
      </select>
    </FormField>
  );

  if (!canImport) return <div className="app-card px-6 py-8 text-center text-ink/55">You do not have permission to import statements.</div>;
  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      {done && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{done}</p>}
      <div className="app-card space-y-4 p-5">
        <p className="text-sm text-ink/65">Download your statement from the bank or mobile money app as CSV or Excel, then choose it here. Lines already imported are skipped, so overlapping files are safe.</p>
        <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={pick} aria-label="Statement file" className="text-sm" />
        {file && cols.length > 0 && (
          <form onSubmit={doPreview} className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[520px] text-xs"><tbody className="divide-y divide-line">{grid.slice(0, 4).map((r, i) => <tr key={i} className={i === 0 ? "bg-field font-semibold" : ""}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}</tr>)}</tbody></table>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {colSelect("Date column", "date")}
              {colSelect("Description column", "description")}
              {colSelect("Reference column", "reference", true)}
              <FormField label="Amounts are in">
                <select className={control} value={mode} onChange={(e) => setMode(e.target.value as "split" | "single")}><option value="split">Separate money in / money out columns</option><option value="single">One column (out is negative)</option></select>
              </FormField>
              {mode === "single" ? colSelect("Amount column", "amount") : <>{colSelect("Money in column", "moneyIn", true)}{colSelect("Money out column", "moneyOut", true)}</>}
              {colSelect("Balance column (optional)", "balance", true)}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Closing balance on the statement (optional)"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={closing} onChange={(e) => setClosing(e.target.value)} /></FormField>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={skipBad} onChange={(e) => setSkipBad(e.target.checked)} /> Skip lines that cannot be read</label>
            </div>
            <button type="submit" className="app-button-secondary" disabled={busy}>{busy ? <Spinner size="xs" /> : null} Check the file</button>
          </form>
        )}
      </div>
      {preview && (
        <div className="app-card space-y-3 p-5">
          <p className="text-sm">
            <b>{preview.newLines}</b> new line{preview.newLines === 1 ? "" : "s"} of {preview.totalLines}{preview.alreadyImported ? ` (${preview.alreadyImported} already imported)` : ""}
            {preview.from ? `, ${preview.from} to ${preview.to}` : ""}. In <b className="tabular-nums">{money(preview.moneyIn)}</b>, out <b className="tabular-nums">{money(preview.moneyOut)}</b>.
          </p>
          {preview.errors.length > 0 && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{preview.errors.length} line{preview.errors.length === 1 ? "" : "s"} cannot be read, for example line {preview.errors[0].lineNo}: {preview.errors[0].message}{!skipBad && " Tick “Skip lines that cannot be read” to import the rest."}</div>}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[520px] text-sm">
              <tbody className="divide-y divide-line">{preview.sample.map((s) => <tr key={s.lineNo} className={s.isNew ? "" : "opacity-50"}><td className="whitespace-nowrap px-3 py-1.5">{s.date}</td><td className="px-3 py-1.5">{s.description}</td><td className="px-3 py-1.5 text-right tabular-nums">{money(s.amount)}</td><td className="px-3 py-1.5 text-xs text-ink/50">{s.isNew ? "" : "already imported"}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="flex justify-end"><button className="app-button-primary" disabled={busy || !preview.canImport} onClick={doImport}>{busy ? <Spinner size="xs" /> : null} Import {preview.newLines} line{preview.newLines === 1 ? "" : "s"}</button></div>
        </div>
      )}
    </div>
  );
}

// ─── match ───────────────────────────────────────────────────────────────────

function MatchTab({ account, onChanged }: { account: PayAccount; onChanged: () => void }) {
  const canEdit = useFinPermission("fin.banking.create");
  const canPost = useFinPermission("fin.banking.post");
  const [status, setStatus] = useState<"UNMATCHED" | "MATCHED" | "IGNORED" | "all">("UNMATCHED");
  const list = usePaged<Line>(`/banking/reconciliation/lines?paymentAccountId=${account.id}&status=${status}`);
  const counts = (list.meta.counts ?? {}) as Record<string, number>;
  const [msg, setMsg] = useState("");
  const [matching, setMatching] = useState<Line | null>(null);
  const [creating, setCreating] = useState<Line | null>(null);
  const [busyId, setBusyId] = useState("");

  async function act(id: string, path: string, body?: unknown) {
    setBusyId(id); setMsg("");
    try {
      await finSend("POST", `/banking/reconciliation/${path}`, body);
      onChanged();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusyId("");
    }
  }
  async function auto() {
    setMsg("");
    try {
      const r = await finSend<{ matched: number }>("POST", "/banking/reconciliation/auto-match", { paymentAccountId: account.id });
      setMsg(`${r.data.matched} line${r.data.matched === 1 ? "" : "s"} matched automatically.`);
      list.refresh();
    } catch (e) {
      setMsg(errMsg(e));
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNote message={list.error} />
      {msg && <p className="text-sm text-ink/70">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {([["UNMATCHED", "To match"], ["MATCHED", "Matched"], ["IGNORED", "Ignored"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { list.setPage(() => 1); setStatus(k); }} className={`rounded-lg px-3 py-1.5 text-sm ${status === k ? "bg-ink/10 font-semibold" : "text-ink/60 hover:bg-field"}`}>{l}{k !== "all" && counts[k] !== undefined ? ` (${counts[k]})` : ""}</button>
        ))}
        <div className="flex-1" />
        {canEdit && <button className="app-button-secondary" onClick={auto}>Match automatically</button>}
      </div>
      <div className="app-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Statement line</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Books</th><th className="w-56" /></tr></thead>
          <tbody className="divide-y divide-line">
            {list.rows.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2.5">{l.date}</td>
                <td className="px-4 py-2.5">{l.description}{l.reference ? <span className="block text-xs text-ink/50">{l.reference}</span> : null}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${Number(l.amount) < 0 ? "text-red-600" : ""}`}>{money(l.amount)}</td>
                <td className="px-4 py-2.5 text-xs">
                  {l.status === "MATCHED" && l.ledger && <>{l.ledger.reference}{l.ledger.voided && <Badge variant="danger" className="ml-1">voided</Badge>}<span className="block text-ink/50">{l.matchMethod?.toLowerCase()}</span></>}
                  {l.status === "IGNORED" && <span className="text-ink/50">Ignored</span>}
                </td>
                <td className="px-2 text-right text-xs font-semibold">
                  {busyId === l.id ? <Spinner size="xs" /> : (
                    <span className="inline-flex flex-wrap justify-end gap-x-3 gap-y-1">
                      {l.status === "UNMATCHED" && canEdit && <button className="text-brand hover:underline" onClick={() => setMatching(l)}>Match</button>}
                      {l.status === "UNMATCHED" && canPost && <button className="text-brand hover:underline" onClick={() => setCreating(l)}>Create</button>}
                      {l.status === "UNMATCHED" && canEdit && <button className="text-ink/55 hover:underline" onClick={() => act(l.id, `lines/${l.id}/ignore`, { ignore: true })}>Ignore</button>}
                      {l.status === "MATCHED" && canEdit && <button className="text-ink/55 hover:underline" onClick={() => act(l.id, `lines/${l.id}/unmatch`)}>Unmatch</button>}
                      {l.status === "IGNORED" && canEdit && <button className="text-brand hover:underline" onClick={() => act(l.id, `lines/${l.id}/ignore`, { ignore: false })}>Bring back</button>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {list.loading && list.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center"><Spinner /></td></tr>}
            {!list.loading && list.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/50">{status === "UNMATCHED" ? "Nothing left to match." : "Nothing here."}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={list.page} pages={list.pages} setPage={list.setPage} />
      <MatchModal line={matching} onClose={() => setMatching(null)} onDone={() => { setMatching(null); onChanged(); }} />
      <CreateModal line={creating} onClose={() => setCreating(null)} onDone={() => { setCreating(null); onChanged(); }} />
    </div>
  );
}

function MatchModal({ line, onClose, onDone }: { line: Line | null; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    setRows([]); setError("");
    if (line) finGet<Candidate[]>(`/banking/reconciliation/lines/${line.id}/suggestions`).then((r) => setRows(r.data)).catch((e) => setError(errMsg(e)));
  }, [line]);
  async function pick(c: Candidate) {
    if (!line) return;
    setBusy(c.journalLineId); setError("");
    try {
      await finSend("POST", `/banking/reconciliation/lines/${line.id}/match`, { journalLineId: c.journalLineId });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Modal open={line !== null} onClose={onClose} title="Match to an entry in the books" size="lg">
      {line && <p className="mb-3 text-sm text-ink/65">{line.date} · {line.description} · <b className="tabular-nums">{money(line.amount)}</b></p>}
      <ErrorNote message={error} />
      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line">
        <table className="w-full text-sm"><tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.journalLineId}>
              <td className="whitespace-nowrap px-3 py-2">{c.date}</td>
              <td className="px-3 py-2">{c.description}<span className="block font-mono text-[10px] text-ink/45">{c.reference}</span></td>
              <td className={`px-3 py-2 text-right tabular-nums ${c.sameAmount ? "font-semibold" : "text-ink/50"}`}>{money(c.amount)}</td>
              <td className="px-3 py-2 text-right"><button className="text-xs font-semibold text-brand hover:underline disabled:opacity-40" disabled={!c.sameAmount || busy !== ""} onClick={() => pick(c)} title={c.sameAmount ? "" : "The amounts differ"}>{busy === c.journalLineId ? "…" : "Match"}</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className="px-3 py-8 text-center text-ink/50">No entries in the books are waiting for this account. Use “Create” to add the transaction instead.</td></tr>}
        </tbody></table>
      </div>
    </Modal>
  );
}

function CreateModal({ line, onClose, onDone }: { line: Line | null; onClose: () => void; onDone: () => void }) {
  const ledger = useLedgerAccounts(["EXPENSE", "REVENUE", "LIABILITY", "ASSET", "EQUITY"]);
  const [counter, setCounter] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCounter(""); setText(line?.description ?? ""); setError(""); }, [line]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!line) return;
    setBusy(true); setError("");
    try {
      await finSend("POST", `/banking/reconciliation/lines/${line.id}/create-transaction`, { counterAccountId: counter, description: text.trim() || undefined });
      onDone();
    } catch (err) {
      setError(errMsg(err, "Could not create the transaction."));
    } finally {
      setBusy(false);
    }
  }
  const out = line ? Number(line.amount) < 0 : false;
  return (
    <Modal open={line !== null} onClose={onClose} title={out ? "Money out that is not in the books" : "Money in that is not in the books"} size="md">
      <form onSubmit={submit} className="grid gap-4">
        {line && <p className="text-sm text-ink/65">{line.date} · <b className="tabular-nums">{money(line.amount)}</b>. Pick the other side: bank charges, interest earned, a refund… The entry is posted and matched in one step.</p>}
        <FormField label={out ? "Charge it to" : "Credit it to"} required>
          <select className={control} value={counter} onChange={(e) => setCounter(e.target.value)} required>
            <option value="">Choose an account…</option>
            {ledger.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
        </FormField>
        <FormField label="Description"><input className={control} value={text} onChange={(e) => setText(e.target.value)} maxLength={240} /></FormField>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={busy || !counter}>{busy ? <Spinner size="xs" /> : null} Post and match</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── report ──────────────────────────────────────────────────────────────────

type History = { id: string; reconciledThrough: string | null; statementBalance: string | null; note: string; createdAt: string };

function ReportTab({ account, onChanged }: { account: PayAccount; onChanged: () => void }) {
  const canApprove = useFinPermission("fin.banking.approve");
  const [asOf, setAsOf] = useState(today());
  const [balance, setBalance] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");

  const loadHistory = () => finGet<History[]>(`/banking/reconciliation/history?paymentAccountId=${account.id}`).then((r) => setHistory(r.data)).catch(() => undefined);
  useEffect(() => { void loadHistory(); }, [account.id]);

  async function run(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError("");
    try {
      setReport((await finGet<Report>(`/banking/reconciliation/report?paymentAccountId=${account.id}&asOf=${asOf}&statementBalance=${encodeURIComponent(balance.trim())}`)).data);
    } catch (err) {
      setError(errMsg(err, "Could not make the report."));
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    setBusy(true); setError("");
    try {
      await finSend("POST", "/banking/reconciliation/close", { paymentAccountId: account.id, statementDate: asOf, statementBalance: balance.trim() });
      await run();
      await loadHistory();
      onChanged();
    } catch (err) {
      setError(errMsg(err, "Could not close the reconciliation."));
    } finally {
      setBusy(false);
    }
  }
  async function reopen() {
    setBusy(true); setError("");
    try {
      await finSend("POST", "/banking/reconciliation/reopen", { paymentAccountId: account.id, reason: reason.trim() });
      setReopening(false); setReason("");
      await loadHistory();
      onChanged();
    } catch (err) {
      setError(errMsg(err, "Could not reopen."));
    } finally {
      setBusy(false);
    }
  }

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => <div className={`flex justify-between gap-4 py-1.5 ${strong ? "border-t border-line font-bold" : ""}`}><span className={strong ? "" : "text-ink/65"}>{label}</span><span className="tabular-nums">{money(value)}</span></div>;

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      <form onSubmit={run} className="app-card flex flex-wrap items-end gap-3 p-5">
        <FormField label="Statement date"><input type="date" className={control} value={asOf} onChange={(e) => setAsOf(e.target.value)} required /></FormField>
        <FormField label="Closing balance on the statement"><input className={`${control} text-right tabular-nums`} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} required /></FormField>
        <button type="submit" className="app-button-primary" disabled={busy || !balance.trim()}>{busy ? <Spinner size="xs" /> : null} Show report</button>
      </form>
      {report && (
        <div className="app-card space-y-4 p-5">
          <div className="max-w-lg text-sm">
            <Row label="Balance in the books" value={report.ledgerBalance} />
            <Row label="Less: entries in the books not on the statement yet" value={String(-Number(report.outstandingLedgerEntries.net))} />
            <Row label="Add: statement lines not in the books yet" value={report.statementLinesNotInLedger.net} />
            <Row label="Adjusted books balance" value={report.adjustedLedgerBalance} strong />
            <Row label="Balance on the statement" value={report.statementBalance} />
            <div className={`mt-2 flex justify-between rounded-lg px-3 py-2 font-bold ${report.reconciled ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}><span>Difference</span><span className="tabular-nums">{money(report.difference)}</span></div>
          </div>
          {report.statementLinesNotInLedger.count > 0 && (
            <div><p className="mb-1 text-sm font-semibold">Statement lines not in the books ({report.statementLinesNotInLedger.count})</p>
              <ul className="space-y-1 text-sm text-ink/70">{report.statementLinesNotInLedger.items.map((l) => <li key={l.id}>{l.date} · {l.description} · <b className="tabular-nums">{money(l.amount)}</b>{l.staleMatch && <Badge variant="danger" className="ml-2">its entry was voided</Badge>}</li>)}</ul></div>
          )}
          {report.outstandingLedgerEntries.count > 0 && (
            <div><p className="mb-1 text-sm font-semibold">In the books, not on the statement yet ({report.outstandingLedgerEntries.count})</p>
              <ul className="space-y-1 text-sm text-ink/70">{report.outstandingLedgerEntries.items.map((c) => <li key={c.journalLineId}>{c.date} · {c.description} · <b className="tabular-nums">{money(c.amount)}</b></li>)}</ul></div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {canApprove && <button className="app-button-primary" disabled={!report.canClose || busy} onClick={close}>Mark as reconciled to {report.asOf}</button>}
            {!report.canClose && <span className="text-xs text-ink/55">{report.reconciled ? "Match or create the statement lines above first." : "The difference must be zero first."}</span>}
          </div>
        </div>
      )}
      <div className="app-card p-5">
        <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Reconciliation history</p>{canApprove && account.reconciledThrough && <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setReopening(true)}>Reopen…</button>}</div>
        <ul className="divide-y divide-line text-sm">{history.map((h) => <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{h.reconciledThrough ? `Reconciled to ${h.reconciledThrough}` : "Reopened completely"} · <span className="text-ink/55">{h.note}</span></span><span className="text-xs text-ink/45">{h.createdAt.slice(0, 10)}</span></li>)}{history.length === 0 && <li className="py-3 text-ink/50">Nothing reconciled yet.</li>}</ul>
      </div>
      <Modal open={reopening} onClose={() => setReopening(false)} title="Reopen reconciliation" size="sm">
        <div className="grid gap-3">
          <p className="text-sm text-ink/65">Matches can be changed again. The reopening is kept in the history.</p>
          <FormField label="Why?" required><input className={control} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></FormField>
          <div className="flex justify-end gap-2"><button className="app-button-secondary" onClick={() => setReopening(false)}>Cancel</button><button className="app-button-primary" disabled={busy || reason.trim().length < 3} onClick={reopen}>Reopen</button></div>
        </div>
      </Modal>
    </div>
  );
}
