"use client";

import { useState, type FormEvent } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { FEED_SERIES } from "@/lib/range";

const input = "w-full rounded-2xl border border-sand bg-white px-4 py-3.5 text-sm text-ink placeholder:text-ink/30 transition focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15";

/** "Become a Retailer" application. Saved on the server, then emailed to sales. */
export default function RetailerForm() {
  const [form, setForm] = useState({ name: "", location: "", phone: "", email: "", isDistributor: false, distributorFeed: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      await api.retailers.apply({
        name: form.name.trim(),
        location: form.location.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        isDistributor: form.isDistributor,
        distributorFeed: form.isDistributor ? form.distributorFeed.trim() || undefined : undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send your application. Please call or WhatsApp us instead.");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-4xl bg-white p-10 text-center shadow-panel ring-1 ring-sand">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600"><CheckCircle2 size={28} /></span>
        <h3 className="mt-5 font-display text-2xl text-ink">Application received</h3>
        <p className="mt-2 text-muted">Thank you. Our sales team will contact you soon to talk about joining the Akoko Feeds distribution network.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-4xl bg-white p-7 shadow-panel ring-1 ring-sand sm:p-9">
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone" htmlFor="rf-name">Name</label>
        <input id="rf-name" required maxLength={160} value={form.name} onChange={(e) => set("name", e.target.value)} className={input} placeholder="Your full name or business name" autoComplete="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone" htmlFor="rf-loc">Location</label>
          <input id="rf-loc" required maxLength={200} value={form.location} onChange={(e) => set("location", e.target.value)} className={input} placeholder="Town / area" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone" htmlFor="rf-phone">Contact</label>
          <input id="rf-phone" required maxLength={30} inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={input} placeholder="Phone / WhatsApp number" autoComplete="tel" />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone" htmlFor="rf-email">Email account</label>
        <input id="rf-email" type="email" maxLength={160} value={form.email} onChange={(e) => set("email", e.target.value)} className={input} placeholder="you@example.com" autoComplete="email" />
      </div>

      <fieldset>
        <legend className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone">Already a distributor?</legend>
        <div className="flex gap-3">
          {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map((o) => (
            <label key={o.l} className={`flex-1 cursor-pointer rounded-2xl border px-4 py-3 text-center text-sm font-bold transition ${form.isDistributor === o.v ? "border-brand bg-brand text-white shadow-brandSm" : "border-sand bg-white text-stone hover:border-brand/50"}`}>
              <input type="radio" name="isDistributor" className="sr-only" checked={form.isDistributor === o.v} onChange={() => set("isDistributor", o.v)} />
              {o.l}
            </label>
          ))}
        </div>
      </fieldset>

      {form.isDistributor && (
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone" htmlFor="rf-feed">If yes, which feed?</label>
          <input id="rf-feed" list="rf-feeds" maxLength={200} value={form.distributorFeed} onChange={(e) => set("distributorFeed", e.target.value)} className={input} placeholder="e.g. Layer 1, Broiler Starter" />
          <datalist id="rf-feeds">{FEED_SERIES.map((s) => <option key={s.slug} value={s.name} />)}</datalist>
        </div>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark active:scale-[0.98] disabled:opacity-60">
        {sending ? "Sending…" : <>Apply to become a retailer <Send size={15} /></>}
      </button>
    </form>
  );
}
