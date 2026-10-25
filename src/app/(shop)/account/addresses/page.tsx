import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listAddresses } from "@/lib/customers/customers";
import { AccountNav } from "@/components/account/account-nav";
import { KeepForm } from "@/components/admin/keep-form";
import { F, Msg, Primary, accField } from "@/components/account/auth-fields";
import { deleteAddressAction, saveAddressAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved addresses" };

export default async function AddressesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireCustomer();
  const sp = await searchParams;
  const list = await listAddresses(await getDb(), me.id);
  return (
    <>
      <AccountNav name={me.name} current="/account/addresses" />
      <h1 className="text-2xl font-extrabold">Saved addresses</h1>
      <div className="mt-4"><Msg ok={sp.ok} error={sp.error} /></div>
      <div className="grid gap-6 md:grid-cols-2">
        <ul className="space-y-3">
          {list.length === 0 && <li className="rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">No saved addresses yet.</li>}
          {list.map((a) => (
            <li key={a.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4 text-sm">
              <p className="font-bold">{a.label}{a.isDefault && <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-accent">default</span>}</p>
              <p>{a.recipientName} · {a.phone}</p>
              <p className="text-muted">{a.address}{a.area ? `, ${a.area}` : ""}, {a.city}</p>
              <form action={deleteAddressAction} className="mt-2"><input type="hidden" name="id" value={a.id} /><button className="min-h-11 font-semibold text-danger underline">Remove</button></form>
            </li>
          ))}
        </ul>
        <KeepForm action={saveAddressAction} className="h-fit space-y-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="font-bold">Add an address</h2>
          <F id="label" label="Label"><input id="label" name="label" defaultValue="Home" className={accField} /></F>
          <F id="recipientName" label="Recipient name"><input id="recipientName" name="recipientName" required defaultValue={me.name} className={accField} /></F>
          <F id="phone" label="Mobile number"><input id="phone" name="phone" type="tel" required defaultValue={me.phone ?? ""} className={accField} /></F>
          <F id="city" label="City"><input id="city" name="city" required className={accField} /></F>
          <F id="area" label="Area (optional)"><input id="area" name="area" className={accField} /></F>
          <F id="address" label="Complete address"><textarea id="address" name="address" required rows={3} className={`${accField} h-auto py-2`} /></F>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="isDefault" className="h-5 w-5" /> Use as my default address</label>
          <Primary>Save address</Primary>
        </KeepForm>
      </div>
    </>
  );
}
