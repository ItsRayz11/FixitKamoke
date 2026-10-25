import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Banner, Card, fmtDate, inputCls, Submit } from "@/components/admin/ui";
import { formatPKR } from "@/lib/domain/money";
import { nextStatuses, type OrderStatus } from "@/lib/domain/order-state";
import { STATUS_LABEL } from "@/lib/orders/lookup";
import { changeStatusAction, setFeeAction, setPaymentAction } from "../actions";

export const dynamic = "force-dynamic";

interface O {
  id: string; order_number: string; status: OrderStatus; customer_name: string; phone: string; email: string | null; city: string; area: string | null; address: string; notes: string | null;
  payment_method: string; payment_status: string; coupon_code: string | null; subtotal: number; discount: number; shipping_fee: number; total: number; shipping_status: string;
  shipping_policy_version: string; created_at: string;
}

export default async function OrderAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("staff");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const o = (await db.query<O>("select * from orders where id = $1", [id]))[0];
  if (!o) notFound();
  const [items, history] = await Promise.all([
    db.query<{ product_name: string; sku: string | null; unit_price: number; quantity: number; line_total: number }>("select product_name, sku, unit_price, quantity, line_total from order_items where order_id = $1", [id]),
    db.query<{ from_status: string | null; to_status: string; actor: string; note: string | null; created_at: string }>("select from_status, to_status, actor, note, created_at from order_status_history where order_id = $1 order by created_at, id", [id]),
  ]);
  const next = nextStatuses(o.status);
  const waNumber = o.phone.replace(/\D/g, "");

  return (
    <div className="max-w-4xl">
      <p className="text-sm"><Link href="/admin/orders" className="text-accent">← All orders</Link></p>
      <h1 className="mt-2 text-2xl font-extrabold">{o.order_number} <span className="ml-2 text-base font-semibold text-accent">{STATUS_LABEL[o.status]}</span></h1>
      <div className="mt-3"><Banner ok={sp.ok} error={sp.error} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Customer" id="cust">
          <p className="mt-2 text-sm">{o.customer_name}</p>
          <p className="text-sm">{o.phone} · <a className="text-accent underline" href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
          {o.email && <p className="text-sm">{o.email}</p>}
          <p className="mt-2 text-sm">{o.address}{o.area ? `, ${o.area}` : ""}, {o.city}</p>
          {o.notes && <p className="mt-2 rounded bg-canvas p-2 text-sm"><strong>Note:</strong> {o.notes}</p>}
        </Card>
        <Card title="Payment and delivery" id="pay">
          <p className="mt-2 text-sm">Method: {o.payment_method === "cod" ? "Cash on delivery" : "Bank transfer"}</p>
          <p className="text-sm">Policy version: {o.shipping_policy_version}</p>
          <form action={setPaymentAction} className="mt-2 flex gap-2">
            <input type="hidden" name="id" value={o.id} />
            <label className="sr-only" htmlFor="ps">Payment status</label>
            <select id="ps" name="status" defaultValue={o.payment_status} className={`${inputCls} !mt-0`}>
              {["unpaid", "pending", "paid", "refunded", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Submit>Save</Submit>
          </form>
        </Card>
      </div>

      <div className="mt-4"><Card title="Items" id="items">
        <table className="mt-2 w-full text-sm">
          <tbody className="divide-y divide-line">
            {items.map((i, k) => <tr key={k}><td className="py-2">{i.product_name}{i.sku && <span className="text-xs text-muted"> · {i.sku}</span>}</td><td>{i.quantity} × {formatPKR(i.unit_price)}</td><td className="text-right font-semibold">{formatPKR(i.line_total)}</td></tr>)}
          </tbody>
        </table>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPKR(o.subtotal)}</dd></div>
          {o.discount > 0 && <div className="flex justify-between"><dt>Discount {o.coupon_code && `(${o.coupon_code})`}</dt><dd>−{formatPKR(o.discount)}</dd></div>}
          <div className="flex justify-between"><dt>Delivery</dt><dd>{o.shipping_status === "needs_confirmation" ? "To be confirmed" : formatPKR(o.shipping_fee)}</dd></div>
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{formatPKR(o.total)}</dd></div>
        </dl>
        {o.shipping_status === "needs_confirmation" && o.status === "pending_confirmation" && (
          <form action={setFeeAction} className="mt-3 flex flex-wrap items-end gap-2 rounded bg-amber-50 p-3">
            <input type="hidden" name="id" value={o.id} />
            <div><label htmlFor="fee" className="text-sm font-semibold">Agreed delivery fee (Rs.)</label><input id="fee" name="fee" inputMode="numeric" required className={inputCls} /></div>
            <Submit>Set fee</Submit>
          </form>
        )}
      </Card></div>

      {next.length > 0 && (
        <div className="mt-4"><Card title="Change status" id="status">
          <form action={changeStatusAction} className="mt-2 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={o.id} />
            <div><label htmlFor="to" className="text-sm font-semibold">Move to</label>
              <select id="to" name="to" className={inputCls}>{next.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
            <div className="min-w-48 flex-1"><label htmlFor="note" className="text-sm font-semibold">Note (optional)</label><input id="note" name="note" maxLength={300} className={inputCls} /></div>
            <Submit>Update</Submit>
          </form>
          <p className="mt-2 text-xs text-muted">Cancelling or rejecting returns the items to stock. If the customer gave an email, a notification is queued.</p>
        </Card></div>
      )}

      <div className="mt-4"><Card title="History" id="hist">
        <ol className="mt-2 space-y-1 text-sm">
          {history.map((h, i) => <li key={i}><strong>{STATUS_LABEL[h.to_status] ?? h.to_status}</strong> · {fmtDate(h.created_at)} · {h.actor}{h.note && <> — {h.note}</>}</li>)}
        </ol>
      </Card></div>
    </div>
  );
}
