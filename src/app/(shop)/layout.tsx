import { site } from "@/config/site";
import { whatsappLink } from "@/lib/whatsapp";
import { getStore } from "@/lib/settings";
import { CartToast } from "@/components/cart/cart-toast";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const dynamic = "force-dynamic";

/** Public storefront chrome. The admin area and account pages use their own layouts. */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const store = await getStore();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      {site.demoMode && (
        <div className="bg-amber-300 px-4 py-1.5 text-center text-xs font-semibold text-ink">
          DEMO DATA — products and prices below are test placeholders, not real inventory.
        </div>
      )}
      {store.announcement && (
        <div className="bg-accent px-4 py-1.5 text-center text-xs font-semibold text-white">{store.announcement}</div>
      )}
      <SiteHeader whatsapp={whatsappLink({ kind: "general" }, store.whatsappNumber)} />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
      <CartToast />
    </>
  );
}
