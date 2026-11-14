import { LOW_STOCK } from "@/lib/domain/stock";
import { waitingCounts } from "@/lib/stock-alerts";
import { displayName } from "@/lib/domain/display";
import { requireAdmin } from "@/lib/auth/session";
import { financePermsOf } from "@/lib/finance/perms";
import { openingCostAction } from "../finance/actions";
import { getDb } from "@/lib/db";
import { Banner, inputCls, td, th } from "@/components/admin/ui";
import { adjustStockAction } from "../products/actions";

export const dynamic = "force-dynamic";

export default async function InventoryAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; low?: string }> }) {
  const admin = await requireAdmin("manager");
  const perms = await financePermsOf(admin);
  const showCost = admin.role === "owner" || perms.includes("finance_costs");
  const sp = await searchParams;
  const rows = await (await getDb()).query<{ id: string; name: string; sku: string | null; stock: number; published: boolean; variant_label: string | null; avg_cost: string | null; unvalued_units: number }>(
    `select id, name, sku, stock, published, variant_label, avg_cost, unvalued_units from products ${sp.low ? `where stock <= ${LOW_STOCK}` : ""} order by stock asc, name limit 300`);
  const db = await getDb();
  const waiting = await waitingCounts(db);
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Inventory</h1>
      <p className="mt-1 text-sm text-muted">Set the exact quantity on the shelf. Customers cannot order more than this. <a className="font-semibold text-accent" href={sp.low ? "/admin/inventory" : "/admin/inventory?low=1"}>{sp.low ? "Show all" : "Show low stock only"}</a></p>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>Product</th><th className={th}>SKU</th><th className={th}>In stock</th><th className={th}>Waiting for restock</th>{showCost && <th className={th}>Cost</th>}<th className={th}>Set quantity</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td className={td} colSpan={5}>No products to show.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id}>
                <td className={td}>{displayName(p.name, p.variant_label)}{!p.published && <span className="ml-2 text-xs text-muted">(draft)</span>}</td>
                <td className={td}>{p.sku ?? "—"}</td>
                <td className={`${td} font-semibold ${p.stock === 0 ? "text-danger" : p.stock <= 3 ? "text-warn" : ""}`}>{p.stock}</td>
                {showCost && <td className={td}>{p.avg_cost == null ? <span className="text-warn">unknown</span> : `Rs. ${Number(p.avg_cost).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`}{p.unvalued_units > 0 && p.stock > 0 && <div className="text-xs text-warn">{Math.min(p.unvalued_units, p.stock)} unit(s) of unknown cost{admin.role === "owner" && <form action={openingCostAction} className="mt-1 flex gap-1"><input type="hidden" name="id" value={p.id} /><input name="cost" inputMode="decimal" placeholder="Cost each" aria-label={`Cost of the existing ${p.name}`} className={`${inputCls} !mt-0 h-9 w-24`} /><button className="text-xs font-semibold underline">Set</button></form>}</div>}</td>}
                <td className={td}>{waiting[p.id] ? <span className="font-semibold text-accent">{waiting[p.id]} {waiting[p.id] === 1 ? "person" : "people"}</span> : "—"}</td>
                <td className={td}>
                  <form action={adjustStockAction} className="flex gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="stock" inputMode="numeric" defaultValue={p.stock} aria-label={`Stock for ${displayName(p.name, p.variant_label)}`} className={`${inputCls} !mt-0 w-24`} />
                    <button className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-semibold text-white">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
