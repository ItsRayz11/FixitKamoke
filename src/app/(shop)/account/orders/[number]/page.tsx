import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { findOrderForCustomer } from "@/lib/orders/lookup";
import { AccountNav } from "@/components/account/account-nav";
import { OrderDetails } from "@/components/order/order-details";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order details" };

export default async function AccountOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const me = await requireCustomer();
  const { number } = await params;
  // Looked up by account, so another customer's order number is simply "not found".
  const order = await findOrderForCustomer(await getDb(), me.id, number);
  if (!order) notFound();
  return (
    <>
      <AccountNav name={me.name} current="/account" />
      <p className="mb-3 text-sm"><Link href="/account" className="font-semibold text-accent underline">← All orders</Link></p>
      <OrderDetails order={order} />
    </>
  );
}
