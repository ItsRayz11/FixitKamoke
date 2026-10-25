import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/config/site";
import { whatsappLink } from "@/lib/whatsapp";
import { CartProvider } from "@/components/cart/cart-store";
import { CartToast } from "@/components/cart/cart-toast";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(site.baseUrl),
  title: { default: "Fixit | Mobile repair and accessories in Kamoki", template: "%s | Fixit" },
  description: "Phone repairs, chargers, cases and mobile accessories with clear prices and WhatsApp support.",
  openGraph: { siteName: "Fixit", type: "website", locale: "en_PK" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <CartProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
            Skip to content
          </a>
          {site.demoMode && (
            <div className="bg-amber-300 px-4 py-1.5 text-center text-xs font-semibold text-ink">
              DEMO DATA — products and prices below are test placeholders, not real inventory.
            </div>
          )}
          <SiteHeader whatsapp={whatsappLink({ kind: "general" })} />
          <main id="main" className="flex-1">{children}</main>
          <SiteFooter />
          <CartToast />
        </CartProvider>
      </body>
    </html>
  );
}
