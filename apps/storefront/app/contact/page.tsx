"use client";

import { Phone, Mail, MessageCircle, MapPin, Send, ArrowRight, Clock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useState, FormEvent } from "react";
import type { Metadata } from "next";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", subject: "", message: "" });
  const [focused, setFocused] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  function field(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const inputClass = (name: string) =>
    `w-full rounded-2xl border bg-white px-4 py-3.5 text-sm text-ink transition-all placeholder:text-ink/25 focus:outline-none focus:ring-2 ${
      focused === name
        ? "border-brand/50 ring-brand/15 shadow-sm"
        : "border-sand hover:border-sand"
    }`;

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="grain relative -mt-[64px] overflow-hidden bg-ink py-40 text-white">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute left-1/4 top-0 h-64 w-64 rounded-full bg-brand/20 blur-[80px]" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-48 w-48 rounded-full bg-brand/10 blur-[60px]" />

        <div className="relative mx-auto max-w-8xl px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="mb-6 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              <span className="h-px w-8 bg-brand" /> Get in Touch
            </p>
            <h1 className="font-display text-[clamp(3rem,7vw,6rem)] leading-[1.0] text-white">
              Let's Talk<br />
              <em className="text-brand">Feed &amp; Farm.</em>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-white/55">
              Questions about our products, bulk pricing, or delivery? Our team is on the
              ground at Akoko Solutions and responds fast.
            </p>

            {/* Quick contact strip */}
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="tel:+233XXXXXXXX"
                className="glass flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/14">
                <Phone size={15} className="text-brand" />
                +233 XX XXX XXXX
              </a>
              <a href="https://wa.me/233XXXXXXXX" target="_blank" rel="noopener noreferrer"
                className="glass flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/14">
                <MessageCircle size={15} className="text-green-400" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact channels ─────────────────────────────────────────── */}
      <section className="bg-cream py-20">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Phone,
                title: "Call Us",
                detail: "+233 XX XXX XXXX",
                note: "Mon – Sat · 7 am – 5 pm",
                href: "tel:+233XXXXXXXX",
                cta: "Call now",
                accent: "bg-brand",
                iconBg: "bg-brand/10 text-brand",
              },
              {
                icon: MessageCircle,
                title: "WhatsApp",
                detail: "Chat with the team",
                note: "Fastest response · under 2 hrs",
                href: "https://wa.me/233XXXXXXXX",
                cta: "Open WhatsApp",
                accent: "bg-green-500",
                iconBg: "bg-green-50 text-green-600",
              },
              {
                icon: Mail,
                title: "Email",
                detail: "orders@akokosolutions.com",
                note: "Response within 24 hours",
                href: "mailto:orders@akokosolutions.com",
                cta: "Send email",
                accent: "bg-blue-500",
                iconBg: "bg-blue-50 text-blue-600",
              },
              {
                icon: MapPin,
                title: "Farm Pickup",
                detail: "Akoko Solutions Farm, Ghana",
                note: "Call ahead to arrange pickup",
                href: undefined,
                cta: undefined,
                accent: "bg-purple-500",
                iconBg: "bg-purple-50 text-purple-600",
              },
            ].map((c) => {
              const Icon = c.icon;
              const inner = (
                <div className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white shadow-panel ring-1 ring-sand transition-all duration-300 hover:-translate-y-1 hover:shadow-deep">
                  {/* Accent bar */}
                  <div className={`h-1 w-full ${c.accent}`} />
                  <div className="flex flex-1 flex-col p-6">
                    {/* Icon */}
                    <div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${c.iconBg}`}>
                      <Icon size={20} />
                    </div>
                    {/* Content */}
                    <h3 className="font-display text-xl text-ink">{c.title}</h3>
                    <p className="mt-1.5 text-sm font-semibold text-ink/80">{c.detail}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                      <Clock size={10} className="shrink-0" /> {c.note}
                    </p>
                    {c.cta && (
                      <div className="mt-auto pt-5">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand group-hover:gap-2.5 transition-all">
                          {c.cta} <ArrowRight size={13} />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );

              return c.href ? (
                <a key={c.title} href={c.href}
                  target={c.href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="block h-full">
                  {inner}
                </a>
              ) : (
                <div key={c.title} className="h-full">{inner}</div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Form + Bulk CTA ──────────────────────────────────────────── */}
      <section className="bg-ink py-24 lg:py-32">
        <div className="mx-auto max-w-8xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_420px]">

            {/* Form */}
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
                Send a Message
              </p>
              <h2 className="font-display text-[clamp(2rem,4vw,3.5rem)] leading-[1.05] text-white">
                We'll Reply<br />
                <em className="text-brand">By Next Business Day.</em>
              </h2>

              <div className="mt-10">
                {sent ? (
                  <div className="flex flex-col items-center gap-5 rounded-3xl border border-white/8 bg-white/4 py-20 text-center backdrop-blur-sm">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-green-500/20">
                      <Send size={28} className="text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-display text-2xl text-white">Message Sent!</h3>
                      <p className="mt-2 text-sm text-white/50">
                        Thank you, {form.name}. We'll be in touch shortly.
                      </p>
                    </div>
                    <button
                      onClick={() => { setSent(false); setForm({ name: "", phone: "", subject: "", message: "" }); }}
                      className="text-sm font-semibold text-brand hover:underline"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-white/50">
                          Full Name <span className="text-brand">*</span>
                        </label>
                        <input
                          required type="text"
                          value={form.name}
                          onChange={(e) => field("name", e.target.value)}
                          onFocus={() => setFocused("name")}
                          onBlur={() => setFocused(null)}
                          placeholder="e.g. Kwame Asante"
                          className={inputClass("name")}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-white/50">
                          Phone Number <span className="text-brand">*</span>
                        </label>
                        <input
                          required type="tel"
                          value={form.phone}
                          onChange={(e) => field("phone", e.target.value)}
                          onFocus={() => setFocused("phone")}
                          onBlur={() => setFocused(null)}
                          placeholder="+233 XX XXX XXXX"
                          className={inputClass("phone")}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-white/50">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={form.subject}
                        onChange={(e) => field("subject", e.target.value)}
                        onFocus={() => setFocused("subject")}
                        onBlur={() => setFocused(null)}
                        placeholder="Bulk order enquiry, pricing, delivery…"
                        className={inputClass("subject")}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-white/50">
                        Message <span className="text-brand">*</span>
                      </label>
                      <textarea
                        required rows={5}
                        value={form.message}
                        onChange={(e) => field("message", e.target.value)}
                        onFocus={() => setFocused("message")}
                        onBlur={() => setFocused(null)}
                        placeholder="Tell us what you need — product, quantity, location…"
                        className={`${inputClass("message")} resize-none`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-sm font-bold text-white shadow-brand transition-all hover:bg-brandDark hover:shadow-[0_8px_32px_rgba(245,130,32,0.5)] active:scale-[0.98]"
                    >
                      <Send size={15} />
                      Send Message
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Right column — Bulk + WhatsApp */}
            <div className="flex flex-col gap-5">
              {/* Bulk orders card */}
              <div className="flex-1 rounded-3xl border border-white/8 bg-white/5 p-7 backdrop-blur-sm">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-brand/20">
                  <Mail size={20} className="text-brand" />
                </div>
                <h3 className="font-display text-2xl text-white">Bulk Orders &amp; Partnerships</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  Running a large farm or feed business? We offer custom pricing,
                  dedicated account management, and flexible delivery for orders of
                  50+ bags per month.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    "Volume discounts from 20 bags",
                    "Monthly standing order agreements",
                    "Custom feed formulation on request",
                    "Dedicated farm liaison officer",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-white/55">
                      <span className="mt-0.5 shrink-0 text-brand">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href="mailto:orders@akokosolutions.com?subject=Bulk Order Partnership"
                  className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-3.5 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark"
                >
                  <Mail size={14} /> Email for Bulk Pricing
                </a>
              </div>

              {/* WhatsApp card */}
              <div className="rounded-3xl bg-[#25D366] p-6 text-white">
                <div className="mb-3 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="opacity-80">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-widest opacity-80">Fastest Response</span>
                </div>
                <h3 className="font-display text-2xl text-white">Chat on WhatsApp</h3>
                <p className="mt-2 text-sm text-white/75">
                  Send us a message for the fastest response — typically under 2 hours during business hours.
                </p>
                <a
                  href="https://wa.me/233XXXXXXXX"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-bold text-[#25D366] shadow transition hover:bg-white/90"
                >
                  Start WhatsApp Chat
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
