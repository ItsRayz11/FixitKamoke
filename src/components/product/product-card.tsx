import { optimizeImageUrl } from "@/lib/domain/images";
import type { Product } from "@/lib/catalog";
import { StockBadge } from "@/components/product/stock-badge";
import { Price } from "@/components/ui/price";
import { AddToCartButton } from "@/components/cart/add-to-cart";
import { TrackedLink } from "@/components/analytics/tracked-link";

export function ProductCard({ product: p }: { product: Product }) {
  const finishes = p.finishes ?? [];
  const many = finishes.length > 1;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] motion-reduce:transition-none motion-reduce:hover:transform-none">
      {/* The picture link duplicates the title link below, so it is hidden from keyboard and screen-reader users. */}
      <TrackedLink event="product_click" href={`/product/${p.slug}`} className="block" aria-hidden="true" tabIndex={-1}>
        <div className="stage relative aspect-square !rounded-none !border-0 !shadow-none">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote owner-supplied URLs; sized by aspect box to avoid layout shift
            <img src={optimizeImageUrl(p.image.url, 500)} alt={p.image.alt} width={400} height={400} loading="lazy" decoding="async" className="h-full w-full object-contain p-2" />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">Photo coming soon</div>
          )}
        </div>
      </TrackedLink>
      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        {p.brand && <p className="text-xs font-medium uppercase tracking-wide text-muted">{p.brand}</p>}
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
          <TrackedLink event="product_click" href={`/product/${p.slug}`} className="hover:text-accent">{p.name}</TrackedLink>
        </h3>
        {many && (
          <ul className="flex items-center gap-1.5" aria-label={`${finishes.length} finishes: ${finishes.map((f) => f.label).join(", ")}`}>
            {finishes.slice(0, 5).map((f) => (
              <li key={f.label} className="swatch-dot !h-4 !w-4" style={{ background: f.hex ?? "#cbd2dd", opacity: f.inStock ? 1 : 0.45 }} title={f.label} />
            ))}
            {finishes.length > 5 && <li className="text-xs text-muted">+{finishes.length - 5}</li>}
          </ul>
        )}
        <Price price={p.price} salePrice={p.salePrice} />
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <StockBadge stock={p.stock} />
        </div>
        {many
          ? <TrackedLink event="product_click" href={`/product/${p.slug}`} className="btn btn-ti w-full">Choose finish</TrackedLink>
          : <AddToCartButton productId={p.id} name={p.variantLabel ? `${p.name} — ${p.variantLabel}` : p.name} disabled={p.stock <= 0} compact />}
      </div>
    </article>
  );
}
