import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { findOrderByToken } from "@/lib/orders/lookup";
import { OrderDetails } from "@/components/order/order-details";
import { whatsappLink } from "@/lib/whatsapp";
import { getStore } from "@/lib/settings";
import { formatPKR } from "@/lib/domain/money";
import { isManualMethod, paymentLabel } from "@/lib/domain/payment-label";
import { PayNow } from "@/components/order/pay-now";
import { cloudinaryConfig } from "@/lib/cloudinary";
import { TransferReferenceForm } from "@/components/order/transfer-reference-form";

export const dynamic = "force-dynamic";
// Private page: never index, never cache shared.
export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string; pay?: string }> }) {
  const [{ number }, { t, pay }] = await Promise.all([params, searchParams]);
  const order = t ? await findOrderByToken(await getDb(), number, t) : null;

  if (!order) {
    return (
      <div className="container-x py-12 text-center">
        <h1 className="text-2xl font-extrabold">We could not open that order</h1>
        <p className="mt-2 text-muted">The link may be incomplete. You can look up your order with its number and the phone number you used.</p>
        <Link href="/track" className="mt-4 inline-block font-semibold text-accent">Track an order</Link>
      </div>
    );
  }
  const store = await getStore();
  const wa = whatsappLink({ kind: "order", orderNumber: order.orderNumber }, store.whatsappNumber);
  const hasBank = Boolean(store.bankAccountNumber || store.paymentInstructions);
  const advanceOpen = order.paymentMethod === "cod" && order.advanceRequired > 0 && order.advancePaid < order.advanceRequired;
  const manual = isManualMethod(order.paymentMethod);
  const showBank = (advanceOpen && (hasBank || !(store.jazzcashEnabled && store.jazzcashNumber) && !(store.easypaisaEnabled && store.easypaisaNumber))) || order.paymentMethod === "bank_transfer";
  const showJazz = (advanceOpen && store.jazzcashEnabled === true && !!store.jazzcashNumber) || order.paymentMethod === "jazzcash_manual";
  const showEasy = (advanceOpen && store.easypaisaEnabled === true && !!store.easypaisaNumber) || order.paymentMethod === "easypaisa_manual";
  return (
    <div className="container-x max-w-2xl py-10">
      <h1 className="text-2xl font-extrabold">Thank you, {order.customerName.split(" ")[0]}. Your order is received.</h1>
      <p className="mt-2 text-muted">
        This is not yet a confirmed order: we will contact you to confirm it{order.shippingStatus === "needs_confirmation" ? " and your delivery fee" : ""}.
        Save this page or your order number <strong>{order.orderNumber}</strong> to track it later.
      </p>
      <div className="mt-6"><OrderDetails order={order} /></div>
      {order.paymentMethod === "online" && order.paymentStatus !== "paid" && t && <PayNow orderNumber={order.orderNumber} token={t} failed={pay === "failed"} />}
      {order.paymentMethod === "online" && order.paymentStatus === "paid" && <p role="status" className="mt-4 rounded-[var(--radius-md)] bg-emerald-50 p-4 text-sm font-semibold text-ok">Payment received. Thank you.</p>}
      {order.paymentMethod === "cod" && order.advanceRequired > 0 && order.advancePaid >= order.advanceRequired && (
        <p role="status" className="mt-4 rounded-[var(--radius-md)] bg-emerald-50 p-4 text-sm font-semibold text-ok">Advance received. Thank you. The rest is paid when your order is delivered.</p>
      )}
      {(advanceOpen || manual) && (
        <section aria-labelledby="bank" className="mt-4 rounded-[var(--radius-md)] border border-line bg-surface p-5">
          <h2 id="bank" className="font-bold">{advanceOpen ? `Pay your advance of ${formatPKR(order.advanceRequired)}` : `How to pay by ${paymentLabel(order.paymentMethod).toLowerCase()}`}</h2>
          {advanceOpen && <p className="mt-1 text-sm text-muted">Send the advance by bank transfer or wallet. We confirm your order after we have checked that it arrived. The remaining {formatPKR(order.total - order.advanceRequired)} is paid on delivery.</p>}
          {showBank && (hasBank ? (
            <dl className="mt-2 space-y-1 text-sm">
              {store.bankName && <div className="flex justify-between gap-4"><dt className="text-muted">Bank</dt><dd className="min-w-0 break-words font-semibold">{store.bankName}</dd></div>}
              {store.bankAccountTitle && <div className="flex justify-between gap-4"><dt className="text-muted">Account title</dt><dd className="min-w-0 break-words font-semibold">{store.bankAccountTitle}</dd></div>}
              {store.bankAccountNumber && <div className="flex justify-between gap-4"><dt className="text-muted">Account / IBAN</dt><dd className="min-w-0 break-all font-semibold">{store.bankAccountNumber}</dd></div>}
              <div className="flex justify-between gap-4"><dt className="text-muted">Reference</dt><dd className="font-semibold">{order.orderNumber}</dd></div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">We will send you the account details by message. Please wait for them before paying.</p>
          ))}
          {showJazz && <WalletBlock name="JazzCash" title={store.jazzcashTitle} number={store.jazzcashNumber} orderNumber={order.orderNumber} />}
          {showEasy && <WalletBlock name="Easypaisa" title={store.easypaisaTitle} number={store.easypaisaNumber} orderNumber={order.orderNumber} />}
          {store.paymentInstructions && <p className="mt-3 whitespace-pre-line text-sm"><strong>Other ways to pay:</strong> {store.paymentInstructions}</p>}
          <p className="mt-3 text-xs text-muted">Your order is only prepared once we have confirmed your {order.paymentMethod === "cod" ? "advance" : "payment"}.</p>
          {t && order.paymentStatus !== "paid" && <TransferReferenceForm orderNumber={order.orderNumber} token={t} alreadySent={order.paymentStatus === "pending"} canUpload={cloudinaryConfig() !== null} receiptCount={order.receiptCount} />}
        </section>
      )}
      <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/track" className="text-accent">Track this order later</Link>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-accent">Message us on WhatsApp</a>}
        <Link href="/shop" className="text-accent">Continue shopping</Link>
        <Link href="/blog" className="text-accent">Care and buying guides</Link>
      </div>
    </div>
  );
}

function WalletBlock({ name, title, number, orderNumber }: { name: string; title?: string | null; number?: string | null; orderNumber: string }) {
  return (
    <dl className="mt-2 space-y-1 text-sm" aria-label={`${name} details`}>
      <div className="flex justify-between gap-4"><dt className="text-muted">{name} number</dt><dd className="min-w-0 break-all font-semibold">{number ?? "We will message you the number"}</dd></div>
      {title && <div className="flex justify-between gap-4"><dt className="text-muted">Account title</dt><dd className="min-w-0 break-words font-semibold">{title}</dd></div>}
      <div className="flex justify-between gap-4"><dt className="text-muted">Note / reference</dt><dd className="font-semibold">{orderNumber}</dd></div>
    </dl>
  );
}
