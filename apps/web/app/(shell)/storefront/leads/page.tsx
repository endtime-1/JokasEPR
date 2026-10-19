"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Mail, MapPin, Phone, RefreshCw } from "lucide-react";
import { apiFetch, type ApiEnvelope } from "../../../../lib/api";

interface Lead {
  id: string;
  kind: "RETAILER" | "CONTACT";
  name: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  isDistributor: boolean | null;
  distributorFeed: string | null;
  subject: string | null;
  message: string | null;
  status: "NEW" | "CONTACTED" | "CLOSED";
  createdAt: string;
}

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "CLOSED", label: "Closed" },
];

const STATUS_STYLE: Record<Lead["status"], string> = {
  NEW: "bg-amber-50 text-amber-700 ring-amber-200",
  CONTACTED: "bg-blue-50 text-blue-700 ring-blue-200",
  CLOSED: "bg-gray-100 text-gray-600 ring-gray-200",
};

// Messages and retailer applications sent from akokofeeds.com. They are saved
// here even when email is not working, so nothing is ever lost.
export default function StorefrontLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState("NEW");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    apiFetch<ApiEnvelope<Lead[]>>(`/public/admin/leads?status=${filter}`)
      .then((r) => setLeads(r.data ?? []))
      .catch(() => setError("Could not load enquiries."))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(id: string, status: Lead["status"]) {
    try {
      await apiFetch(`/public/admin/leads/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch {
      setError("Could not update that enquiry.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10"><Inbox className="h-3.5 w-3.5 text-brand" /></div>
            <h1 className="text-xl font-bold text-ink">Website enquiries</h1>
          </div>
          <p className="mt-1 text-sm text-ink/50">Retailer applications and contact messages from akokofeeds.com.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-sm">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === f.key ? "bg-brand text-white shadow-sm" : "text-ink/50 hover:text-ink"}`}>
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={load} aria-label="Refresh" className="rounded-xl border border-line bg-white p-2 text-ink/50 shadow-sm hover:text-brand">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!loading && !leads.length && !error && (
        <div className="rounded-2xl border border-dashed border-line bg-white py-16 text-center text-sm text-ink/50">No enquiries here yet.</div>
      )}

      <div className="space-y-3">
        {leads.map((l) => (
          <div key={l.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-ink">{l.name}</h2>
                  <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] font-semibold text-ink/60">{l.kind === "RETAILER" ? "Retailer application" : "Contact message"}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[l.status]}`}>{l.status}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink/40">{new Date(l.createdAt).toLocaleString("en-GH")}</p>
              </div>
              <div className="flex gap-2">
                {l.status !== "CONTACTED" && <button onClick={() => setStatus(l.id, "CONTACTED")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-field">Mark contacted</button>}
                {l.status !== "CLOSED" && <button onClick={() => setStatus(l.id, "CLOSED")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-field">Close</button>}
                {l.status === "CLOSED" && <button onClick={() => setStatus(l.id, "NEW")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-field">Reopen</button>}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink/70">
              {l.phone && <a href={`tel:${l.phone}`} className="flex items-center gap-1.5 hover:text-brand"><Phone className="h-3.5 w-3.5" />{l.phone}</a>}
              {l.email && <a href={`mailto:${l.email}`} className="flex items-center gap-1.5 hover:text-brand"><Mail className="h-3.5 w-3.5" />{l.email}</a>}
              {l.location && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{l.location}</span>}
            </div>

            {l.kind === "RETAILER" && (
              <p className="mt-3 text-sm text-ink/70">
                <span className="font-semibold">Already a distributor?</span> {l.isDistributor ? "Yes" : "No"}
                {l.isDistributor && l.distributorFeed ? <> · <span className="font-semibold">Feed:</span> {l.distributorFeed}</> : null}
              </p>
            )}
            {l.subject && <p className="mt-3 text-sm font-semibold text-ink">{l.subject}</p>}
            {l.message && <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{l.message}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
