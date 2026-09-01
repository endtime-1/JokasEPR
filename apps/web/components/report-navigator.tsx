"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Download, FileText, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { PageHeader } from "./ui";
import { ApiEnvelope, apiFetch, downloadReport } from "../lib/api";

// ── types mirroring the API ────────────────────────────────────────────────
type ScopeNode = {
  type: string;
  id: string;
  label: string;
  meta?: Record<string, string>;
  children: ScopeNode[];
};
type ScopeTree = { module: string; levels: string[]; root: ScopeNode };

type DocDef = { id: string; module: string; label: string; description: string; scopeType: string };

type Section =
  | { type: "header"; fields: { label: string; value: string }[] }
  | { type: "kpis"; items: { label: string; value: string; tone?: string }[] }
  | { type: "line-chart"; title: string; xKey: string; series: { name: string; key: string; color?: string }[]; data: Record<string, string | number>[] }
  | { type: "bar-chart"; title: string; xKey: string; series: { name: string; key: string; color?: string }[]; data: Record<string, string | number>[] }
  | { type: "table"; title: string; columns: { key: string; label: string; type?: string }[]; rows: Record<string, unknown>[] }
  | { type: "timeline"; title: string; events: { date: string; label: string; kind: string }[] }
  | { type: "narrative"; text: string };

type DocumentReport = {
  id: string;
  title: string;
  subtitle: string;
  scope: { type: string; id: string; label: string };
  generatedAt: string;
  sections: Section[];
};

const MODULES = [
  { key: "poultry", label: "Poultry" },
  { key: "feed", label: "Feed Mill" },
  { key: "soya", label: "Soya" },
  { key: "inventory", label: "Inventory" },
  { key: "sales", label: "Sales" },
  { key: "procurement", label: "Procurement" },
  { key: "hr", label: "HR" },
  { key: "maintenance", label: "Maintenance" },
] as const;

const TONE: Record<string, string> = {
  good: "text-emerald-700",
  warning: "text-amber-700",
  critical: "text-red-600",
  neutral: "text-ink",
};
const EVENT_KIND: Record<string, string> = {
  transfer: "bg-sky-100 text-sky-800",
  medication: "bg-violet-100 text-violet-800",
  vaccination: "bg-emerald-100 text-emerald-800",
  health: "bg-red-100 text-red-700",
};

