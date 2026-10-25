import Link from "next/link";
import { availability, type Product } from "@/lib/catalog";
import { Price } from "@/components/ui/price";
import { AddToCartButton } from "@/components/cart/add-to-cart";

export function StockBadge({ stock }: { stock: number }) {
  const a = availability(stock);
  const map = {
    in_stock: ["In stock", "bg-emerald-50 text-ok"],
    low_stock: [`Only ${stock} left`, "bg-amber-50 text-warn"],
    out_of_stock: ["Out of stock", "bg-slate-100 text-muted"],
  } as const;
  const [label, cls] = map[a];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function ProductCard({ product: p }: { product: Product }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] motion-reduce:transition-none motion-reduce:hover:transform-none">
      <Link href={`/product/${p.slug}`} className="block" aria-label={p.name}>
        <div className="relative aspect-square bg-canvas">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote owner-supplied URLs; sized by aspect box to avoid layout shift
            <img src={p.image.url} alt={p.image.alt} width={400} height={400} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">Photo coming soon</div>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {p.brand && <p className="text-xs font-medium uppercase tracking-wide text-muted">{p.brand}</p>}
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
          <Link href={`/product/${p.slug}`} className="hover:text-accent">{p.name}</Link>
        </h3>
        <Price price={p.price} salePrice={p.salePrice} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <StockBadge stock={p.stock} />
        </div>
        <AddToCartButton productId={p.id} name={p.name} disabled={p.stock <= 0} compact />
      </div>
    </article>
  );
}
