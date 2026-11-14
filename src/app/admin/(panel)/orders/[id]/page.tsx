import { ReturnGoods } from "@/components/admin/return-goods";
import { notFound } from "next/navigation";
import Link from "next/link";
import { hasRole, requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Banner, Card, fmtDate, inputCls, Submit } from "@/components/admin/ui";
import { formatPKR } from "@/lib/domain/money";
import { nextStatuses, type OrderStatus } from "@/lib/domain/order-state";
import { STATUS_LABEL } from "@/lib/orders/lookup";
import { paymentLabel } from "@/lib/domain/payment-label";
import { balanceCollectedAction, changeStatusAction, dispatchDetailsAction, noteAction, refundAction, setFeeAction, setPaymentAction, verifyAdvanceAction } from "../actions";
import { receivedAmount } from "@/lib/orders/admin";
import { optimizeImageUrl } from "@/lib/domain/images";

export const dynamic = "force-dynamic";

interface O {
  id: string; order_number: string; status: OrderStatus; customer_name: string; phone: string; email: string | null; city: string; area: string | null; address: string; notes: string | null;
  payment_method: string; payment_status: string; payment_provider: string | null; payment_reference: string | null; coupon_code: string | null; subtotal: number; discount: number; shipping_fee: number; total: number; shipping_status: string;
  shipping_policy_version: string; created_at: string; advance_required: number; advance_paid: number; advance_bps: number | null; advance_verified_at: string | null; advance_verified_by: string | null;
  carrier: string | null; tracking_number: string | null; dispatched_at: string | null; balance_collected: number; refunded_amount: number; payment_receipts: string[];
}

