import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "./dark-overrides.css";
import { Providers } from "../components/providers";
import { ChunkErrorHandler } from "../components/chunk-error-handler";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F4F0" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0D0B" }
  ]
};

export const metadata: Metadata = {
  applicationName: "Akoko ERP",
  appleWebApp: { capable: true, title: "Akoko ERP", statusBarStyle: "default" },
  title: "AKOKO SOLUTIONS ERP",
  description: "AKOKO SOLUTIONS agribusiness ERP",
  icons: {
    icon: "/brand/akoko-icon.png",
    shortcut: "/brand/akoko-icon.png",
    apple: "/brand/akoko-icon.png"
  }
};

// Runs before first paint so there is no light flash for people on dark mode.
// "akoko-theme" is light | dark | system (default: follow the computer's setting).
const themeInit = `try{var t=localStorage.getItem('akoko-theme');var d=t==='dark'||((t==null||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.setAttribute('data-theme',d?'dark':'light');r.style.colorScheme=d?'dark':'light'}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} font-sans`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body suppressHydrationWarning>
        <ChunkErrorHandler />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
