import type { Metadata } from "next";
import Link from "next/link";
import { getStore } from "@/lib/settings";
import { site } from "@/config/site";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About Fixit", description: "Fixit is a mobile repair and accessories shop in Kamoki, Punjab.", alternates: { canonical: "/about" } };

export default async function AboutPage() {
  const store = await getStore();
  const founder = store.showFounder && store.founderMessage;
  return (
    <div className="container-x max-w-3xl py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">About Fixit</h1>
      <p className="mt-4 text-lg text-muted">Fixit is a mobile repair and accessories shop in Kamoki, Punjab. You can order accessories online, or send us a phone for repair and we will review the problem and confirm the price with you before any work starts.</p>

      <section aria-labelledby="how" className="mt-8">
        <h2 id="how" className="text-xl font-bold">How we work</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-muted">
          <li>Prices are shown in rupees and checked again when you order.</li>
          <li>Stock is real: we do not take orders for items we do not have.</li>
          <li>Delivery fees are shown before you place an order. If we cannot work out the fee for your city, we tell you and confirm it with you first.</li>
          <li>For repairs, an estimate is not a final price. We confirm the price before work starts.</li>
          <li>You can reach us on WhatsApp for questions about products, orders and repairs.</li>
        </ul>
      </section>

      {founder && (
        <section aria-labelledby="founder" className="mt-10 rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h2 id="founder" className="text-xl font-bold">A message from {site.founder}, founder</h2>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row">
            {store.founderPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote photo
              <img src={store.founderPhotoUrl} alt={`${site.founder}, founder of Fixit`} width={160} height={160} className="h-40 w-40 rounded-[var(--radius-md)] object-cover" />
            )}
            <div>{renderMarkdown(store.founderMessage!)}</div>
          </div>
        </section>
      )}

      <section aria-labelledby="visit" className="mt-10">
        <h2 id="visit" className="text-xl font-bold">Visit or contact us</h2>
        <p className="mt-2 text-muted">{store.address ?? "Shop address to be confirmed."}{store.openingHours ? ` · ${store.openingHours}` : ""}</p>
        <p className="mt-3"><Link href="/contact" className="font-semibold text-accent underline">Contact us</Link> · <Link href="/repairs" className="font-semibold text-accent underline">Request a repair</Link> · <Link href="/shop" className="font-semibold text-accent underline">Shop accessories</Link></p>
      </section>
    </div>
  );
}
