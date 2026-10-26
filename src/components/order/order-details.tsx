import { paymentLabel } from "@/lib/domain/payment-label";
import { formatPKR } from "@/lib/domain/money";
import { STATUS_LABEL, type OrderView } from "@/lib/orders/lookup";

export function OrderDetails({ order }: { order: OrderView }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-line bg-surface p-5" aria-label={`Order ${order.orderNumber}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold" data-testid="order-number">{order.orderNumber}</h2>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-accent" data-testid="order-status">{STATUS_LABEL[order.status] ?? order.status}</span>
      </div>
      <ul className="mt-4 divide-y divide-line text-sm">
        {order.items.map((i) => (
          <li key={i.name} className="flex justify-between py-2"><span>{i.quantity} × {i.name}</span><span>{formatPKR(i.lineTotal)}</span></li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPKR(order.subtotal)}</dd></div>
        {order.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{formatPKR(order.discount)}</dd></div>}
        <div className="flex justify-between"><dt>Delivery</dt><dd>{order.shippingStatus === "needs_confirmation" ? "To be confirmed by us" : order.shippingFee === 0 ? "Free" : formatPKR(order.shippingFee)}</dd></div>
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd data-testid="order-total">{formatPKR(order.total)}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-muted">Payment: {paymentLabel(order.paymentMethod, order.paymentProvider)}{order.paymentMethod === "online" ? (order.paymentStatus === "paid" ? ", paid" : ", awaiting payment") : ""} · Deliver to: {order.city}</p>
      <ol className="mt-4 space-y-1 text-sm">
        {order.history.map((h, i) => (
          <li key={i}><span className="font-semibold">{STATUS_LABEL[h.status] ?? h.status}</span> <span className="text-muted">· {new Date(h.at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</span></li>
        ))}
      </ol>
    </section>
  );
}
