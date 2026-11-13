"use client";

import Link from "next/link";
import { Sheet } from "@/components/ui/sheet";
import { Price } from "@/components/ui/price";
import { StockBadge } from "@/components/product/stock-badge";
import { AddToCartButton } from "@/components/cart/add-to-cart";
import { optimizeImageUrl } from "@/lib/domain/images";

export interface QuickViewProduct {
  id: string; slug: string; name: string; brand: string | null; description: string; price: number; salePrice: number | null; stock: number;
  image: { url: string; alt: string } | null; hasFinishes: boolean;
}

/** A fast look at a product without leaving the list: photo, real price, real stock, and the buy button. Finishes go to the full page. */
export function QuickView({ p }: { p: QuickViewProduct }) {
  const blurb = p.description.length > 220 ? `${p.description.slice(0, 217).trimEnd()}…` : p.description;
  return (
    <Sheet
      title={p.name}
      description={p.brand ?? undefined}
      trigger={<>Quick view<span className="sr-only">: {p.name}</span></>}
      triggerClassName="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-2 text-xs font-semibold text-accent underline-offset-2 hover:underline"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="stage aspect-square min-w-0">
          {p.image
            // eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL; the box reserves the size
            ? <img src={optimizeImageUrl(p.image.url, 600)} alt={p.image.alt} width={480} height={480} loading="lazy" decoding="async" className="h-full w-full object-contain p-2" />
            : <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted">Photo coming soon</div>}
        </div>
        <div className="min-w-0 space-y-3">
          <Price price={p.price} salePrice={p.salePrice} size="lg" />
          <StockBadge stock={p.stock} />
          {blurb && <p className="text-sm text-muted">{blurb}</p>}
          {p.hasFinishes
            ? <Link href={`/product/${p.slug}`} className="btn btn-primary w-full">Choose a finish</Link>
            : <AddToCartButton productId={p.id} name={p.name} disabled={p.stock <= 0} max={p.stock} compact />}
          <Link href={`/product/${p.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">See full details</Link>
        </div>
      </div>
    </Sheet>
  );
}
