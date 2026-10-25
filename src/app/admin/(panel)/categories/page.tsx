import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { KeepForm } from "@/components/admin/keep-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Banner, Field, inputCls, Submit, td, th } from "@/components/admin/ui";
import { deleteCategoryAction, saveCategoryAction } from "../catalog-actions";

export const dynamic = "force-dynamic";

export default async function CategoriesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  const rows = await (await getDb()).query<{ id: string; name: string; slug: string; description: string | null; sort_order: number; n: number }>(
    "select c.id, c.name, c.slug, c.description, c.sort_order, (select count(*)::int from products p where p.category_id = c.id) as n from categories c order by sort_order, name");
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-extrabold">Categories</h1>
        <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full">
            <thead className="border-b border-line"><tr><th className={th}>Name</th><th className={th}>Address</th><th className={th}>Products</th><th className={th}>Order</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td className={td} colSpan={5}>No categories yet.</td></tr>}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={td}>
                    <details><summary className="cursor-pointer font-semibold text-accent">{c.name}</summary>
                      <KeepForm action={saveCategoryAction} className="mt-2 grid gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="name" defaultValue={c.name} aria-label="Name" className={inputCls} />
                        <input name="slug" defaultValue={c.slug} aria-label="Web address" className={inputCls} />
                        <input name="description" defaultValue={c.description ?? ""} aria-label="Description" className={inputCls} />
                        <input name="sortOrder" defaultValue={c.sort_order} aria-label="Sort order" className={inputCls} />
                        <Submit>Update</Submit>
                      </KeepForm>
                    </details>
                  </td>
                  <td className={td}>{c.slug}</td><td className={td}>{c.n}</td><td className={td}>{c.sort_order}</td>
                  <td className={td}><ConfirmButton action={deleteCategoryAction} fields={{ id: c.id }} title={`Delete “${c.name}”?`} description="Categories that still have products cannot be deleted. This cannot be undone." confirmLabel="Delete category" className="min-h-11 text-sm font-semibold text-danger underline">Delete</ConfirmButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <KeepForm action={saveCategoryAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="font-bold">Add category</h2>
        <Field label="Name" id="c-name"><input id="c-name" name="name" required className={inputCls} /></Field>
        <Field label="Web address" id="c-slug" hint="Optional."><input id="c-slug" name="slug" className={inputCls} /></Field>
        <Field label="Description" id="c-desc"><input id="c-desc" name="description" className={inputCls} /></Field>
        <Field label="Sort order" id="c-sort"><input id="c-sort" name="sortOrder" defaultValue={0} inputMode="numeric" className={inputCls} /></Field>
        <Submit>Add category</Submit>
      </KeepForm>
    </div>
  );
}
