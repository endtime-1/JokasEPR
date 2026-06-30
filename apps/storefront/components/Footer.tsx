import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
import { Logo } from "./Logo";

const PRODUCT_LINKS = [
  { href: "/products?category=Feed", label: "Broiler Starter Mash" },
  { href: "/products?category=Feed", label: "Layer 1 & 2 Mash" },
  { href: "/products?category=Feed", label: "Chicks Starter Mash" },
  { href: "/products?category=Feed", label: "Akoko Mix Feed" },
  { href: "/products?category=Soya+Products", label: "Soya Cake (50kg)" },
  { href: "/products?category=Soya+Products", label: "Soya Oil (25L)" },
  { href: "/products?category=Eggs+%26+Poultry", label: "Fresh Farm Eggs" },
  { href: "/products?category=Eggs+%26+Poultry", label: "Ready Broiler Chicken" },
];

const COMPANY_LINKS = [
  { href: "/about", label: "About Akoko" },
  { href: "/products", label: "All Products" },
  { href: "/contact", label: "Contact Us" },
  { href: "/cart", label: "Your Cart" },
];

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      {/* Top call bar */}
      <div className="border-b border-white/8 bg-white/4">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-5 sm:flex-row sm:px-6">
          <div>
            <p className="font-semibold text-white">Prefer to order by phone?</p>
            <p className="text-sm text-white/55">Our team is available Mon–Sat, 7am–5pm</p>
          </div>
          <a
            href="tel:+233XXXXXXXX"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-brand transition hover:bg-brandDark"
          >
            <Phone size={14} /> +233 XX XXX XXXX
          </a>
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            {/* Real brand logo — light variant */}
            <Logo variant="light-lockup" height={42} />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/50">
              Akoko Solutions — Ghana's trusted source for quality poultry feed,
              fresh eggs, ready broiler chickens, and soya products. Mill-fresh,
              farm-direct, delivered across Ghana.
            </p>
          </div>

          {/* Products */}
          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-widest text-white/30">
              Products
            </h3>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-white/55 transition hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-widest text-white/30">
              Company
            </h3>
            <ul className="space-y-2.5">
              {COMPANY_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-sm text-white/55 transition hover:text-brand">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-widest text-white/30">
              Contact
            </h3>
            <ul className="space-y-4">
              <li>
                <a href="tel:+233XXXXXXXX" className="flex items-start gap-3 text-sm text-white/55 transition hover:text-brand">
                  <Phone size={14} className="mt-0.5 shrink-0 text-brand" />
                  +233 XX XXX XXXX
                </a>
              </li>
              <li>
                <a href="mailto:orders@akokosolutions.com" className="flex items-start gap-3 text-sm text-white/55 transition hover:text-brand">
                  <Mail size={14} className="mt-0.5 shrink-0 text-brand" />
                  orders@akokosolutions.com
                </a>
              </li>
              <li className="flex items-start gap-3 text-sm text-white/55">
                <MapPin size={14} className="mt-0.5 shrink-0 text-brand" />
                Akoko Solutions Farm, Ghana
              </li>
            </ul>
            <a
              href="https://wa.me/233XXXXXXXX"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-400 transition hover:bg-green-500/20"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-white/25 sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Akoko Solutions · All rights reserved</span>
          <div className="flex gap-5">
            <Link href="#" className="transition hover:text-white/50">Privacy Policy</Link>
            <Link href="#" className="transition hover:text-white/50">Terms of Use</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
