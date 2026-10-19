import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

const SITE_ORIGIN = (process.env.SITE_URL || "https://akokofeeds.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title:       { default: "Akoko Feeds — Quality Feed, Higher Production", template: "%s | Akoko Feeds" },
  description: "Premium poultry feed, fresh farm eggs, ready broiler chickens, and soya products — direct from Akoko Feeds, Ghana.",
  keywords:    ["poultry feed", "broiler", "layer mash", "soya cake", "farm eggs", "Ghana", "Akoko Feeds", "Akoko Solutions"],
  openGraph:   { siteName: "Akoko Feeds", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-cream">
        {/* Runs before paint so .reveal's opacity:0 only ever applies once JS
            has actually confirmed it's running — see the .js .reveal rule in
            globals.css. No-JS or a failed script load leaves content visible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Akoko Feeds",
              legalName: "Akoko Solutions Limited",
              url: SITE_ORIGIN,
              logo: `${SITE_ORIGIN}/brand/akoko-icon.png`,
              slogan: "Quality feeds, best production",
              sameAs: ["https://www.akokosolutions.com"],
              telephone: "+233505455055",
              email: "farmersupport@akokofeeds.com",
              address: { "@type": "PostalAddress", addressLocality: "Kumasi", addressCountry: "GH", postOfficeBoxNumber: "KS3908" },
            }),
          }}
        />
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <WhatsAppButton />
        </CartProvider>
      </body>
    </html>
  );
}
