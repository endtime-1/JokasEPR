import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "../components/providers";

export const metadata: Metadata = {
  title: "AKOKO SOLUTIONS ERP",
  description: "AKOKO SOLUTIONS agribusiness ERP",
  icons: {
    icon: "/brand/akoko-icon.png",
    shortcut: "/brand/akoko-icon.png",
    apple: "/brand/akoko-icon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
