import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Buying guides and phone care",
  description: "Plain-language guides on chargers, cases, batteries and power banks from the Fixit team.",
  alternates: { canonical: "/blog" },
};

export default async function BlogIndex() {
  const posts = await listPublishedPosts();
  return (
    <div className="container-x py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Buying guides and phone care</h1>
      <p className="mt-2 max-w-2xl text-muted">Practical, plain-language advice from the Fixit team.</p>
      {posts.length === 0 ? (
        <p className="mt-8 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-10 text-center text-muted">Guides are coming soon.</p>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {posts.map((p) => (
            <li key={p.id}>
              <article className="h-full rounded-[var(--radius-md)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)] motion-reduce:transition-none">
                <h2 className="text-lg font-bold"><Link href={`/blog/${p.slug}`} className="hover:text-accent">{p.title}</Link></h2>
                <p className="mt-2 text-sm text-muted">{p.excerpt}</p>
                <p className="mt-3 text-xs text-muted">{p.publishedAt && <time dateTime={p.publishedAt}>{new Date(p.publishedAt).toLocaleDateString("en-PK", { dateStyle: "long" })}</time>}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
