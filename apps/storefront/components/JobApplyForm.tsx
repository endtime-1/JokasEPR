"use client";

import { useState, type FormEvent } from "react";
import { Send, CheckCircle2, Upload } from "lucide-react";
import { api } from "@/lib/api";

const input = "w-full rounded-2xl border border-sand bg-white px-4 py-3.5 text-sm text-ink placeholder:text-ink/30 transition focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15";
const label = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-stone";
const EDUCATION = ["Primary / JHS", "SHS / WASSCE", "Certificate / Diploma", "HND", "Bachelor degree", "Master degree or higher", "Other"];

/** Public job application: saved straight into the ERP (HR, Recruitment) with the CV. */
export default function JobApplyForm({ reference, title }: { reference: string; title: string }) {
  const [sending, setSending] = useState(false);
  const [doneRef, setDoneRef] = useState("");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const data = new FormData(e.currentTarget);
    const cv = data.get("cv");
    if (!(cv instanceof File) || cv.size === 0) {
      setError("Please attach your CV (PDF, Word or a photo).");
      return;
    }
    if (cv.size > 5 * 1024 * 1024) {
      setError("Your CV is larger than 5 MB. Please attach a smaller file.");
      return;
    }
    setSending(true);
    try {
      const res = await api.jobs.apply(reference, data);
      setDoneRef(res.reference);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send your application. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (doneRef) {
    return (
      <div className="rounded-4xl bg-white p-10 text-center shadow-panel ring-1 ring-sand">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600"><CheckCircle2 size={28} /></span>
        <h3 className="mt-5 font-display text-2xl text-ink">Application received</h3>
        <p className="mt-2 text-muted">Thank you for applying for <b>{title}</b>. Our HR team will review it and contact you if you are shortlisted.</p>
        <p className="mt-4 text-sm text-stone">Your reference: <span className="font-mono font-bold text-ink">{doneRef}</span></p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-4xl bg-white p-7 shadow-panel ring-1 ring-sand sm:p-9">
      <h2 className="font-display text-2xl text-ink">Apply for this job</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label} htmlFor="ja-first">First name *</label><input id="ja-first" name="firstName" required maxLength={80} className={input} autoComplete="given-name" /></div>
        <div><label className={label} htmlFor="ja-last">Last name *</label><input id="ja-last" name="lastName" required maxLength={80} className={input} autoComplete="family-name" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label} htmlFor="ja-phone">Phone / WhatsApp *</label><input id="ja-phone" name="phone" required maxLength={40} inputMode="tel" className={input} autoComplete="tel" /></div>
        <div><label className={label} htmlFor="ja-email">Email</label><input id="ja-email" name="email" type="email" maxLength={160} className={input} autoComplete="email" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="ja-gender">Gender</label>
          <select id="ja-gender" name="gender" defaultValue="" className={input}>
            <option value="">Prefer not to say</option><option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        <div><label className={label} htmlFor="ja-dob">Date of birth</label><input id="ja-dob" name="dateOfBirth" type="date" className={input} /></div>
      </div>
      <div><label className={label} htmlFor="ja-addr">Where do you live? (town and area) *</label><input id="ja-addr" name="address" required maxLength={300} className={input} autoComplete="street-address" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="ja-edu">Highest education</label>
          <select id="ja-edu" name="education" defaultValue="" className={input}>
            <option value="">Select...</option>{EDUCATION.map((e) => <option key={e}>{e}</option>)}
          </select>
        </div>
        <div><label className={label} htmlFor="ja-exp">Years of experience</label><input id="ja-exp" name="yearsExperience" type="number" min={0} max={60} className={input} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label} htmlFor="ja-emp">Current / last employer</label><input id="ja-emp" name="currentEmployer" maxLength={160} className={input} /></div>
        <div><label className={label} htmlFor="ja-sal">Expected salary (GHS)</label><input id="ja-sal" name="expectedSalary" maxLength={60} className={input} /></div>
      </div>
      <div><label className={label} htmlFor="ja-avail">When can you start?</label><input id="ja-avail" name="availability" maxLength={120} placeholder="e.g. Immediately, or after 1 month notice" className={input} /></div>
      <div><label className={label} htmlFor="ja-cover">Why are you a good fit?</label><textarea id="ja-cover" name="coverLetter" rows={4} maxLength={4000} className={input} /></div>
      <div>
        <label className={label} htmlFor="ja-cv">Your CV * (PDF, Word or photo, max 5 MB)</label>
        <label htmlFor="ja-cv" className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-brand/50 bg-cream px-4 py-4 text-sm font-semibold text-stone transition hover:bg-white">
          <Upload size={18} className="text-brand" /> {fileName || "Choose a file..."}
        </label>
        <input id="ja-cv" name="cv" type="file" required accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
      <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-4 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark disabled:opacity-60">
        <Send size={15} /> {sending ? "Sending your application..." : "Submit application"}
      </button>
    </form>
  );
}
