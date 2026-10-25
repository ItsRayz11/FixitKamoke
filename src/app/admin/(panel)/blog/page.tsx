import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listAllPosts } from "@/lib/blog";
import { Banner, fmtDate, Submit, td, th } from "@/components/admin/ui";
import { importStarterAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function BlogAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  const posts = await listAllPosts(await getDb());
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Blog and buying guides</h1>
        <div className="flex gap-3">
          <form action={importStarterAction}><Submit>Add starter guides</Submit></form>
          <Link href="/admin/blog/new" className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line bg-surface px-5 text-sm font-semibold">New article</Link>
        </div>
      </div>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Title</th><th className={th}>Status</th><th className={th}>Published</th><th className={th}>Updated</th></tr></thead>
          <tbody className="divide-y divide-line">
            {posts.length === 0 && <tr><td className={td} colSpan={4}>No articles yet. “Add starter guides” adds four original drafts for you to review.</td></tr>}
            {posts.map((p) => (
              <tr key={p.id}>
                <td className={td}><Link className="font-semibold text-accent" href={`/admin/blog/${p.id}`}>{p.title}</Link>{p.needsReview && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-warn">needs review</span>}</td>
                <td className={td}>{p.status === "published" ? "Published" : "Draft"}</td>
                <td className={td}>{p.publishedAt ? fmtDate(p.publishedAt) : "—"}</td>
                <td className={td}>{fmtDate(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
