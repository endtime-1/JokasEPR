"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListTree, Pencil, Plus, Search, Wand2 } from "lucide-react";
import { FormField } from "../form-field";
import { Badge, ConfirmModal, EmptyState, Modal, Spinner } from "../ui";
import { ACCOUNT_TYPES, AccountType, FinAccount, FinRole, TYPE_LABEL, errMsg, finGet, finSend, useFinPermission } from "./fin-api";
import { ErrorNote, FinGuard } from "./fin-common";
import { useFinHeader } from "./fin-shell";

const control = "app-control w-full";

type FormState = {
  code: string;
  name: string;
  type: AccountType;
  parentId: string;
  isPostable: boolean;
  systemRole: string;
  description: string;
  isActive: boolean;
};

const blank: FormState = { code: "", name: "", type: "ASSET", parentId: "", isPostable: true, systemRole: "", description: "", isActive: true };

function depthOf(a: FinAccount, byId: Map<string, FinAccount>): number {
  let d = 0;
  let cur = a;
  while (cur.parentId && byId.has(cur.parentId) && d < 10) {
    cur = byId.get(cur.parentId)!;
    d++;
  }
  return d;
}

export function FinChartOfAccountsPage() {
  useFinHeader("Chart of Accounts", "The list of accounts every transaction is posted to");
  const canEdit = useFinPermission("fin.accounting.settings");
  const [accounts, setAccounts] = useState<FinAccount[] | null>(null);
  const [roles, setRoles] = useState<FinRole[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<FinAccount | "new" | null>(null);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([finGet<FinAccount[]>("/accounting/accounts"), finGet<FinRole[]>("/accounting/roles")])
      .then(([a, r]) => {
        setAccounts(a.data);
        setRoles(r.data);
        setError("");
      })
      .catch((e) => setError(errMsg(e, "Could not load the chart of accounts.")));
  }, []);
  useEffect(load, [load]);

  const byId = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (accounts ?? []).filter((a) => (showInactive || a.isActive) && (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)));
  }, [accounts, search, showInactive]);

  async function applyTemplate() {
    setBusy(true);
    setError("");
    try {
      await finSend("POST", "/accounting/accounts/apply-template");
      setConfirmTemplate(false);
      load();
    } catch (e) {
      setError(errMsg(e));
      setConfirmTemplate(false);
    } finally {
      setBusy(false);
    }
  }

  const unassigned = roles.filter((r) => !r.account);

  return (
    <FinGuard permission="fin.accounting.view">
      <div className="space-y-4">
        <ErrorNote message={error} />
        {accounts === null && !error && <div className="flex justify-center py-16"><Spinner /></div>}

        {accounts !== null && accounts.length === 0 && (
          <div className="app-card">
            <EmptyState
              icon={ListTree}
              title="Your chart of accounts is empty"
              description="Start from the ready-made poultry and feed chart (about 90 accounts covering eggs, feed, soya, flock, drugs, payroll and more). You can rename, add and switch off accounts afterwards."
              action={canEdit ? <button className="app-button-primary" onClick={() => setConfirmTemplate(true)}><Wand2 className="h-4 w-4" aria-hidden /> Use the poultry &amp; feed template</button> : undefined}
            />
          </div>
        )}

        {accounts !== null && accounts.length > 0 && (
          <>
            {unassigned.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
                These ledger roles have no account yet, so automatic postings that need them will be refused: {unassigned.map((r) => r.label).join(", ")}. Open an account and choose its role.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden />
                <input className="app-control w-64 pl-9" placeholder="Search code or name" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search accounts" />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
              <div className="flex-1" />
              {canEdit && <button className="app-button-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden /> New account</button>}
            </div>

            {ACCOUNT_TYPES.map((type) => {
              const rows = visible.filter((a) => a.type === type);
              if (rows.length === 0) return null;
              return (
                <section key={type} className="app-card overflow-hidden">
                  <h2 className="border-b border-line bg-field px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink/60">{TYPE_LABEL[type]}</h2>
                  <ul className="divide-y divide-line">
                    {rows.map((a) => (
                      <li key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${a.isActive ? "" : "opacity-50"}`}>
                        <span className="w-16 shrink-0 font-mono text-xs text-ink/50">{a.code}</span>
                        <span className={`min-w-0 flex-1 text-sm ${a.isPostable ? "text-ink" : "font-bold text-ink"}`} style={{ paddingLeft: depthOf(a, byId) * 16 }}>
                          {a.name}
                        </span>
                        {a.systemRole && <Badge variant="info">{roles.find((r) => r.role === a.systemRole)?.label ?? a.systemRole}</Badge>}
                        {!a.isPostable && <Badge variant="neutral">Heading</Badge>}
                        {!a.isActive && <Badge variant="neutral">Inactive</Badge>}
                        {a.isPostable && a.isActive && (
                          <Link href={`/fin/accounting/ledger/${a.id}`} className="text-xs font-semibold text-brand hover:underline">Ledger</Link>
                        )}
                        {canEdit && (
                          <button className="rounded-md p-1.5 text-ink/50 hover:bg-field hover:text-ink" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {visible.length === 0 && <p className="py-8 text-center text-sm text-ink/50">No accounts match.</p>}
          </>
        )}

        <AccountModal
          open={editing !== null}
          account={editing === "new" ? null : editing}
          accounts={accounts ?? []}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
        <ConfirmModal
          open={confirmTemplate}
          title="Load the poultry & feed chart?"
          message="This adds about 90 accounts to your empty chart. It can only be done once; after that you edit accounts one by one."
          confirmLabel="Load template"
          variant="primary"
          loading={busy}
          onConfirm={applyTemplate}
          onClose={() => setConfirmTemplate(false)}
        />
      </div>
    </FinGuard>
  );
}

function AccountModal({
  open,
  account,
  accounts,
  roles,
  onClose,
  onSaved
}: {
  open: boolean;
  account: FinAccount | null;
  accounts: FinAccount[];
  roles: FinRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(blank);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      account
        ? { code: account.code, name: account.name, type: account.type, parentId: account.parentId ?? "", isPostable: account.isPostable, systemRole: account.systemRole ?? "", description: account.description ?? "", isActive: account.isActive }
        : blank
    );
  }, [open, account]);

  const locked = !!account?.hasPostings;
  const headings = accounts.filter((a) => !a.isPostable && a.type === form.type && a.id !== account?.id);
  const roleChoices = roles.filter((r) => r.type === form.type && (!r.account || r.account.id === account?.id));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        parentId: form.parentId || null,
        isPostable: form.isPostable,
        systemRole: form.isPostable ? form.systemRole || null : null,
        description: form.description.trim() || null,
        ...(account ? { isActive: form.isActive } : {})
      };
      if (account) await finSend("PATCH", `/accounting/accounts/${account.id}`, body);
      else await finSend("POST", "/accounting/accounts", body);
      onSaved();
    } catch (err) {
      setError(errMsg(err, "Could not save the account."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={account ? `Edit ${account.code} ${account.name}` : "New account"}>
      <form onSubmit={submit} className="grid gap-4">
        {locked && <p className="rounded-lg bg-field px-3 py-2 text-xs text-ink/65">This account has postings, so its code and type are fixed. You can still rename it.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Code" required>
            <input className={control} value={form.code} onChange={(e) => set("code", e.target.value)} maxLength={24} required disabled={locked} />
          </FormField>
          <FormField label="Type" required>
            <select className={control} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType, parentId: "", systemRole: "" }))} disabled={locked}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Name" required>
          <input className={control} value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required />
        </FormField>
        <FormField label="Sits under" hint="A heading of the same type">
          <select className={control} value={form.parentId} onChange={(e) => set("parentId", e.target.value)}>
            <option value="">(top level)</option>
            {headings.map((h) => <option key={h.id} value={h.id}>{h.code} {h.name}</option>)}
          </select>
        </FormField>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.isPostable} onChange={(e) => set("isPostable", e.target.checked)} disabled={locked && account?.isPostable} />
          Posting account (untick to make it a heading that only groups other accounts)
        </label>
        {form.isPostable && (
          <FormField label="Ledger role" hint="Lets automatic postings find this account, e.g. “Accounts receivable”. Leave blank for ordinary accounts.">
            <select className={control} value={form.systemRole} onChange={(e) => set("systemRole", e.target.value)}>
              <option value="">(none)</option>
              {roleChoices.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
            </select>
          </FormField>
        )}
        <FormField label="Description">
          <input className={control} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={240} />
        </FormField>
        {account && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active (inactive accounts cannot be posted to)
          </label>
        )}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="app-button-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="app-button-primary" disabled={saving}>{saving ? <Spinner size="sm" /> : null} Save</button>
        </div>
      </form>
    </Modal>
  );
}
