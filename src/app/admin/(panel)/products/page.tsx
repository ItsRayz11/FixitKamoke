import { displayName } from "@/lib/domain/display";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Banner, td, th } from "@/components/admin/ui";
import { formatPKR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const rows = await (await getDb()).query<{ id: string; name: string; price: number; sale_price: number | null; stock: number; published: boolean; sku: string | null; variant_label: string | null }>(
    `select id, name, price, sale_price, stock, published, sku, variant_label from products where ($1 = '' or name ilike '%' || $1 || '%' or variant_label ilike '%' || $1 || '%' or sku ilike '%' || $1 || '%') order by created_at desc limit 200`, [q]);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Products</h1>
        <Link href="/admin/products/new" className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-accent px-5 text-sm font-semibold text-white">Add product</Link>
      </div>
      <form className="mt-4"><label htmlFor="q" className="sr-only">Search products</label><input id="q" name="q" defaultValue={q} placeholder="Search name or SKU" className="h-11 w-full max-w-sm rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm" /></form>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Name</th><th className={th}>SKU</th><th className={th}>Price</th><th className={th}>Stock</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td className={td} colSpan={5}>No products yet. Add your first product.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td className={td}><Link className="font-semibold text-accent" href={`/admin/products/${p.id}`}>{displayName(p.name, p.variant_label)}</Link></td>
                <td className={td}>{p.sku ?? "—"}</td>
                <td className={td}>{formatPKR(p.sale_price ?? p.price)}</td>
                <td className={td}>{p.stock}</td>
                <td className={td}>{p.published ? "Published" : "Draft"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
