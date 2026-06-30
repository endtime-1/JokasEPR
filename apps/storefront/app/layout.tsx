import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title:       { default: "Akoko Solutions", template: "%s | Akoko Solutions" },
  description: "Premium poultry feed, fresh farm eggs, ready broiler chickens, and soya products — direct from Akoko Solutions, Ghana.",
  keywords:    ["poultry feed", "broiler", "layer mash", "soya cake", "farm eggs", "Ghana", "Akoko Solutions"],
  openGraph:   { siteName: "Akoko Solutions", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-cream">
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
