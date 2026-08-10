import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const SITE_ORIGIN = (process.env.SITE_URL || process.env.WEB_ORIGIN || "https://jokasfarms.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title:       { default: "Akoko Solutions", template: "%s | Akoko Solutions" },
  description: "Premium poultry feed, fresh farm eggs, ready broiler chickens, and soya products — direct from Akoko Solutions, Ghana.",
  keywords:    ["poultry feed", "broiler", "layer mash", "soya cake", "farm eggs", "Ghana", "Akoko Solutions"],
  openGraph:   { siteName: "Akoko Solutions", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-cream">
        {/* Runs before paint so .reveal's opacity:0 only ever applies once JS
            has actually confirmed it's running — see the .js .reveal rule in
            globals.css. No-JS or a failed script load leaves content visible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
