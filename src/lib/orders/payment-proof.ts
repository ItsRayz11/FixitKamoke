import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { queueStaffAlert } from "@/lib/email/alerts";
import { hashToken } from "./create-order";

export class PaymentProofError extends Error {}

/**
 * A customer who paid a bank transfer or wallet payment by hand sends us the transaction ID. It is saved on the order and the
 * order's payment moves to "pending" so staff can find it. It never marks anything paid: only a person (or a verified gateway) does that.
 */
export async function submitTransferReference(db: Db, orderNumber: string, token: string, reference: string): Promise<void> {
  const ref = reference.trim().replace(/\s+/g, " ");
  if (ref.length < 4 || ref.length > 60) throw new PaymentProofError("Please enter the transaction ID or reference from your payment (4 to 60 characters).");
  await db.tx(async (q) => {
    const o = (await q.query<{ id: string; payment_method: string; payment_status: string; status: string }>(
      "select id, payment_method, payment_status, status from orders where order_number = $1 and tracking_token_hash = $2 for update", [orderNumber, hashToken(token)]))[0];
    if (!o) throw new PaymentProofError("We could not find that order.");
    if (o.payment_method !== "bank_transfer") throw new PaymentProofError("This order is not paid by transfer.");
    if (o.payment_status === "paid") throw new PaymentProofError("This order is already marked as paid. Thank you.");
    if (["cancelled", "rejected", "returned"].includes(o.status)) throw new PaymentProofError("This order was cancelled.");
    await q.query("update orders set payment_reference = $2, payment_status = 'pending', updated_at = now() where id = $1", [o.id, ref]);
    await audit("customer", "payment_reference_submitted", "order", o.id, { reference: ref }, q);
    await queueStaffAlert(q, "order", `${orderNumber}-paid`, `Customer says they have paid order ${orderNumber}. Reference: ${ref.slice(0, 40)}. Please check and mark it paid.`);
  });
}
