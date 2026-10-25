import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getStore } from "@/lib/settings";
import { gatewayStatuses, getPaymentOptions } from "@/lib/payments";
import { Card } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function PaymentsAdmin() {
  await requireAdmin("owner");
  const [opts, store] = await Promise.all([getPaymentOptions(await getDb()), getStore()]);
  const gateways = gatewayStatuses();
  const unpaid = (await (await getDb()).query<{ n: number }>("select count(*)::int as n from orders where payment_method = 'bank_transfer' and payment_status in ('unpaid','pending') and status not in ('cancelled','rejected')"))[0]?.n ?? 0;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">Payments</h1>
      <Card title="Working today" id="offline">
        <ul className="mt-2 space-y-2 text-sm">
          <li><strong>Cash on delivery:</strong> {opts.cod ? "on" : "off"}. Also limited by each delivery zone.</li>
          <li><strong>Bank transfer:</strong> {opts.bankTransfer ? "on" : "off"}. {store.bankAccountNumber ? "Account details are shown to customers on their confirmation page." : "No account details saved, so customers are told you will send them."} {unpaid > 0 && <span className="font-semibold text-warn">{unpaid} order{unpaid === 1 ? " is" : "s are"} waiting for payment confirmation.</span>}</li>
        </ul>
        <p className="mt-3 text-sm text-muted">Change these in <Link href="/admin/settings" className="font-semibold text-accent underline">Store settings</Link>. Mark bank-transfer orders as paid on the order page once the money has arrived.</p>
      </Card>
      <Card title="Online payment gateways" id="online">
        <p className="mt-2 text-sm text-muted">None is connected, and none appears at checkout. A gateway is only switched on after its integration, signed callback checks and an end-to-end sandbox test exist, so customers are never shown a payment option that does not truly work.</p>
        <ul className="mt-3 divide-y divide-line">
          {gateways.map((g) => (
            <li key={g.id} className="py-3 text-sm">
              <p className="font-semibold">{g.name} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-muted">not connected</span></p>
              <p className="mt-1 text-muted">{g.reason}</p>
              <p className="mt-1 text-muted">{g.notes}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
