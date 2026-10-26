import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { availability, collapseFinishes, compatibleProducts, effectivePrice, getProductBySlug, getProductImages, getSpinFrames, getVariants, relatedProducts } from "@/lib/catalog";
import { ProductShowcase } from "@/components/product/product-showcase";
import { ProductView } from "@/components/product/product-view";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { site } from "@/config/site";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { ProductCard } from "@/components/product/product-card";
import { getCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { approvedReviews, canReview } from "@/lib/reviews";
import { postsForProduct } from "@/lib/blog";
import { getShippingConfig } from "@/lib/orders/create-order";
import { formatPKR } from "@/lib/domain/money";
import { KeepForm } from "@/components/admin/keep-form";
import { toggleWishlistAction } from "../../account/actions";
import { submitReviewAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return { title: "Product not found" };
  const title = p.variantLabel ? `${p.name} — ${p.variantLabel}` : p.name;
  return {
    title,
    description: p.description.slice(0, 155) || `${p.name} at Fixit.`,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title, images: p.image ? [p.image.url] : undefined },
  };
}

const SPEC_ROW = "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const db = await getDb();
  const customer = await getCustomer();
  const [images, relatedRaw, compatibleRaw, variants, guides, shipping, reviews, reviewState, saved] = await Promise.all([
    getProductImages(p.id),
    relatedProducts(p),
    compatibleProducts(p),
    getVariants(p),
    postsForProduct(p.slug, 2),
    getShippingConfig(db),
    approvedReviews(db, p.id),
    customer ? canReview(db, customer.id, p.id) : Promise.resolve(null),
    customer ? db.query("select 1 from wishlist_items where customer_id = $1 and product_id = $2", [customer.id, p.id]).then((r) => r.length > 0) : Promise.resolve(false),
  ]);
  const spinMap = await getSpinFrames([p.id, ...variants.map((v) => v.id)]); // turntable frames, one set per finish
  const url = `${site.baseUrl}/product/${p.slug}`;
  const store = await getStore();
  const wa = whatsappLink({ kind: "product", name: p.variantLabel ? `${p.name} (${p.variantLabel})` : p.name, url }, store.whatsappNumber);
  const a = availability(p.stock);

  // Structured data uses only real catalogue facts. No ratings or review counts are ever emitted.
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.variantLabel ? `${p.name} — ${p.variantLabel}` : p.name,
    sku: p.sku ?? undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    color: p.variantLabel ?? undefined,
    description: p.description || undefined,
    image: images.length ? images.map((i) => i.url) : undefined,
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

  // Other finishes of this same item are choices on this page, not separate recommendations.
  const others = (list: typeof relatedRaw) => collapseFinishes(list.filter((r) => !p.variantGroup || r.variantGroup !== p.variantGroup));
  const related = others(relatedRaw);
  const compatible = others(compatibleRaw);

  const specs = Object.entries(p.specs);
  const keySpecs = specs.slice(0, 4);
  const moreSpecs = specs.slice(4);
  const shownDevices = p.compatibleDevices.slice(0, 6);
  const hasMore = moreSpecs.length > 0 || Boolean(p.sku) || Boolean(p.brand) || p.compatibleDevices.length > shownDevices.length;
  const zones = (shipping?.zones ?? []).slice(0, 3);

  const specsSlot = (shownDevices.length > 0 || keySpecs.length > 0) && (
    <section className="mt-6 space-y-4" aria-label="Compatibility and key specifications">
      {shownDevices.length > 0 && (
        <div>
          <h2 className="text-sm font-bold">Works with</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {shownDevices.map((d) => (
              <li key={d}><Link href={`/shop?q=${encodeURIComponent(d)}`} className="ti-surface inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium">{d}</Link></li>
            ))}
          </ul>
        </div>
      )}
      {keySpecs.length > 0 && (
        <div>
          <h2 className="text-sm font-bold">Key specifications</h2>
          <dl className="mt-2 divide-y divide-line overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface text-sm">
            {keySpecs.map(([k, v]) => <div key={k} className={`${SPEC_ROW} px-3.5 py-2.5`}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
        </div>
      )}
    </section>
  );

  const afterBuySlot = (
    <>
      <section className="mt-6 divide-y divide-line overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface text-sm" aria-label="Delivery, returns and warranty">
        <div className="p-3.5">
          <h2 className="font-bold">Delivery</h2>
          {zones.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-muted">
              {zones.map((z) => (
                <li key={z.id}>
                  {z.label}: {z.fee === 0 ? "free" : formatPKR(z.fee)}
                  {z.freeThreshold ? `, free over ${formatPKR(z.freeThreshold)}` : ""}
                  {z.etaDays ? `, ${z.etaDays[0]}–${z.etaDays[1]} days` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted">Delivery fee and time are shown at checkout before you confirm your order.</p>
          )}
          <p className="mt-1 text-xs text-muted">The exact fee for your city is always shown before you place the order.</p>
        </div>
        <div className="p-3.5">
          <h2 className="font-bold">Returns</h2>
          <p className="mt-1 text-muted">Read how returns and refunds work in our <Link href="/policies/returns" className="font-semibold text-accent underline">returns policy</Link>.</p>
        </div>
        <div className="p-3.5">
          <h2 className="font-bold">Warranty</h2>
          <p className="mt-1 text-muted">{p.warrantyInfo ?? "No warranty has been listed for this item."} See the <Link href="/policies/warranty" className="font-semibold text-accent underline">warranty policy</Link>.</p>
        </div>
      </section>
      <div className="mt-3 flex flex-wrap items-center gap-x-5">
        <form action={toggleWishlistAction}>
          <input type="hidden" name="productId" value={p.id} /><input type="hidden" name="slug" value={p.slug} />
          <button className="min-h-11 text-sm font-semibold text-accent underline">{saved ? "Saved to your wishlist (remove)" : "Save to wishlist"}</button>
        </form>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">Ask about this product on WhatsApp</a>}
      </div>
    </>
  );

  return (
    <div className="container-x has-purchase-bar py-5 sm:py-8 lg:pb-8">
      <ProductView productId={p.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
        <Link href="/shop" className="hover:text-accent">Shop</Link>
        {p.categoryName && <> / <Link href={`/category/${p.categorySlug}`} className="hover:text-accent">{p.categoryName}</Link></>}
        <span className="hidden sm:inline">{" / "}<span aria-current="page">{p.name}</span></span>
      </nav>

      <ProductShowcase
        base={{ id: p.id, slug: p.slug, name: p.name, brand: p.brand, description: p.description, price: p.price, salePrice: p.salePrice, stock: p.stock, images, spin: spinMap[p.id] ?? [] }}
        variants={variants.map((v) => ({ id: v.id, slug: v.slug, label: v.label, hex: v.hex, price: v.price, salePrice: v.salePrice, stock: v.stock, images: v.images, spin: spinMap[v.id] ?? [] }))}
        required={p.variantRequired}
        specsSlot={specsSlot}
        afterBuySlot={afterBuySlot}
      />

      {hasMore && (
        <details className="group mt-8 rounded-[var(--radius-md)] border border-line bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-base font-bold">
            Full details
            <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-line px-4 py-3 text-sm">
            <dl className="divide-y divide-line">
              {p.brand && <div className={`${SPEC_ROW} py-2`}><dt className="text-muted">Brand</dt><dd>{p.brand}</dd></div>}
              {p.sku && <div className={`${SPEC_ROW} py-2`}><dt className="text-muted">SKU</dt><dd>{p.sku}</dd></div>}
              {moreSpecs.map(([k, v]) => <div key={k} className={`${SPEC_ROW} py-2`}><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
              {p.compatibleDevices.length > shownDevices.length && (
                <div className={`${SPEC_ROW} py-2`}><dt className="text-muted">All compatible devices</dt><dd>{p.compatibleDevices.join(", ")}</dd></div>
              )}
            </dl>
          </div>
        </details>
      )}

      <section className="mt-10" aria-labelledby="reviews">
        <h2 id="reviews" className="text-lg font-bold">Customer reviews</h2>
        {sp.ok && <p role="status" className="mt-3 rounded-[var(--radius-sm)] bg-emerald-50 p-3 text-sm font-semibold text-ok">{sp.ok}</p>}
        {sp.error && <p role="alert" className="mt-3 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{sp.error}</p>}
        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No reviews yet. Reviews come only from customers who received this product.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4 text-sm">
                <p><span aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> <strong className="ml-2">{r.authorName}</strong> <span className="text-xs text-muted">· verified purchase{r.finish ? ` · ${r.finish}` : ""}</span></p>
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
              <select id="rating" name="rating" className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base" defaultValue="">
                <option value="" disabled>Choose…</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>)}
              </select></div>
            <div><label htmlFor="body" className="text-sm font-semibold">Your review</label><textarea id="body" name="body" required rows={4} className="mt-1 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-base" /></div>
            <button className="btn btn-primary">Submit review</button>
            <p className="text-xs text-muted">Reviews are checked by our team before they appear.</p>
          </KeepForm>
        )}
        {reviewState === "not_purchased" && <p className="mt-3 text-xs text-muted">Signed-in customers who have received this product can leave a review.</p>}
      </section>

      {compatible.length > 0 && (
        <section className="mt-10" aria-labelledby="compat">
          <h2 id="compat" className="text-lg font-bold">Other accessories for the same phones</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{compatible.map((r) => <li key={r.id}><ProductCard product={r} /></li>)}</ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-10" aria-labelledby="rel">
          <h2 id="rel" className="text-lg font-bold">Related products</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {related.map((r) => <li key={r.id}><ProductCard product={r} /></li>)}
          </ul>
        </section>
      )}

      <section className="mt-10 grid gap-4 md:grid-cols-2" aria-labelledby="help">
        <h2 id="help" className="sr-only">Buying advice and support</h2>
        <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h3 className="font-bold">Buying advice</h3>
          {guides.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm">
              {guides.map((g) => (
                <li key={g.id}><Link href={`/blog/${g.slug}`} className="font-semibold text-accent underline">{g.title}</Link>{g.excerpt && <span className="block text-muted">{g.excerpt}</span>}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Guides will appear here as we publish them.</p>
          )}
          <Link href="/blog" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline">All buying guides</Link>
        </div>
        <div className="ti-surface rounded-[var(--radius-md)] p-4">
          <h3 className="font-bold">Need a hand choosing?</h3>
          <p className="mt-1 text-sm">Ask us before you order, or book a repair if your phone needs fixing.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Ask on WhatsApp</a>}
            <Link href="/contact" className="btn btn-ti">Contact us</Link>
            <Link href="/repairs" className="btn btn-ti">Book a repair</Link>
          </div>
        </div>
      </section>
      <div className="-mx-4 mt-10"><RecentlyViewed excludeId={p.id} /></div>
    </div>
  );
}
