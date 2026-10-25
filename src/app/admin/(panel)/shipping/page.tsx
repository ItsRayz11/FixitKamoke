import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getShippingConfig } from "@/lib/orders/create-order";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, inputCls, Submit } from "@/components/admin/ui";
import { saveShippingAction } from "../settings-actions";

export const dynamic = "force-dynamic";

export default async function ShippingAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  const cfg = await getShippingConfig(await getDb());
  const zones = [...(cfg?.zones ?? [])];
  const rows = zones.length + 3;
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-extrabold">Delivery settings</h1>
      <p className="mt-1 text-sm text-muted">Customers see these fees at checkout. Nothing is assumed: a city with no zone follows the rule at the bottom. Clear a zone’s name to delete it.</p>
      {!cfg && <p role="alert" className="mt-3 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm text-warn">No delivery zones are configured, so customers cannot place orders yet.</p>}
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <KeepForm action={saveShippingAction} className="space-y-4">
        <input type="hidden" name="rows" value={rows} />
        {Array.from({ length: rows }, (_, i) => {
          const z = zones[i];
          return (
            <fieldset key={i} className="grid gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-bold">{z ? `Zone ${i + 1}` : "New zone (optional)"}</legend>
              <input type="hidden" name={`z${i}_id`} value={z?.id ?? ""} />
              <div><label htmlFor={`z${i}_label`} className="text-sm font-semibold">Zone name</label><input id={`z${i}_label`} name={`z${i}_label`} defaultValue={z?.label ?? ""} className={inputCls} /></div>
              <div><label htmlFor={`z${i}_fee`} className="text-sm font-semibold">Delivery fee (Rs., 0 = free)</label><input id={`z${i}_fee`} name={`z${i}_fee`} inputMode="numeric" defaultValue={z?.fee ?? ""} className={inputCls} /></div>
              <div className="sm:col-span-2"><label htmlFor={`z${i}_cities`} className="text-sm font-semibold">Cities (comma separated)</label><textarea id={`z${i}_cities`} name={`z${i}_cities`} rows={2} defaultValue={z?.cities.join(", ") ?? ""} className={`${inputCls} h-auto py-2`} /></div>
              <div><label htmlFor={`z${i}_free`} className="text-sm font-semibold">Free delivery from (Rs.)</label><input id={`z${i}_free`} name={`z${i}_free`} inputMode="numeric" defaultValue={z?.freeThreshold ?? ""} className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor={`z${i}_etaMin`} className="text-sm font-semibold">Days from</label><input id={`z${i}_etaMin`} name={`z${i}_etaMin`} inputMode="numeric" defaultValue={z?.etaDays?.[0] ?? ""} className={inputCls} /></div>
                <div><label htmlFor={`z${i}_etaMax`} className="text-sm font-semibold">Days to</label><input id={`z${i}_etaMax`} name={`z${i}_etaMax`} inputMode="numeric" defaultValue={z?.etaDays?.[1] ?? ""} className={inputCls} /></div>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name={`z${i}_cod`} defaultChecked={z?.codAvailable ?? true} className="h-5 w-5" /> Cash on delivery available</label>
            </fieldset>
          );
        })}
        <fieldset className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <legend className="px-1 text-sm font-bold">Cities not listed above</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="unlistedCity" value="manual_confirmation" defaultChecked={(cfg?.unlistedCity ?? "manual_confirmation") === "manual_confirmation"} className="h-5 w-5" /> Accept the order and confirm the delivery fee with the customer first</label>
          <label className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="unlistedCity" value="not_serviceable" defaultChecked={cfg?.unlistedCity === "not_serviceable"} className="h-5 w-5" /> Do not deliver there</label>
        </fieldset>
        <Submit>Save delivery settings</Submit>
        {cfg && <p className="text-xs text-muted">Current policy version: {cfg.version} (stored on every order).</p>}
      </KeepForm>
    </div>
  );
}
