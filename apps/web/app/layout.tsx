import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "../components/providers";

export const metadata: Metadata = {
  title: "Akoko ERP",
  description: "Akoko Solutions agribusiness ERP",
  icons: {
    icon: "/brand/akoko-mark.svg",
    shortcut: "/brand/akoko-icon.png",
    apple: "/brand/akoko-icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
