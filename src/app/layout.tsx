import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// viewport-fit=cover lets pages use the device safe-area insets. Pinch zoom stays enabled (accessibility).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1220" };

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
