import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { getDb } from "@/lib/db";
import { POLICIES } from "@/content/policies";

export const dynamic = "force-dynamic";

/** Only public, published pages. Private pages (cart, checkout, orders, tracking, admin, accounts) are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.baseUrl.replace(/\/$/, "");
  const db = await getDb();
  const [products, posts, cats] = await Promise.all([
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from products where published order by updated_at desc limit 5000"),
    db.query<{ slug: string; updated_at: Date }>("select slug, updated_at from blog_posts where status = 'published' order by published_at desc limit 5000"),
    db.query<{ slug: string }>("select c.slug from categories c where exists (select 1 from products p where p.category_id = c.id and p.published)"),
  ]);
  const fixed: [string, number][] = [["/", 1], ["/shop", 0.9], ["/repairs", 0.9], ["/blog", 0.7], ["/about", 0.5], ["/contact", 0.6], ["/faq", 0.5]];
  return [
    ...fixed.map(([p, priority]) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority })),
    ...POLICIES.map((p) => ({ url: `${base}/policies/${p.slug}`, changeFrequency: "yearly" as const, priority: 0.3 })),
    ...cats.map((c) => ({ url: `${base}/category/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...products.map((p) => ({ url: `${base}/product/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: new Date(p.updated_at), changeFrequency: "monthly" as const, priority: 0.6 })),
  ];
}
