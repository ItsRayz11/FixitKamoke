import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { queueStaffAlert } from "@/lib/email/alerts";
import { hashToken } from "./create-order";
import { isManualMethod } from "@/lib/domain/payment-label";
import { cleanCustomerUploads } from "@/lib/cloudinary";

export class PaymentProofError extends Error {}

/**
 * A customer who paid a bank transfer or wallet payment by hand sends us the transaction ID. It is saved on the order and the
 * order's payment moves to "pending" so staff can find it. It never marks anything paid: only a person (or a verified gateway) does that.
 */
export async function submitTransferReference(db: Db, orderNumber: string, token: string, reference: string): Promise<void> {
  const ref = reference.trim().replace(/\s+/g, " ");
  if (ref.length < 4 || ref.length > 60) throw new PaymentProofError("Please enter the transaction ID or reference from your payment (4 to 60 characters).");
  await db.tx(async (q) => {
    const o = (await q.query<{ id: string; payment_method: string; payment_status: string; status: string; advance_required: number; advance_paid: number }>(
      "select id, payment_method, payment_status, status, advance_required, advance_paid from orders where order_number = $1 and tracking_token_hash = $2 for update", [orderNumber, hashToken(token)]))[0];
    if (!o) throw new PaymentProofError("We could not find that order.");
    const advanceOrder = o.payment_method === "cod" && o.advance_required > 0;
    if (!isManualMethod(o.payment_method) && !advanceOrder) throw new PaymentProofError("This order is not paid by transfer.");
    if (advanceOrder && o.advance_paid >= o.advance_required) throw new PaymentProofError("Your advance is already confirmed. Thank you.");
    if (o.payment_status === "paid") throw new PaymentProofError("This order is already marked as paid. Thank you.");
    if (["cancelled", "rejected", "returned"].includes(o.status)) throw new PaymentProofError("This order was cancelled.");
    await q.query("update orders set payment_reference = $2, payment_status = 'pending', updated_at = now() where id = $1", [o.id, ref]);
    await audit("customer", "payment_reference_submitted", "order", o.id, { reference: ref }, q);
    await queueStaffAlert(q, "order", `${orderNumber}-paid`, `Customer says they have paid order ${orderNumber}. Reference: ${ref.slice(0, 40)}. Please check and mark it paid.`);
  });
}

/**
 * A customer who paid by transfer or wallet attaches a picture of the receipt (up to three per order). Like the transaction ID it
 * only tells staff where to look: the order's payment moves to "pending" and staff are alerted, but nothing is ever marked paid here.
 * `urls` must be pictures in the shop's own image account; anything else is refused.
 */
export async function submitReceipt(db: Db, orderNumber: string, token: string, urls: unknown, cloudName: string | undefined | null): Promise<void> {
  let clean: string[];
  try { clean = cleanCustomerUploads(urls, "receipt", cloudName); } catch (e) { throw new PaymentProofError(e instanceof Error ? e.message : "That picture could not be used."); }
  if (clean.length === 0) throw new PaymentProofError("Please choose a picture of your receipt.");
  await db.tx(async (q) => {
    const o = (await q.query<{ id: string; payment_method: string; payment_status: string; status: string; advance_required: number; advance_paid: number; payment_receipts: string[] }>(
      "select id, payment_method, payment_status, status, advance_required, advance_paid, payment_receipts from orders where order_number = $1 and tracking_token_hash = $2 for update", [orderNumber.toUpperCase(), hashToken(token)]))[0];
    if (!o) throw new PaymentProofError("We could not find that order.");
    const advanceOrder = o.payment_method === "cod" && o.advance_required > 0;
    if (!isManualMethod(o.payment_method) && !advanceOrder) throw new PaymentProofError("This order is not paid by transfer.");
    if (advanceOrder && o.advance_paid >= o.advance_required) throw new PaymentProofError("Your advance is already confirmed. Thank you.");
    if (o.payment_status === "paid") throw new PaymentProofError("This order is already marked as paid. Thank you.");
    if (["cancelled", "rejected", "returned"].includes(o.status)) throw new PaymentProofError("This order was cancelled.");
    const all = [...o.payment_receipts, ...clean.filter((u) => !o.payment_receipts.includes(u))];
    if (all.length > 3) throw new PaymentProofError("You can attach up to 3 receipt pictures to an order. If you need to send more, message us on WhatsApp.");
    await q.query("update orders set payment_receipts = $2::jsonb, payment_status = 'pending', updated_at = now() where id = $1", [o.id, JSON.stringify(all)]);
    await audit("customer", "payment_receipt_submitted", "order", o.id, { count: all.length }, q);
    await queueStaffAlert(q, "order", `${orderNumber}-receipt-${all.length}`, `Customer sent a receipt picture for order ${orderNumber}. Please check it and mark the payment paid.`);
  });
}
