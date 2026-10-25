import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPost, relatedPosts } from "@/lib/blog";
import { getProductBySlug, type Product } from "@/lib/catalog";
import { renderMarkdown } from "@/lib/markdown";
import { site } from "@/config/site";
import { ProductCard } from "@/components/product/product-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPublishedPost((await params).slug);
  if (!p) return { title: "Article not found" };
  return {
    title: p.title,
    description: p.metaDescription ?? p.excerpt,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: { type: "article", title: p.title, description: p.metaDescription ?? p.excerpt, publishedTime: p.publishedAt ?? undefined, modifiedTime: p.updatedAt, images: p.coverUrl ? [p.coverUrl] : undefined },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPublishedPost((await params).slug);
  if (!post) notFound();
  const [more, products] = await Promise.all([
    relatedPosts(post),
    Promise.all(post.productSlugs.map((s) => getProductBySlug(s))).then((l) => l.filter((x): x is Product => x !== null)),
  ]);
  const url = `${site.baseUrl}/blog/${post.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.metaDescription ?? post.excerpt,
      datePublished: post.publishedAt, dateModified: post.updatedAt, mainEntityOfPage: url, image: post.coverUrl ?? undefined,
      author: { "@type": "Organization", name: post.author ?? "Fixit team" }, publisher: { "@type": "Organization", name: "Fixit" },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: site.baseUrl },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${site.baseUrl}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
  const share = encodeURIComponent(url);
  const text = encodeURIComponent(post.title);

  return (
    <article className="container-x max-w-3xl py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/blog" className="hover:text-accent">Guides</Link> / <span aria-current="page">{post.title}</span></nav>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">{post.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {post.author && <>By {post.author} · </>}
        {post.publishedAt && <>Published <time dateTime={post.publishedAt}>{new Date(post.publishedAt).toLocaleDateString("en-PK", { dateStyle: "long" })}</time></>}
        {new Date(post.updatedAt).getTime() - new Date(post.publishedAt ?? post.updatedAt).getTime() > 86_400_000 && <> · Updated <time dateTime={post.updatedAt}>{new Date(post.updatedAt).toLocaleDateString("en-PK", { dateStyle: "long" })}</time></>}
      </p>
      {post.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL
        <img src={post.coverUrl} alt="" width={1200} height={630} className="mt-6 aspect-[1200/630] w-full rounded-[var(--radius-md)] object-cover" />
      )}
      <div className="mt-2">{renderMarkdown(post.bodyMd)}</div>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-sm">
        <span className="font-semibold">Share:</span>
        <a className="min-h-11 font-semibold text-accent underline" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${text}%20${share}`}>WhatsApp</a>
        <a className="min-h-11 font-semibold text-accent underline" target="_blank" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${share}`}>Facebook</a>
      </div>

      {products.length > 0 && (
        <section aria-labelledby="prods" className="mt-10">
          <h2 id="prods" className="text-xl font-bold">Related products</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">{products.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}</ul>
        </section>
      )}
      {more.length > 0 && (
        <section aria-labelledby="more" className="mt-10">
          <h2 id="more" className="text-xl font-bold">More guides</h2>
          <ul className="mt-3 space-y-2">{more.map((m) => <li key={m.id}><Link href={`/blog/${m.slug}`} className="font-semibold text-accent underline">{m.title}</Link></li>)}</ul>
        </section>
      )}
    </article>
  );
}
