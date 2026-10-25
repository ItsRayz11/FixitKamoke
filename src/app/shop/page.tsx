import type { Metadata } from "next";
import Link from "next/link";
import { listCategories, listProducts, type ProductFilter } from "@/lib/catalog";
import { ProductCard } from "@/components/product/product-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shop", description: "Browse phone chargers, cables, cases, protection and more with PKR prices." };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (v: string) => (v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : undefined);

export default async function ShopPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 80);
  const category = one(sp.category).slice(0, 60);
  const sortRaw = one(sp.sort);
  const sort = (["newest", "price_asc", "price_desc", "name"] as const).find((s) => s === sortRaw) ?? "newest";
  const filter: ProductFilter = { q, category: category || undefined, min: num(one(sp.min)), max: num(one(sp.max)), inStock: one(sp.stock) === "1", sort };

  const [categories, products] = await Promise.all([listCategories(), listProducts(filter)]);
  const active = Boolean(q || category || filter.min !== undefined || filter.max !== undefined || filter.inStock);

  const input = "mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm";
  const filters = (
    <form action="/shop" method="get" className="space-y-4">
      <div>
        <label htmlFor="f-q" className="text-sm font-semibold">Search</label>
        <input id="f-q" name="q" defaultValue={q} placeholder="Name, brand or phone model" className={input} />
      </div>
      <div>
        <label htmlFor="f-cat" className="text-sm font-semibold">Category</label>
        <select id="f-cat" name="category" defaultValue={category} className={input}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label htmlFor="f-min" className="text-sm font-semibold">Min (Rs.)</label><input id="f-min" name="min" inputMode="numeric" defaultValue={one(sp.min)} className={input} /></div>
        <div><label htmlFor="f-max" className="text-sm font-semibold">Max (Rs.)</label><input id="f-max" name="max" inputMode="numeric" defaultValue={one(sp.max)} className={input} /></div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="stock" value="1" defaultChecked={filter.inStock} className="h-5 w-5" /> In stock only</label>
      <div>
        <label htmlFor="f-sort" className="text-sm font-semibold">Sort by</label>
        <select id="f-sort" name="sort" defaultValue={sort} className={input}>
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="name">Name</option>
        </select>
      </div>
      <div className="flex gap-3">
        <button className="min-h-11 flex-1 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">Apply</button>
        {active && <Link href="/shop" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-accent">Clear</Link>}
      </div>
    </form>
  );

  return (
    <div className="container-x py-8">
      <h1 className="text-2xl font-extrabold">{q ? `Results for “${q}”` : "Shop all"}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Mobile: filters open in a disclosure. Desktop: always-visible sidebar. */}
        <details className="rounded-[var(--radius-md)] border border-line bg-surface p-4 lg:hidden">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold leading-[2.75rem]">Filters & sorting</summary>
          <div className="pt-3">{filters}</div>
        </details>
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-24 rounded-[var(--radius-md)] border border-line bg-surface p-4">{filters}</div>
        </aside>
        <section aria-label="Products">
          <p className="text-sm text-muted" aria-live="polite">{products.length} product{products.length === 1 ? "" : "s"}</p>
          {products.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-10 text-center">
              <p className="font-semibold">{active ? "No products match your search." : "No products have been added yet."}</p>
              {active && <p className="mt-1 text-sm text-muted">Try a shorter search, or clear the filters.</p>}
              {active && <Link href="/shop" className="mt-4 inline-block font-semibold text-accent">Clear all filters</Link>}
            </div>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              {products.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
