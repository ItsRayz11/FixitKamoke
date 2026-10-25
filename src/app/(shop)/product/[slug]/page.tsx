import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { availability, compatibleProducts, effectivePrice, getProductBySlug, relatedProducts } from "@/lib/catalog";
import { ProductView } from "@/components/product/product-view";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { site } from "@/config/site";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { Price } from "@/components/ui/price";
import { AddToCartButton } from "@/components/cart/add-to-cart";
import { StockBadge, ProductCard } from "@/components/product/product-card";
import { getCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { approvedReviews, canReview } from "@/lib/reviews";
import { KeepForm } from "@/components/admin/keep-form";
import { toggleWishlistAction } from "../../account/actions";
import { submitReviewAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return { title: "Product not found" };
  return {
    title: p.name,
    description: p.description.slice(0, 155) || `${p.name} at Fixit.`,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title: p.name, images: p.image ? [p.image.url] : undefined },
  };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const db = await getDb();
  const customer = await getCustomer();
  const [related, compatible, reviews, reviewState, saved] = await Promise.all([
    relatedProducts(p),
    compatibleProducts(p),
    approvedReviews(db, p.id),
    customer ? canReview(db, customer.id, p.id) : Promise.resolve(null),
    customer ? db.query("select 1 from wishlist_items where customer_id = $1 and product_id = $2", [customer.id, p.id]).then((r) => r.length > 0) : Promise.resolve(false),
  ]);
  const url = `${site.baseUrl}/product/${p.slug}`;
  const store = await getStore();
  const wa = whatsappLink({ kind: "product", name: p.name, url }, store.whatsappNumber);
  const a = availability(p.stock);

  // Structured data uses only real catalogue facts. No ratings or review counts are ever emitted.
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku ?? undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    description: p.description || undefined,
    image: p.image?.url,
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "PKR",
      price: effectivePrice(p),
      availability: a === "out_of_stock" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.baseUrl },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${site.baseUrl}/shop` },
      ...(p.categoryName ? [{ "@type": "ListItem", position: 3, name: p.categoryName, item: `${site.baseUrl}/category/${p.categorySlug}` }] : []),
      { "@type": "ListItem", position: p.categoryName ? 4 : 3, name: p.name, item: url },
    ],
  };
  const jsonLd = [productLd, breadcrumbLd];
  const specs = Object.entries(p.specs);

  return (
    <div className="container-x py-8">
      <ProductView productId={p.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/shop" className="hover:text-accent">Shop</Link>
        {p.categoryName && <> / <Link href={`/category/${p.categorySlug}`} className="hover:text-accent">{p.categoryName}</Link></>}
        {" / "}<span aria-current="page">{p.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL
            <img src={p.image.url} alt={p.image.alt} width={800} height={800} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted">Photo coming soon</div>
          )}
        </div>

        <div>
          {p.brand && <p className="text-sm font-medium uppercase tracking-wide text-muted">{p.brand}</p>}
          <h1 className="mt-1 text-2xl font-extrabold leading-tight">{p.name}</h1>
          <div className="mt-3"><Price price={p.price} salePrice={p.salePrice} size="lg" /></div>
          <div className="mt-3"><StockBadge stock={p.stock} /></div>
          {p.description && <p className="mt-4 text-muted">{p.description}</p>}

          <div className="mt-6">
            <AddToCartButton productId={p.id} name={p.name} disabled={p.stock <= 0} max={p.stock} />
          </div>

          <p className="mt-4 text-sm text-muted">
            Delivery fee and time are shown at checkout before you confirm your order. Stock is re-checked when you place the order.
          </p>
          <form action={toggleWishlistAction} className="mt-3">
            <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="slug" value={p.slug} />
            <button className="min-h-11 text-sm font-semibold text-accent underline">{saved ? "Saved to your wishlist (remove)" : "Save to wishlist"}</button>
          </form>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent underline">Ask about this product on WhatsApp</a>}
          {p.warrantyInfo && <p className="mt-4 text-sm"><strong>Warranty:</strong> {p.warrantyInfo}</p>}
        </div>
      </div>

      {(specs.length > 0 || p.compatibleDevices.length > 0) && (
        <section className="mt-10 grid gap-8 md:grid-cols-2" aria-label="Details">
          {specs.length > 0 && (
            <div>
              <h2 className="text-lg font-bold">Specifications</h2>
              <dl className="mt-3 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface text-sm">
                {specs.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-2 gap-3 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </div>
          )}
          {p.compatibleDevices.length > 0 && (
            <div>
              <h2 className="text-lg font-bold">Compatible devices</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.compatibleDevices.map((d) => <li key={d}><Link href={`/shop?q=${encodeURIComponent(d)}`} className="inline-block rounded-full border border-line bg-surface px-3 py-1 text-sm hover:border-accent">{d}</Link></li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="mt-12" aria-labelledby="reviews">
        <h2 id="reviews" className="text-lg font-bold">Customer reviews</h2>
        {sp.ok && <p role="status" className="mt-3 rounded-[var(--radius-sm)] bg-emerald-50 p-3 text-sm font-semibold text-ok">{sp.ok}</p>}
        {sp.error && <p role="alert" className="mt-3 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{sp.error}</p>}
        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No reviews yet. Reviews come only from customers who received this product.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4 text-sm">
                <p><span aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> <strong className="ml-2">{r.authorName}</strong> <span className="text-xs text-muted">· verified purchase</span></p>
                <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
        {reviewState === "yes" && (
          <KeepForm action={submitReviewAction} className="mt-4 space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <h3 className="font-bold">Write a review</h3>
            <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="slug" value={p.slug} />
            <div><label htmlFor="rating" className="text-sm font-semibold">Rating</label>
              <select id="rating" name="rating" className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm" defaultValue="">
                <option value="" disabled>Choose…</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
              </select></div>
            <div><label htmlFor="body" className="text-sm font-semibold">Your review</label><textarea id="body" name="body" required rows={4} className="mt-1 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-sm" /></div>
            <button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-sm font-semibold text-white">Submit review</button>
            <p className="text-xs text-muted">Reviews are checked by our team before they appear.</p>
          </KeepForm>
        )}
        {reviewState === "not_purchased" && <p className="mt-3 text-xs text-muted">Signed-in customers who have received this product can leave a review.</p>}
      </section>

      {compatible.length > 0 && (
        <section className="mt-12" aria-labelledby="compat">
          <h2 id="compat" className="text-lg font-bold">Other accessories for the same phones</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{compatible.map((r) => <li key={r.id}><ProductCard product={r} /></li>)}</ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12" aria-labelledby="rel">
          <h2 id="rel" className="text-lg font-bold">Related products</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {related.map((r) => <li key={r.id}><ProductCard product={r} /></li>)}
          </ul>
        </section>
      )}
      <div className="-mx-4 mt-10"><RecentlyViewed excludeId={p.id} /></div>
    </div>
  );
}
