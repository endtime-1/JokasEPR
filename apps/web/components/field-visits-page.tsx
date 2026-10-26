"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiEnvelope, apiFetch } from "../lib/api";
import { SalesNav } from "./sales-pages";

type Visit = {
  id: string; repId: string; repName?: string; placeName: string; address?: string | null; purpose?: string | null;
  plannedFor: string; plannedLat?: string | number | null; plannedLon?: string | number | null;
  status: string; displayStatus: string; checkedInAt?: string | null; checkInLat?: string | number | null; checkInLon?: string | number | null;
  accuracyM?: number | null; distanceM?: number | null; verification?: string | null; checkInSource?: string | null; checkInNote?: string | null;
};
type UserOpt = { id: string; fullName: string };

const today = () => new Date().toISOString().slice(0, 10);
const inputCls = "w-full rounded-md border border-line px-3 py-2 text-sm";

// Parses a Google Maps link ("...@6.69,-1.62,17z", "...!3d6.69!4d-1.62", "?q=6.69,-1.62") or "6.69, -1.62".
function parsePin(text: string): { lat: number; lon: number } | null {
  const t = text.trim();
  const pats = [/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, /[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/];
  for (const p of pats) {
    const m = t.match(p);
    if (m) {
      const lat = Number(m[1]); const lon = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
  }
  return null;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("This browser cannot share its location.")); return; }
    navigator.geolocation.getCurrentPosition(resolve, (e) => {
      reject(new Error(e.code === 1
        ? "Location is blocked. Click the lock icon next to the web address, allow Location, then try again."
        : e.code === 3 ? "Could not get your location in time. Move near a window or enable Wi-Fi, then try again."
        : "Could not work out your location. Please try again."));
    }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  });
}

const mapUrl = (lat: unknown, lon: unknown) => `https://www.google.com/maps?q=${Number(lat)},${Number(lon)}`;

const BADGE: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: "Verified", cls: "bg-green-100 text-green-800" },
  FAR: { label: "Away from the place", cls: "bg-red-100 text-red-800" },
  LOW_ACCURACY: { label: "Rough location, check map", cls: "bg-amber-100 text-amber-800" },
  UNPINNED: { label: "No pin to compare", cls: "bg-slate-100 text-slate-700" },
  PLANNED: { label: "Not yet there", cls: "bg-blue-100 text-blue-800" },
  MISSED: { label: "Missed", cls: "bg-red-100 text-red-800" },
  CANCELLED: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};
function Badge({ visit }: { visit: Visit }) {
  const key = visit.status === "CHECKED_IN" ? (visit.verification ?? "UNPINNED") : visit.displayStatus;
  const b = BADGE[key] ?? { label: key, cls: "bg-slate-100 text-slate-700" };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>;
}

