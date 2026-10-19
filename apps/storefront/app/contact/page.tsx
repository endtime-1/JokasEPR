"use client";

import { useState, type FormEvent } from "react";
import { Phone, Mail, MessageCircle, MapPin, Send, ExternalLink, CheckCircle2, AtSign } from "lucide-react";
import PageHero from "@/components/PageHero";
import { FeatureIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { CONTACT } from "@/lib/content";
import { whatsappLink } from "@/lib/contact";

const input = "w-full rounded-2xl border border-sand bg-white px-4 py-3.5 text-sm text-ink placeholder:text-ink/30 transition focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/15";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    try {
      await api.contact.submit({ ...form, email: form.email.trim() || undefined, subject: form.subject.trim() || undefined });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message. Please call or WhatsApp us instead.");
    } finally {
      setSending(false);
    }
  }

  const cards = [
    { icon: <Phone size={18} />, title: "Call us", lines: CONTACT.phones.map((p) => ({ text: p.display, href: `tel:${p.tel}` })) },
    { icon: <MessageCircle size={18} />, title: "WhatsApp", lines: [{ text: CONTACT.whatsappDisplay, href: whatsappLink("Hello Akoko Feeds, I would like to ask about your feed.") }] },
    { icon: <Mail size={18} />, title: "Email", lines: [{ text: CONTACT.emailSupport, href: `mailto:${CONTACT.emailSupport}` }, { text: CONTACT.emailSales, href: `mailto:${CONTACT.emailSales}` }] },
    { icon: <MapPin size={18} />, title: "Visit us", lines: [{ text: CONTACT.address, href: CONTACT.mapsUrl }] },
  ];

  return (
    <>
      <PageHero eyebrow="Contact us" title={<>Let&apos;s talk <em className="text-brand">feed &amp; farm.</em></>} lead="Questions about feed, prices or delivery? Our team is ready to help." image="/photos/farmer-tablet.webp" />

      <section className="bg-cream py-20 lg:py-28">
        <div className="mx-auto grid max-w-8xl items-start gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="space-y-4">
            {cards.map((c) => (
              <div key={c.title} className="flex gap-4 rounded-3xl bg-white p-6 shadow-card ring-1 ring-sand">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-[#ea5b0c] text-white shadow-brandSm">{c.icon}</span>
                <div className="min-w-0">
                  <h3 className="font-bold text-ink">{c.title}</h3>
                  {c.lines.map((l) => (
                    <a key={l.text} href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="mt-1 block break-words text-sm text-stone transition hover:text-brand">{l.text}</a>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-4 rounded-3xl bg-white p-6 shadow-card ring-1 ring-sand">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-[#ea5b0c] text-white shadow-brandSm"><AtSign size={18} /></span>
              <div>
                <h3 className="font-bold text-ink">Follow us</h3>
                <p className="mt-1 text-sm text-stone">{CONTACT.social} on social media</p>
              </div>
            </div>
            <a href={CONTACT.mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-3xl bg-ink p-6 text-white transition hover:bg-inkMid">
              <span className="flex items-center gap-4">
                <FeatureIcon name="pin" tone="dark" size={46} />
                <span><span className="block font-bold">Find us on the map</span><span className="text-sm text-white/55">Abrepo Barekese Road, Kumasi</span></span>
              </span>
              <ExternalLink size={18} className="text-brand" />
            </a>
          </div>

          <div>
            {sent ? (
              <div className="rounded-4xl bg-white p-10 text-center shadow-panel ring-1 ring-sand">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600"><CheckCircle2 size={28} /></span>
                <h3 className="mt-5 font-display text-2xl text-ink">Message received</h3>
                <p className="mt-2 text-muted">Thank you. Our team will get back to you shortly.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4 rounded-4xl bg-white p-7 shadow-panel ring-1 ring-sand sm:p-9">
                <h2 className="font-display text-3xl text-ink">Send us a message</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input required maxLength={160} value={form.name} onChange={(e) => set("name", e.target.value)} className={input} placeholder="Your name" autoComplete="name" aria-label="Your name" />
                  <input required maxLength={30} inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={input} placeholder="Phone number" autoComplete="tel" aria-label="Phone number" />
                </div>
                <input type="email" maxLength={160} value={form.email} onChange={(e) => set("email", e.target.value)} className={input} placeholder="Email (optional)" autoComplete="email" aria-label="Email" />
                <input maxLength={200} value={form.subject} onChange={(e) => set("subject", e.target.value)} className={input} placeholder="Subject (optional)" aria-label="Subject" />
                <textarea required maxLength={2000} rows={5} value={form.message} onChange={(e) => set("message", e.target.value)} className={input} placeholder="How can we help?" aria-label="Message" />
                {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark active:scale-[0.98] disabled:opacity-60">
                  {sending ? "Sending…" : <>Send message <Send size={15} /></>}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
