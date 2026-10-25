import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Field, fmtDate, inputCls, Submit, td, th } from "@/components/admin/ui";
import { saveCouponAction, toggleCouponAction } from "../catalog-actions";

export const dynamic = "force-dynamic";

export default async function CouponsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  const rows = await (await getDb()).query<{ id: string; code: string; type: string; value: number; min_subtotal: number; max_discount: number | null; active: boolean; expires_at: string | null; usage_limit: number | null; used_count: number }>(
    "select * from coupons order by active desc, code");
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-extrabold">Coupons</h1>
        <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full">
            <thead className="border-b border-line"><tr><th className={th}>Code</th><th className={th}>Discount</th><th className={th}>Minimum</th><th className={th}>Used</th><th className={th}>Expires</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.length === 0 && <tr><td className={td} colSpan={6}>No coupons yet.</td></tr>}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className={`${td} font-mono font-semibold`}>{c.code}</td>
                  <td className={td}>{c.type === "percent" ? `${c.value}%${c.max_discount ? ` (max Rs. ${c.max_discount})` : ""}` : `Rs. ${c.value}`}</td>
                  <td className={td}>Rs. {c.min_subtotal}</td>
                  <td className={td}>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                  <td className={td}>{c.expires_at ? fmtDate(c.expires_at) : "Never"}</td>
                  <td className={td}><form action={toggleCouponAction}><input type="hidden" name="id" value={c.id} /><button className="min-h-11 text-sm font-semibold underline">{c.active ? "Active — disable" : "Disabled — enable"}</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <KeepForm action={saveCouponAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="font-bold">New coupon</h2>
        <Field label="Code" id="k-code"><input id="k-code" name="code" required className={`${inputCls} uppercase`} /></Field>
        <Field label="Type" id="k-type"><select id="k-type" name="type" className={inputCls}><option value="percent">Percent off</option><option value="fixed">Fixed Rs. off</option></select></Field>
        <Field label="Value" id="k-value" hint="Percent (max 90) or rupees."><input id="k-value" name="value" required inputMode="numeric" className={inputCls} /></Field>
        <Field label="Minimum order (Rs.)" id="k-min"><input id="k-min" name="minSubtotal" defaultValue={0} inputMode="numeric" className={inputCls} /></Field>
        <Field label="Maximum discount (Rs.)" id="k-max" hint="Optional, for percent coupons."><input id="k-max" name="maxDiscount" inputMode="numeric" className={inputCls} /></Field>
        <Field label="Usage limit" id="k-lim" hint="Optional."><input id="k-lim" name="usageLimit" inputMode="numeric" className={inputCls} /></Field>
        <Field label="Last valid day" id="k-exp" hint="Optional."><input id="k-exp" name="expiresAt" type="date" className={inputCls} /></Field>
        <Submit>Create coupon</Submit>
      </KeepForm>
    </div>
  );
}