const time = (d?: string | null) => (d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");

export function FieldVisitsPage() {
  const [mine, setMine] = useState<Visit[]>([]);
  const [team, setTeam] = useState<Visit[] | null>(null);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [repFilter, setRepFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ placeName: "", address: "", purpose: "", plannedFor: today(), repId: "", pin: "" });
  const [pinFromHere, setPinFromHere] = useState<{ lat: number; lon: number } | null>(null);
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const loadMine = useCallback(async () => {
    const r = await apiFetch<ApiEnvelope<Visit[]>>(`/sales/field-visits/my?dateFrom=${today()}&dateTo=${today()}`);
    setMine(r.data ?? []);
  }, []);

  const loadTeam = useCallback(async () => {
    try {
      const q = new URLSearchParams({ dateFrom: from, dateTo: to });
      if (repFilter) q.set("repId", repFilter);
      const r = await apiFetch<ApiEnvelope<Visit[]>>(`/sales/field-visits?${q}`, { quiet: true });
      setTeam(r.data ?? []);
    } catch { setTeam(null); } // no sales.read: the team view is hidden
  }, [from, to, repFilter]);

  useEffect(() => { loadMine().catch(() => undefined); }, [loadMine]);
  useEffect(() => { void loadTeam(); }, [loadTeam]);
  useEffect(() => {
    apiFetch<ApiEnvelope<UserOpt[]>>("/identity/users", { quiet: true }).then((r) => setUsers(r.data ?? [])).catch(() => undefined);
  }, []);

  async function checkIn(v: Visit) {
    setBusy(v.id); setError(""); setMsg("");
    try {
      const pos = await getPosition();
      const res = await apiFetch<ApiEnvelope<Visit>>(`/sales/field-visits/${v.id}/check-in`, {
        method: "POST",
        body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy, source: "WEB" }),
      });
      const r = res.data;
      setMsg(r.verification === "VERIFIED" ? `Checked in at ${v.placeName}. Location confirmed.`
        : r.verification === "FAR" ? `Checked in, but your location is ${r.distanceM} m from ${v.placeName}. Your manager will see this.`
        : r.verification === "LOW_ACCURACY" ? "Checked in. Your computer's location is rough, so your manager will check the map."
        : "Checked in. This visit has no map pin, so your location was recorded but not compared.");
      await Promise.all([loadMine(), loadTeam()]);
    } catch (err: any) { setError(err.message ?? "Check-in failed"); }
    finally { setBusy(""); }
  }

  async function useHere() {
    setError("");
    try {
      const pos = await getPosition();
      setPinFromHere({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      setForm((p) => ({ ...p, pin: "" }));
    } catch (err: any) { setError(err.message); }
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMsg(""); setBusy("plan");
    try {
      let pin = pinFromHere;
      if (form.pin.trim()) {
        pin = parsePin(form.pin);
        if (!pin) { setError("Could not read that pin. Paste a Google Maps link that contains coordinates, or type latitude and longitude like: 6.6885, -1.6244. Shortened links (maps.app.goo.gl) won't work: open the link first, then copy the long address."); setBusy(""); return; }
      }
      await apiFetch("/sales/field-visits", {
        method: "POST",
        body: JSON.stringify({
          placeName: form.placeName.trim(), address: form.address || undefined, purpose: form.purpose || undefined,
          plannedFor: form.plannedFor, repId: form.repId || undefined,
          plannedLat: pin?.lat, plannedLon: pin?.lon,
        }),
      });
      setForm({ placeName: "", address: "", purpose: "", plannedFor: today(), repId: "", pin: "" });
      setPinFromHere(null); setShowForm(false); setMsg("Visit planned.");
      await Promise.all([loadMine(), loadTeam()]);
    } catch (err: any) { setError(err.message ?? "Could not save the visit"); }
    finally { setBusy(""); }
  }

  async function cancel(id: string) {
    try { await apiFetch(`/sales/field-visits/${id}/cancel`, { method: "PATCH" }); await Promise.all([loadMine(), loadTeam()]); }
    catch (err: any) { setError(err.message ?? "Could not cancel"); }
  }

  const stats = team ? {
    total: team.length,
    verified: team.filter((v) => v.verification === "VERIFIED").length,
    flagged: team.filter((v) => v.verification === "FAR" || v.verification === "LOW_ACCURACY").length,
    missed: team.filter((v) => v.displayStatus === "MISSED").length,
  } : null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Field Visits</h1>
      <SalesNav />
      <p className="rounded-md bg-brand/5 px-4 py-3 text-sm text-ink/70">
        Plan a visit, then check in when you arrive. Your location is captured <b>only at the moment you tap Check in</b> and compared with the planned place.
        A phone is accurate to a few metres; a laptop gives only a rough area.
      </p>
      {msg && <p className="rounded-md bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</p>}
      {error && <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">My visits today</h2>
          <button onClick={() => { setShowForm((p) => !p); setError(""); }} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">{showForm ? "Cancel" : "+ Plan a visit"}</button>
        </div>

        {showForm && (
          <form onSubmit={savePlan} className="space-y-4 rounded-lg border border-line bg-surface p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="mb-1 block text-xs font-medium">Place / customer *</label><input required value={form.placeName} onChange={f("placeName")} className={inputCls} /></div>
              <div><label className="mb-1 block text-xs font-medium">Date *</label><input required type="date" value={form.plannedFor} onChange={f("plannedFor")} className={inputCls} /></div>
              <div><label className="mb-1 block text-xs font-medium">Address / area</label><input value={form.address} onChange={f("address")} className={inputCls} /></div>
              <div><label className="mb-1 block text-xs font-medium">Purpose</label><input value={form.purpose} onChange={f("purpose")} placeholder="e.g. Collect payment, introduce Layer 1" className={inputCls} /></div>
              {users.length > 0 && (
                <div><label className="mb-1 block text-xs font-medium">Rep (leave empty for yourself)</label>
                  <select value={form.repId} onChange={f("repId")} className={inputCls}><option value="">Myself</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium">Map pin (so the check-in can be verified)</label>
                <input value={form.pin} onChange={(e) => { setForm((p) => ({ ...p, pin: e.target.value })); setPinFromHere(null); }} placeholder="Paste a Google Maps link, or: 6.6885, -1.6244" className={inputCls} />
                <button type="button" onClick={useHere} className="mt-2 rounded border border-line px-3 py-1 text-xs font-medium hover:bg-field">Use my current location as the pin</button>
                {pinFromHere && <p className="mt-1 text-xs text-green-700">Pin set from your current location ({pinFromHere.lat.toFixed(5)}, {pinFromHere.lon.toFixed(5)}).</p>}
                <p className="mt-1 text-xs text-ink/50">Only use &quot;current location&quot; when you are standing at the place. Without a pin the visit is recorded but cannot be verified.</p>
              </div>
            </div>
            <button type="submit" disabled={busy === "plan"} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "plan" ? "Saving…" : "Save visit"}</button>
          </form>
        )}

        {mine.length === 0 ? <p className="text-sm text-ink/50">No visits planned for today.</p> : (
          <div className="space-y-2">
            {mine.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
                <div>
                  <p className="font-medium">{v.placeName} <Badge visit={v} /></p>
                  <p className="text-xs text-ink/60">{[v.address, v.purpose].filter(Boolean).join(" · ")}</p>
                  {v.status === "CHECKED_IN" && <p className="text-xs text-ink/60">Checked in {time(v.checkedInAt)}{v.distanceM != null ? ` · ${v.distanceM} m from the place` : ""}{v.accuracyM != null ? ` · accurate to ~${v.accuracyM} m` : ""}</p>}
                </div>
                <div className="flex gap-2">
                  {v.status === "PLANNED" && <button onClick={() => checkIn(v)} disabled={!!busy} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === v.id ? "Getting location…" : "Check in here"}</button>}
                  {v.status === "PLANNED" && <button onClick={() => cancel(v.id)} className="rounded-md border border-line px-3 py-2 text-xs hover:bg-field">Cancel</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {team && (
        <section className="space-y-3">
          <h2 className="font-semibold">Team visits</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="mb-1 block text-xs font-medium">From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></div>
            <div><label className="mb-1 block text-xs font-medium">To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></div>
            {users.length > 0 && (
              <div><label className="mb-1 block text-xs font-medium">Rep</label>
                <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className={inputCls}><option value="">All reps</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select>
              </div>
            )}
          </div>
          {stats && (
            <p className="text-sm text-ink/70">{stats.total} visit(s): <b className="text-green-700">{stats.verified} verified</b>, <b className="text-amber-700">{stats.flagged} to check</b>, <b className="text-red-700">{stats.missed} missed</b></p>
          )}
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-field text-xs uppercase text-ink/60">
                <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Rep</th><th className="px-3 py-2">Place</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Distance</th><th className="px-3 py-2">Accuracy</th><th className="px-3 py-2">Device</th><th className="px-3 py-2">Map</th></tr>
              </thead>
              <tbody>
                {team.map((v) => (
                  <tr key={v.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">{new Date(v.plannedFor).toLocaleDateString("en-GB")}</td>
                    <td className="px-3 py-2">{v.repName}</td>
                    <td className="px-3 py-2"><p className="font-medium">{v.placeName}</p><p className="text-xs text-ink/50">{v.purpose ?? v.address ?? ""}</p>{v.checkInNote && <p className="text-xs italic text-ink/60">&ldquo;{v.checkInNote}&rdquo;</p>}</td>
                    <td className="px-3 py-2"><Badge visit={v} /></td>
                    <td className="px-3 py-2">{time(v.checkedInAt)}</td>
                    <td className="px-3 py-2">{v.distanceM != null ? (v.distanceM >= 1000 ? `${(v.distanceM / 1000).toFixed(1)} km` : `${v.distanceM} m`) : "—"}</td>
                    <td className="px-3 py-2">{v.accuracyM != null ? `~${v.accuracyM} m` : "—"}</td>
                    <td className="px-3 py-2">{v.checkInSource === "MOBILE" ? "Phone" : v.checkInSource === "WEB" ? "Computer" : "—"}</td>
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      {v.checkInLat != null && <a className="text-brand hover:underline" href={mapUrl(v.checkInLat, v.checkInLon)} target="_blank" rel="noreferrer">Where they were</a>}
                      {v.plannedLat != null && <a className="text-brand hover:underline" href={mapUrl(v.plannedLat, v.plannedLon)} target="_blank" rel="noreferrer">Planned place</a>}
                    </td>
                  </tr>
                ))}
                {team.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-ink/50">No visits in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
