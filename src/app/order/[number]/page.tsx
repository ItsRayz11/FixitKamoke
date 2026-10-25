import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { findOrderByToken } from "@/lib/orders/lookup";
import { OrderDetails } from "@/components/order/order-details";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
// Private page: never index, never cache shared.
export const metadata: Metadata = { title: "Order confirmation", robots: { index: false, follow: false } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ number }, { t }] = await Promise.all([params, searchParams]);
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
  const wa = whatsappLink({ kind: "order", orderNumber: order.orderNumber });
  return (
    <div className="container-x max-w-2xl py-10">
      <h1 className="text-2xl font-extrabold">Thank you, {order.customerName.split(" ")[0]}. Your order is received.</h1>
      <p className="mt-2 text-muted">
        This is not yet a confirmed order: we will contact you to confirm it{order.shippingStatus === "needs_confirmation" ? " and your delivery fee" : ""}.
        Save this page or your order number <strong>{order.orderNumber}</strong> to track it later.
      </p>
      <div className="mt-6"><OrderDetails order={order} /></div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/track" className="text-accent">Track this order later</Link>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-accent">Message us on WhatsApp</a>}
        <Link href="/shop" className="text-accent">Continue shopping</Link>
      </div>
    </div>
  );
}
