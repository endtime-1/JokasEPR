"use client";

import Link from "next/link";
import { ShoppingCart, Menu, X, Phone } from "lucide-react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { Logo, LogoMark } from "./Logo";

const NAV = [
  { href: "/products",                           label: "Products"    },
  { href: "/products?category=Feed",             label: "Feed"        },
  { href: "/products?category=Eggs+%26+Poultry", label: "Eggs & Poultry" },
  { href: "/about",                              label: "About"       },
  { href: "/contact",                            label: "Contact"     },
];

const TICKERS = [
  "🌾  Mill-fresh feed — same formula Akoko Solutions feeds its own birds",
  "🐓  Ready broilers at market weight — vaccinated & disease-screened",
  "🥚  Fresh eggs collected daily — 5-crate minimum, all grades",
  "💰  Bulk pricing from 20 bags · call +233 XX XXX XXXX",
  "🚚  Delivery across Ghana · farm pickup available",
];

export default function Header() {
  const { totalItems } = useCart();
  const pathname     = usePathname();
  const isHome       = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open,     setOpen]     = useState(false);
  const [tick,     setTick]     = useState(0);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    fn();
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(i => (i + 1) % TICKERS.length), 4500);
    return () => clearInterval(t);
  }, []);

  const transparent = isHome && !scrolled && !open;

  return (
    <>
      {/* Ticker */}
      <div className={`relative overflow-hidden py-1.5 text-center text-xs font-medium transition-colors duration-300 ${
        transparent ? "bg-black/30 text-white/80 backdrop-blur-sm" : "bg-ink text-white/70"
      }`}>
        <span key={tick} className="animate-fade-in">{TICKERS[tick]}</span>
      </div>

      {/* Header */}
      <header className={`sticky top-0 z-50 transition-all duration-300 ${
        transparent
          ? "bg-transparent"
          : "border-b border-sand/60 bg-cream/95 shadow-sm backdrop-blur-md"
      }`}>
        <div className="mx-auto flex max-w-8xl items-center justify-between px-5 py-3 sm:px-8">
          {/* Logo */}
          {transparent ? (
            <Logo variant="light-lockup" height={38} />
          ) : (
            <Logo variant="lockup" height={38} />
          )}

          {/* Desktop nav */}
          <nav className="hidden items-center gap-0.5 lg:flex">
            {NAV.map(n => (
              <Link key={n.href} href={n.href}
                className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  transparent
                    ? "text-white/80 hover:bg-white/10 hover:text-white"
                    : "text-stone hover:bg-warm hover:text-brand"
                }`}>
                {n.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <a href="tel:+233XXXXXXXX"
              className={`hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition lg:flex ${
                transparent
                  ? "text-white/70 hover:bg-white/10 hover:text-white"
                  : "border border-sand text-stone hover:border-brand hover:text-brand"
              }`}>
              <Phone size={12} /> +233 XX XXX XXXX
            </a>

            {/* Cart */}
            <Link href="/cart" aria-label="Cart"
              className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition ${
                transparent ? "text-white hover:bg-white/12" : "text-stone hover:bg-warm"
              }`}>
              <ShoppingCart size={19} />
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white shadow-brandSm">
                  {totalItems > 9 ? "9+" : totalItems}
                </span>
              )}
            </Link>

            <Link href="/products"
              className="hidden rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-brandSm transition hover:bg-brandDark active:scale-95 sm:block">
              Order Now
            </Link>

            <button onClick={() => setOpen(!open)} aria-label="Menu"
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition lg:hidden ${
                transparent ? "text-white hover:bg-white/12" : "text-stone hover:bg-warm"
              }`}>
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="border-t border-sand/50 bg-cream px-5 pb-6 pt-4 lg:hidden">
            <nav className="space-y-0.5">
              {NAV.map(n => (
                <Link key={n.href} href={n.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-2.5 text-sm font-medium text-stone hover:bg-warm hover:text-brand transition">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-5 space-y-2.5">
              <Link href="/products" onClick={() => setOpen(false)}
                className="block rounded-xl bg-brand py-3 text-center text-sm font-bold text-white shadow-brand">
                Order Now
              </Link>
              <a href="tel:+233XXXXXXXX"
                className="flex items-center justify-center gap-2 rounded-xl border border-sand py-3 text-sm font-medium text-stone">
                <Phone size={14} /> +233 XX XXX XXXX
              </a>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
