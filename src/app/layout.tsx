import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(site.baseUrl),
  title: { default: "Fixit | Mobile repair and accessories in Kamoki", template: "%s | Fixit" },
  description: "Phone repairs, chargers, cases and mobile accessories with clear prices and WhatsApp support.",
  openGraph: { siteName: "Fixit", type: "website", locale: "en_PK" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
