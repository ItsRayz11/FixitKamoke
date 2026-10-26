import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCategories, listProducts } from "@/lib/catalog";
import { TrackView } from "@/components/analytics/track-view";
import { ProductCard } from "@/components/product/product-card";
import { site } from "@/config/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = (await listCategories()).find((x) => x.slug === slug);
  if (!c) return { title: "Category not found" };
  return { title: c.name, description: c.description ?? `Shop ${c.name} at Fixit with PKR prices and clear stock.`, alternates: { canonical: `/category/${c.slug}` } };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = (await listCategories()).find((x) => x.slug === slug);
  if (!cat) notFound();
  const products = await listProducts({ category: slug, limit: 100, collapse: true });
  const jsonLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: site.baseUrl },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${site.baseUrl}/shop` },
      { "@type": "ListItem", position: 3, name: cat.name, item: `${site.baseUrl}/category/${cat.slug}` },
    ],
  };
  return (
    <div className="container-x py-6 sm:py-8">
      <TrackView event="listing_view" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/shop" className="hover:text-accent">Shop</Link> / <span aria-current="page">{cat.name}</span></nav>
      <h1 className="mt-2 text-2xl font-extrabold">{cat.name}</h1>
      {cat.description && <p className="mt-1 max-w-2xl text-muted">{cat.description}</p>}
      <p className="mt-2 text-sm"><Link href={`/shop?category=${cat.slug}`} className="font-semibold text-accent underline">Filter and sort this category</Link></p>
      {products.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-10 text-center text-muted">No products in this category yet.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{products.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}</ul>
      )}
    </div>
  );
}