export default async function OrderAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireAdmin("staff");
  const canRefund = hasRole(admin, "manager");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const o = (await db.query<O>("select * from orders where id = $1", [id]))[0];
  if (!o) notFound();
  const [items, history] = await Promise.all([
    db.query<{ product_name: string; sku: string | null; unit_price: number; quantity: number; line_total: number }>("select product_name, sku, unit_price, quantity, line_total from order_items where order_id = $1", [id]),
    db.query<{ from_status: string | null; to_status: string; actor: string; note: string | null; created_at: string }>("select from_status, to_status, actor, note, created_at from order_status_history where order_id = $1 order by created_at, id", [id]),
  ]);
  const notes = await db.query<{ author: string; body: string; created_at: string }>("select author, body, created_at from order_notes where order_id = $1 order by created_at desc limit 50", [id]);
  const next = nextStatuses(o.status);
  const received = receivedAmount(o);
  const refundLeft = received - o.refunded_amount;
  const closed = ["cancelled", "rejected", "returned"].includes(o.status);
  const balanceDue = o.payment_method === "cod" && o.status === "delivered" && o.balance_collected === 0 && o.advance_paid >= o.advance_required;
  const waNumber = o.phone.replace(/\D/g, "");
  const advanceDue = o.payment_method === "cod" && o.advance_required > 0 && o.advance_paid < o.advance_required && !["cancelled", "rejected", "returned"].includes(o.status);
  const nextAction = advanceDue ? `Check your bank or wallet app for the ${formatPKR(o.advance_required)} advance${o.payment_reference ? ` (customer's reference: ${o.payment_reference})` : ""}, then press Verify advance below.`
    : o.shipping_status === "needs_confirmation" && o.status === "pending_confirmation" ? "Agree the delivery fee with the customer and set it below."
    : o.payment_method !== "cod" && o.payment_status !== "paid" && !closed && o.status === "pending_confirmation" ? `Check that the ${paymentLabel(o.payment_method, o.payment_provider).toLowerCase()} payment of ${formatPKR(o.total)} arrived${o.payment_reference ? ` (reference ${o.payment_reference})` : ""}, mark it paid below, then confirm the order.`
    : closed && refundLeft > 0 ? `This order is closed but ${formatPKR(refundLeft)} of the customer's money is still held. Send it back, then record the refund below.`
    : o.status === "pending_confirmation" ? "Contact the customer and confirm the order."
    : o.status === "confirmed" ? "Start preparing the order."
    : o.status === "processing" || o.status === "packed" ? "Add the courier and tracking number below, then mark the order Shipped so the customer gets them."
    : balanceDue ? `Record the ${formatPKR(o.total - o.advance_paid)} cash collected on delivery.`
    : null;

  return (
    <div className="max-w-4xl">
      <p className="text-sm"><Link href="/admin/orders" className="text-accent">← All orders</Link></p>
      <h1 className="mt-2 text-2xl font-extrabold">{o.order_number} <span className="ml-2 text-base font-semibold text-accent">{STATUS_LABEL[o.status]}</span></h1>
      <div className="mt-3"><Banner ok={sp.ok} error={sp.error} /></div>
      {nextAction && <p className="mb-4 rounded-[var(--radius-sm)] border border-line bg-blue-50 p-3 text-sm" data-testid="next-action"><strong>Next step:</strong> {nextAction}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Customer" id="cust">
          <p className="mt-2 text-sm">{o.customer_name}</p>
          <p className="text-sm">{o.phone} · <a className="text-accent underline" href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
          {o.email && <p className="text-sm">{o.email}</p>}
          <p className="mt-2 text-sm">{o.address}{o.area ? `, ${o.area}` : ""}, {o.city}</p>
          {o.notes && <p className="mt-2 rounded bg-canvas p-2 text-sm"><strong>Note:</strong> {o.notes}</p>}
        </Card>
        <Card title="Payment and delivery" id="pay">
          <p className="mt-2 text-sm">Method: {paymentLabel(o.payment_method, o.payment_provider)}</p>
          {o.payment_reference && <p className="text-sm">Payment reference: <span className="font-mono">{o.payment_reference}</span></p>}
          {o.payment_receipts.length > 0 && (
            <div className="mt-2 text-sm" data-testid="order-receipts"><p className="font-semibold">Receipt pictures from the customer</p>
              <ul className="mt-1 flex flex-wrap gap-3">{o.payment_receipts.map((u, i) => (
                <li key={u}><a href={u} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Open receipt picture ${i + 1} in a new tab`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={optimizeImageUrl(u, 400)} alt={`Receipt picture ${i + 1}`} width={96} height={96} className="h-24 w-24 rounded-[var(--radius-sm)] border border-line object-cover" /></a></li>
              ))}</ul>
              <p className="mt-1 text-xs text-muted">Check the amount and date against your bank or wallet app before marking the payment paid.</p></div>
          )}
          {o.payment_method === "online" && o.payment_status === "paid" && <p className="mt-1 text-sm text-ok">Paid online and confirmed by the payment provider. Refunds are made in the provider&apos;s own dashboard, then mark this order refunded.</p>}
          {o.payment_method === "online" && o.payment_status === "paid" && ["cancelled", "rejected"].includes(o.status) && <p role="alert" className="mt-1 rounded bg-amber-50 p-2 text-sm font-semibold text-warn">This order is cancelled but the customer has paid. Refund them in the provider&apos;s dashboard.</p>}
          {o.payment_method === "online" && o.payment_status !== "paid" && <p className="mt-1 text-sm text-warn">Waiting for the payment provider to confirm payment. Do not prepare this order until it shows paid.</p>}
          {o.payment_method === "cod" && o.advance_required > 0 && (
            <div className="mt-2 rounded bg-canvas p-3 text-sm" data-testid="advance-card">
              <p className="font-semibold">Advance {o.advance_bps ? `(${(o.advance_bps / 100).toFixed(2).replace(/\.?0+$/, "")}%)` : "(fixed amount)"}</p>
              <dl className="mt-1 space-y-1">
                <div className="flex justify-between gap-3"><dt>Required</dt><dd>{formatPKR(o.advance_required)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Received and verified</dt><dd>{formatPKR(o.advance_paid)}</dd></div>
                <div className="flex justify-between gap-3"><dt>To collect on delivery</dt><dd className="font-bold">{formatPKR(o.total - o.advance_paid)}</dd></div>
              </dl>
              {o.advance_verified_at && <p className="mt-1 text-xs text-muted">Verified {fmtDate(o.advance_verified_at)} by {o.advance_verified_by}</p>}
              {advanceDue && (
                <form action={verifyAdvanceAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={o.id} />
                  <div className="min-w-0"><label htmlFor="received" className="text-sm font-semibold">Amount received (Rs.)</label><input id="received" name="received" inputMode="numeric" required defaultValue={String(o.advance_required)} className={inputCls} /></div>
                  <Submit>Verify advance</Submit>
                </form>
              )}
            </div>
          )}
          <p className="text-sm">Policy version: {o.shipping_policy_version}</p>
          {["partial", "refunded", "partially_refunded"].includes(o.payment_status) ? (
            <p className="mt-2 text-sm" data-testid="payment-status-text">Payment status: <strong>{o.payment_status.replace(/_/g, " ")}</strong>. Changed by the advance, cash and refund forms.</p>
          ) : (
            <form action={setPaymentAction} className="mt-2 flex gap-2">
              <input type="hidden" name="id" value={o.id} />
              <label className="sr-only" htmlFor="ps">Payment status</label>
              <select id="ps" name="status" defaultValue={o.payment_status} className={`${inputCls} !mt-0`}>
                {["unpaid", "pending", "paid", "failed"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Submit>Save</Submit>
            </form>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Courier and tracking" id="dispatch">
          <form action={dispatchDetailsAction} className="mt-2 space-y-3">
            <input type="hidden" name="id" value={o.id} />
            <div className="min-w-0"><label htmlFor="carrier" className="text-sm font-semibold">Courier</label><input id="carrier" name="carrier" defaultValue={o.carrier ?? ""} maxLength={60} placeholder="e.g. TCS, Leopards, own rider" className={inputCls} /></div>
            <div className="min-w-0"><label htmlFor="trackingNumber" className="text-sm font-semibold">Tracking number</label><input id="trackingNumber" name="trackingNumber" defaultValue={o.tracking_number ?? ""} maxLength={60} className={inputCls} /></div>
            <Submit>Save courier details</Submit>
          </form>
          <p className="mt-2 text-xs text-muted">Entered by hand. Customers see it on their order page and in the dispatch email.{o.dispatched_at && <> Sent {fmtDate(o.dispatched_at)}.</>}</p>
        </Card>
        <Card title="Notes (staff only)" id="notes">
          <form action={noteAction} className="mt-2 flex gap-2">
            <input type="hidden" name="id" value={o.id} />
            <label className="sr-only" htmlFor="body">Add a note</label>
            <input id="body" name="body" required maxLength={1000} placeholder="e.g. Customer asked to deliver after 5 pm" className={`${inputCls} !mt-0 min-w-0 flex-1`} />
            <Submit>Add</Submit>
          </form>
          <ul className="mt-3 space-y-2 text-sm">
            {notes.length === 0 && <li className="text-muted">No notes yet.</li>}
            {notes.map((n, i) => <li key={i} className="min-w-0 break-words rounded bg-canvas p-2">{n.body}<span className="mt-1 block text-xs text-muted">{n.author} · {fmtDate(n.created_at)}</span></li>)}
          </ul>
        </Card>
      </div>

      {(balanceDue || (canRefund && refundLeft > 0) || o.refunded_amount > 0) && (
        <div className="mt-4"><Card title="Money" id="money">
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt>Received so far</dt><dd className="font-semibold" data-testid="received">{formatPKR(received)}</dd></div>
            {o.refunded_amount > 0 && <div className="flex justify-between gap-3"><dt>Refunded</dt><dd className="font-semibold" data-testid="refunded">{formatPKR(o.refunded_amount)}</dd></div>}
          </dl>
          {balanceDue && (
            <form action={balanceCollectedAction} className="mt-3 flex flex-wrap items-end gap-2 rounded bg-amber-50 p-3">
              <input type="hidden" name="id" value={o.id} />
              <div className="min-w-0"><label htmlFor="amount" className="text-sm font-semibold">Cash collected on delivery (Rs.)</label><input id="amount" name="amount" inputMode="numeric" required defaultValue={String(o.total - o.advance_paid)} className={inputCls} /></div>
              <Submit>Record cash collected</Submit>
            </form>
          )}
          {canRefund && refundLeft > 0 && (
            <form action={refundAction} className="mt-3 flex flex-wrap items-end gap-2 rounded bg-canvas p-3">
              <input type="hidden" name="id" value={o.id} />
              <div className="min-w-0"><label htmlFor="refund" className="text-sm font-semibold">Refund already paid out (Rs.)</label><input id="refund" name="amount" inputMode="numeric" required placeholder={`up to ${refundLeft}`} className={inputCls} /></div>
              <div className="min-w-0 flex-1"><label htmlFor="refundNote" className="text-sm font-semibold">Note</label><input id="refundNote" name="note" maxLength={200} className={inputCls} /></div>
              <Submit danger>Record refund</Submit>
              <p className="w-full text-xs text-muted">This only records a refund you have already sent from your bank, wallet or gateway dashboard. It does not send money.</p>
            </form>
          )}
        </Card></div>
      )}

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
      <ReturnGoods orderId={o.id} status={o.status} />
    </div>
  );
}
