import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { formatPKR } from "@/lib/domain/money";
import { PayResult } from "@/components/order/pay-result";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment result", robots: { index: false, follow: false } };

/**
 * Where a customer lands after the payment provider's page. What it says comes only from our own records, which change only when the
 * provider's signed notification arrives. The address bar can name a payment but can never make it look paid.
 */
export default async function PayResultPage({ searchParams }: { searchParams: Promise<{ ref?: string; error?: string }> }) {
  const { ref, error } = await searchParams;
  const row = ref && /^[A-Za-z0-9]{8,30}$/.test(ref)
    ? (await (await getDb()).query<{ status: string; amount: number; order_number: string; payment_status: string }>(
        `select a.status, a.amount, o.order_number, o.payment_status from payment_attempts a join orders o on o.id = a.order_id where a.reference = $1`, [ref]))[0]
    : null;

  if (!row) {
    return (
      <div className="container-x max-w-xl py-12 text-center">
        <h1 className="text-2xl font-extrabold">We could not read that payment result</h1>
        <p className="mt-2 text-muted">{error ? "The payment provider's reply could not be verified, so nothing was changed. " : ""}If you paid, please do not pay again: message us with your order number and we will check.</p>
      </div>
    );
  }
  const state = row.payment_status === "paid" ? "paid" : row.status === "failed" ? "failed" : "waiting";
  return (
    <div className="container-x max-w-xl py-12">
      <PayResult state={state} orderNumber={row.order_number} amountLabel={formatPKR(row.amount)} />
    </div>
  );
}