export function ReportNavigatorPage() {
  const params = useSearchParams();
  const initialModule = MODULES.some((m) => m.key === params.get("module")) ? params.get("module")! : "poultry";
  const [module, setModule] = useState<string>(initialModule);
  const [tree, setTree] = useState<ScopeTree | null>(null);
  const [treeError, setTreeError] = useState("");
  const [selected, setSelected] = useState<ScopeNode | null>(null);
  const [docs, setDocs] = useState<DocDef[]>([]);
  const [report, setReport] = useState<DocumentReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    setTree(null);
    setSelected(null);
    setReport(null);
    setTreeError("");
    apiFetch<ApiEnvelope<ScopeTree>>(`/reports/scope-tree?module=${module}`)
      .then((r) => setTree(r.data))
      .catch((err: any) => setTreeError(err?.message ?? "Failed to load the scope tree."));
  }, [module]);

  useEffect(() => {
    if (!selected) return;
    setReport(null);
    setDocs([]);
    apiFetch<ApiEnvelope<DocDef[]>>(`/reports/documents?module=${module}&scopeType=${selected.type}`)
      .then((r) => setDocs(r.data ?? []))
      .catch(() => setDocs([]));
  }, [selected, module]);

  function openReport(def: DocDef) {
    if (!selected) return;
    setReportLoading(true);
    setReportError("");
    setReport(null);
    apiFetch<ApiEnvelope<DocumentReport>>(`/reports/documents/${def.id}?scopeType=${selected.type}&scopeId=${selected.id}`)
      .then((r) => setReport(r.data))
      .catch((err: any) => setReportError(err?.message ?? "Failed to build the report."))
      .finally(() => setReportLoading(false));
  }

  const exportUrl = (fmt: "pdf" | "csv") =>
    report && selected ? `/reports/documents/${report.id}/export.${fmt}?scopeType=${selected.type}&scopeId=${selected.id}` : "";

  return (
    <div>
      <PageHeader title="Reports" description="Drill to a farm, house or batch and pull the report for exactly that." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {MODULES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setModule(m.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              module === m.key ? "border-brand bg-brand/10 text-brand" : "border-line bg-white text-ink hover:bg-field"
            }`}
          >
            {m.label}
          </button>
        ))}
        <Link href="/reports/catalog" className="ml-auto text-xs font-semibold text-ink/50 hover:text-brand hover:underline">
          Classic report catalog →
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* scope tree */}
        <aside className="app-card h-max p-3">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink/50">Scope</p>
          {treeError && <p className="px-1 text-sm text-red-600">{treeError}</p>}
          {!tree && !treeError && <p className="px-1 text-sm text-ink/40">Loading…</p>}
          {tree && (
            <TreeNode node={tree.root} depth={0} selectedId={selected?.id ?? null} onSelect={setSelected} defaultOpen />
          )}
        </aside>

        {/* right panel */}
        <section className="min-w-0">
          {!selected && <div className="app-card p-8 text-center text-sm text-ink/50">Pick a level on the left to see its reports.</div>}

          {selected && !report && !reportLoading && (
            <div>
              <h3 className="mb-1 text-lg font-bold text-ink">{selected.label}</h3>
              <p className="mb-4 text-sm text-ink/55 capitalize">{selected.type} · reports</p>
              {docs.length === 0 ? (
                <div className="app-card p-6 text-sm text-ink/50">No reports for a {selected.type} yet.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => openReport(d)}
                      className="app-card flex flex-col gap-1 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-ink">
                        <FileText className="h-4 w-4 text-brand" /> {d.label}
                      </span>
                      <span className="text-xs text-ink/55">{d.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {reportLoading && (
            <div className="app-card flex items-center gap-2 p-8 text-sm text-ink/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Building report…
            </div>
          )}
          {reportError && (
            <div className="app-card p-4 text-sm text-red-700">
              {reportError}{" "}
              <button type="button" className="ml-2 font-semibold underline" onClick={() => setReport(null)}>
                back
              </button>
            </div>
          )}

          {report && (
            <article>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <button type="button" className="mb-1 text-xs font-semibold text-brand hover:underline" onClick={() => setReport(null)}>
                    ← {selected?.label}
                  </button>
                  <h3 className="text-xl font-bold text-ink">{report.title}</h3>
                  <p className="text-sm text-ink/55">{report.scope.label} — {report.subtitle}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="app-button-ghost" onClick={() => downloadReport(exportUrl("pdf"), `${report.id}.pdf`)}>
                    <Download className="h-4 w-4" /> PDF
                  </button>
                  <button type="button" className="app-button-ghost" onClick={() => downloadReport(exportUrl("csv"), `${report.id}.csv`)}>
                    <Download className="h-4 w-4" /> CSV
                  </button>
                </div>
              </div>
              <div className="space-y-5">
                {report.sections.map((s, i) => (
                  <SectionView key={i} section={s} />
                ))}
              </div>
              <p className="mt-5 text-[11px] text-ink/40">Generated {new Date(report.generatedAt).toLocaleString()}</p>
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  defaultOpen = false,
}: {
  node: ScopeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (n: ScopeNode) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 2);
  const hasChildren = node.children.length > 0;
  const active = selectedId === node.id;
  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-md px-1 py-1 text-sm ${active ? "bg-brand/10 font-semibold text-brand" : "text-ink hover:bg-field"}`}
        style={{ paddingLeft: depth * 12 + 4 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 text-ink/40 hover:text-ink">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <button type="button" onClick={() => onSelect(node)} className="min-w-0 flex-1 truncate text-left">
          {node.label}
          {node.meta?.status && node.meta.status !== "ACTIVE" && (
            <span className="ml-1.5 text-[10px] font-normal uppercase text-ink/35">{node.meta.status}</span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionView({ section }: { section: Section }) {
  if (section.type === "header") {
    return (
      <div className="app-card grid gap-x-6 gap-y-2 p-4 sm:grid-cols-3">
        {section.fields.map((f) => (
          <div key={f.label}>
            <div className="text-[11px] uppercase tracking-wide text-ink/45">{f.label}</div>
            <div className="text-sm font-semibold text-ink">{f.value}</div>
          </div>
        ))}
      </div>
    );
  }
  if (section.type === "kpis") {
    return (
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {section.items.map((i) => (
          <div key={i.label} className="app-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-ink/45">{i.label}</div>
            <div className={`text-lg font-bold ${TONE[i.tone ?? "neutral"] ?? "text-ink"}`}>{i.value}</div>
          </div>
        ))}
      </div>
    );
  }
  if (section.type === "narrative") {
    return <div className="rounded-lg border border-brand/20 bg-brand/5 p-4 text-sm text-ink/80">{section.text}</div>;
  }
  if (section.type === "timeline") {
    return (
      <div className="app-card p-4">
        <h4 className="mb-3 text-sm font-bold text-ink">{section.title}</h4>
        {section.events.length === 0 ? (
          <p className="text-sm text-ink/40">No events recorded.</p>
        ) : (
          <ol className="space-y-2">
            {section.events.map((e, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-ink/50">{e.date}</span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${EVENT_KIND[e.kind] ?? "bg-slate-100 text-slate-700"}`}>
                  {e.kind}
                </span>
                <span className="text-ink/80">{e.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }
  if (section.type === "table") {
    return (
      <div className="app-card p-4">
        <h4 className="mb-3 text-sm font-bold text-ink">{section.title}</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink/45">
                {section.columns.map((c) => (
                  <th key={c.key} className="py-2 pr-4 font-semibold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((r, i) => (
                <tr key={i} className="border-b border-line/60">
                  {section.columns.map((c) => (
                    <td key={c.key} className="py-2 pr-4 tabular-nums">
                      {formatCell(r[c.key], c.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  // charts
  return <ChartSection section={section} />;
}

function ChartSection({ section }: { section: Extract<Section, { type: "line-chart" | "bar-chart" }> }) {
  const empty = !section.data || section.data.length === 0;
  return (
    <div className="app-card p-4">
      <h4 className="mb-3 text-sm font-bold text-ink">{section.title}</h4>
      {empty ? (
        <p className="text-sm text-ink/40">No data for this section.</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {section.type === "line-chart" ? (
              <LineChart data={section.data} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#eadfd2" vertical={false} />
                <XAxis dataKey={section.xKey} tick={{ fontSize: 10, fill: "#9a8e83" }} tickFormatter={fmtAxisDate} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: "#9a8e83" }} width={48} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {section.series.map((se) => (
                  <Line key={se.key} type="monotone" dataKey={se.key} name={se.name} stroke={se.color ?? "#2F6F6A"} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            ) : (
              <BarChart data={section.data} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#eadfd2" vertical={false} />
                <XAxis dataKey={section.xKey} tick={{ fontSize: 10, fill: "#9a8e83" }} tickFormatter={fmtAxisDate} minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: "#9a8e83" }} width={48} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {section.series.map((se) => (
                  <Bar key={se.key} dataKey={se.key} name={se.name} fill={se.color ?? "#2F6F6A"} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function fmtAxisDate(v: unknown) {
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : s;
}
function formatCell(v: unknown, type?: string) {
  if (v == null || v === "") return "—";
  if (type === "money") return `GHS ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === "percent") return `${Number(v)}%`;
  if (type === "number") return Number(v).toLocaleString();
  return String(v);
}
