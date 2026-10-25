import Link from "next/link";
import { listCategories, listProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product/product-card";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, featured] = await Promise.all([listCategories(), listProducts({ inStock: true, limit: 8 })]);
  const store = await getStore();
  const wa = whatsappLink({ kind: "general" }, store.whatsappNumber);

  return (
    <>
      <section className="grid-motif bg-ink text-white">
        <div className="container-x py-14 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan">Kamoki, Punjab</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {store.heroTitle ?? "Phone repairs and accessories you can order in minutes."}
          </h1>
          <p className="mt-4 max-w-xl text-slate-300">
            {store.heroSubtitle ?? "Browse chargers, cases and more with clear PKR prices, or book a repair and we will confirm the details with you before any work starts."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/shop" className="inline-flex min-h-12 items-center rounded-[var(--radius-sm)] bg-accent px-6 font-semibold hover:bg-accent-strong">Shop accessories</Link>
            <Link href="/repairs" className="inline-flex min-h-12 items-center rounded-[var(--radius-sm)] border border-white/25 px-6 font-semibold hover:bg-white/10">Book a repair</Link>
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center px-2 font-semibold text-cyan underline">Ask on WhatsApp</a>}
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="container-x py-10" aria-labelledby="cats">
          <h2 id="cats" className="text-xl font-bold">Shop by category</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.slug}`} className="flex min-h-20 items-center justify-center rounded-[var(--radius-md)] border border-line bg-surface p-4 text-center text-sm font-semibold shadow-[var(--shadow-card)] transition-colors hover:border-accent hover:text-accent">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container-x pb-10" aria-labelledby="featured">
        <div className="flex items-end justify-between">
          <h2 id="featured" className="text-xl font-bold">Available now</h2>
          <Link href="/shop" className="text-sm font-semibold text-accent">View all</Link>
        </div>
        {featured.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-8 text-center text-muted">
            Products are being added. Please check back soon, or message us to ask about an item.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {featured.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
          </ul>
        )}
      </section>

      <section className="bg-surface py-12">
        <div className="container-x grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold">Repairs, confirmed before we start</h2>
            <p className="mt-2 text-muted">Tell us your phone model and the fault. We review your request, give you an estimate, and only proceed once you agree. Estimates are not final prices until we confirm them.</p>
            <Link href="/repairs" className="mt-4 inline-block font-semibold text-accent">Request a repair →</Link>
          </div>
          <div>
            <h2 className="text-xl font-bold">Delivery</h2>
            <p className="mt-2 text-muted">Delivery fees and times are shown at checkout before you place an order. If we cannot confirm a rate for your city automatically, we will tell you before the order is confirmed.</p>
            {store.address && <p className="mt-3 text-sm"><strong>Shop:</strong> {store.address}</p>}
          </div>
        </div>
      </section>
    </>
  );
}
