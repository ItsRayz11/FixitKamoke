import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { availability, effectivePrice, getProductBySlug, relatedProducts } from "@/lib/catalog";
import { site } from "@/config/site";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { Price } from "@/components/ui/price";
import { AddToCartButton } from "@/components/cart/add-to-cart";
import { StockBadge, ProductCard } from "@/components/product/product-card";

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

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const related = await relatedProducts(p);
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

      {related.length > 0 && (
        <section className="mt-12" aria-labelledby="rel">
          <h2 id="rel" className="text-lg font-bold">Related products</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {related.map((r) => <li key={r.id}><ProductCard product={r} /></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
