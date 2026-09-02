"use client";

import { isValidElement, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Search } from "lucide-react";
import { downloadRowsAsCsv } from "../lib/api";

type Column<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  render?: (row: T) => React.ReactNode;
  // Explicit value for a CSV export. Defaults to the plain text of render()
  // (or row[key] when there's no render). Set this when render() produces
  // something with no readable text — an icon, a chart — or when the export
  // wants a different value than the cell shows.
  csv?: (row: T) => string | number | null | undefined;
};

// Best-effort plain text of a rendered cell, for CSV export.
function nodeToText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    const fromChildren = nodeToText(props.children as React.ReactNode);
    if (fromChildren) return fromChildren;
    // Components that render text straight from a prop (StatusBadge → status,
    // Badge/Pill → label) leave `children` empty — fall back to the prop.
    for (const key of ["status", "label", "value", "title"]) {
      const v = props[key];
      if (typeof v === "string" || typeof v === "number") return String(v).replace(/_/g, " ");
    }
    return "";
  }
  return "";
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows = [],
  empty,
  searchPlaceholder,
  pageSize = 25,
  actions,
  loading,
  csvFilename,
  // Server-side pagination props — when provided, client-side filter/sort/page are disabled.
  totalCount,
  serverPage,
  serverPageSize,
  onPageChange,
}: {
  columns: Column<T>[];
  rows?: T[];
  empty: string;
  searchPlaceholder?: string;
  pageSize?: number;
  actions?: React.ReactNode;
  loading?: boolean;
  // A "Download CSV" button in the toolbar exports every row matching the
  // current search (all pages, not just the one on screen). It's shown by
  // default for any client-paged table with rows; pass a base name here for
  // a nicer filename (".csv" and a date are appended), or `false` to hide it
  // on tables where an export makes no sense.
  csvFilename?: string | false;
  totalCount?: number;
  serverPage?: number;
  serverPageSize?: number;
  onPageChange?: (page: number) => void;
}) {
  const isServerPaged = totalCount !== undefined && onPageChange !== undefined;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const searchableCols = columns.filter((c) => c.searchable !== false);

  const filtered = useMemo(() => {
    if (isServerPaged) return rows;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      searchableCols.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q))
    );
  }, [rows, search, searchableCols, isServerPaged]);

  const sorted = useMemo(() => {
    if (isServerPaged || !sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortKey] ?? "");
      const bv = String(b[sortKey] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortKey, sortDir, isServerPaged]);

  const clientTotalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = isServerPaged ? (serverPage ?? 1) - 1 : Math.min(page, clientTotalPages - 1);
  const paged = isServerPaged ? sorted : sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const totalPages = isServerPaged
    ? Math.max(1, Math.ceil((totalCount ?? 0) / (serverPageSize ?? pageSize)))
    : clientTotalPages;
  const totalShown = isServerPaged ? totalCount ?? 0 : sorted.length;

  function handleSearch(value: string) {
    setSearch(value);
    setPage(0);
  }

  function toggleSort(key: string) {
    if (isServerPaged) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function handlePageChange(p: number) {
    if (isServerPaged) {
      onPageChange!(p + 1);
    } else {
      setPage(p);
    }
  }

  const showCsv = csvFilename !== false && !isServerPaged;

  function handleExport() {
    const exportCols = columns.filter((c) => c.key !== "actions" && c.key !== "_actions" && !c.key.startsWith("_"));
    downloadRowsAsCsv(
      `${csvFilename || "records"}-${new Date().toISOString().slice(0, 10)}.csv`,
      exportCols.map((c) => ({ key: c.key, label: c.label || c.key })),
      sorted as Record<string, unknown>[],
      (row, key) => {
        const col = exportCols.find((c) => c.key === key)!;
        if (col.csv) return col.csv(row as T);
        if (col.render) return nodeToText(col.render(row as T));
        return (row as Record<string, unknown>)[key] as string | number | undefined;
      }
    );
  }

  const pageNumbers = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
    const start = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
    return start + i;
  });

  return (
    <div className="app-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/40"
          />
          <input
            className="app-control w-full pl-8 text-sm"
            placeholder={searchPlaceholder ?? "Search records..."}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            aria-label="Search table"
          />
        </div>
        <div className="flex items-center gap-3">
          {actions}
          {showCsv && sorted.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              title="Download these rows as a CSV"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-brand/40 hover:bg-brand/5 hover:text-brand disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          )}
          <span className="shrink-0 text-xs text-ink/45">
            {loading && rows.length === 0
              ? "Loading…"
              : isServerPaged
              ? `${totalShown} record${totalShown !== 1 ? "s" : ""}`
              : `${filtered.length} of ${rows.length} record${rows.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="border-b border-line bg-field/60 text-xs uppercase text-ink/55">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-bold ${
                    col.sortable !== false
                      ? "cursor-pointer select-none hover:bg-field/80"
                      : ""
                  } ${col.key === "actions" ? "sticky right-0 z-10 border-l border-line bg-field/60" : ""}`}
                  onClick={col.sortable !== false ? () => toggleSort(col.key) : undefined}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <div className="flex items-center gap-1.5">
                    {col.label}
                    {col.sortable !== false && (
                      <span>
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3 text-brand" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-brand" />
                          )
                        ) : (
                          <ChevronDown className="h-3 w-3 opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-t border-line/60">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3.5 ${col.key === "actions" ? "sticky right-0 z-10 border-l border-line bg-white" : ""}`}>
                      <div className="h-4 animate-pulse rounded bg-ink/6" style={{ width: `${55 + ((i * 13 + col.key.length * 7) % 40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td className="px-4 py-14 text-center" colSpan={columns.length}>
                  <p className="text-sm font-medium text-ink/50">
                    {search ? `No results for "${search}"` : empty}
                  </p>
                  {search && (
                    <button
                      className="mt-2 text-xs font-semibold text-brand hover:underline"
                      onClick={() => handleSearch("")}
                    >
                      Clear search
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-line/60 transition-colors hover:bg-field/60"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3.5 align-top text-ink/80 ${
                        col.key === "actions" ? "sticky right-0 z-10 border-l border-line bg-white" : ""
                      }`}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-ink/50">
            Page {currentPage + 1} of {totalPages} · {totalShown} result
            {totalShown !== 1 ? "s" : ""}
          </span>
          <nav className="flex gap-1" aria-label="Pagination">
            <button
              className="grid h-8 w-8 place-items-center rounded-md border border-line transition hover:bg-field disabled:pointer-events-none disabled:opacity-30"
              onClick={() => handlePageChange(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                className={`grid h-8 w-8 place-items-center rounded-md border text-xs font-semibold transition ${
                  n === currentPage
                    ? "border-brand bg-brand text-white"
                    : "border-line text-ink/60 hover:bg-field"
                }`}
                onClick={() => handlePageChange(n)}
                aria-label={`Page ${n + 1}`}
                aria-current={n === currentPage ? "page" : undefined}
              >
                {n + 1}
              </button>
            ))}
            <button
              className="grid h-8 w-8 place-items-center rounded-md border border-line transition hover:bg-field disabled:pointer-events-none disabled:opacity-30"
              onClick={() => handlePageChange(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage === totalPages - 1}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
