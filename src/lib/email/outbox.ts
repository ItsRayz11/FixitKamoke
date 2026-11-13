import type { Db } from "@/lib/db";
import { REPAIR_LABEL, type RepairStatus } from "@/lib/domain/repair-state";
import { releaseRestockedAlerts } from "@/lib/stock-alerts";
import { expireUnpaidOnlineOrders } from "@/lib/payments/expire";
import { displayName } from "@/lib/domain/display";
import { renderBackInStock, renderContactReceived, renderOrderEmail, renderPasswordReset, renderRepairEmail, renderStaffAlert, type EmailContext, type OrderEmailData, type RepairEmailData, type Rendered } from "./templates";

export interface EmailConfig { apiKey: string; from: string }
export type SendFn = (msg: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) => Promise<void>;

/** Returns the Resend configuration, or null when email is not set up. */
export function emailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** Sends through the Resend HTTP API. Errors carry the provider's message but never the API key. */
export function resendSender(cfg: EmailConfig, fetchImpl: typeof fetch = fetch): SendFn {
  return async ({ to, subject, html, text, idempotencyKey }) => {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
    }
  };
}

const MAX_ATTEMPTS = 5;
const EXPIRE_AFTER_MS = 7 * 24 * 3600_000;
/** Security emails go stale quickly: a reset link must not arrive hours later. */
const expireAfter = (kind: string) => (kind === "password_reset" ? 3600_000 : EXPIRE_AFTER_MS);

interface OutboxRow { id: string; kind: string; recipient: string; payload: Record<string, string>; attempts: number; dedupe_key: string; created_at: Date | string }

/**
 * A queued order email is only sent if it is still true when it goes out. An "order confirmed" email for an order that was
 * cancelled in the meantime, or a "paid" email for an order that is not paid, would be wrong, so it is dropped instead.
 */
export function orderEmailStale(kind: string, o: { status: string; payment_status: string; advance_paid: number; refunded_amount: number }): boolean {
  const closed = ["cancelled", "rejected", "returned"].includes(o.status);
  switch (kind) {
    case "order_received": return closed;
    case "order_payment_confirmed": return closed || !["paid", "refunded", "partially_refunded"].includes(o.payment_status);
    case "order_tracking_updated": return closed || !["shipped", "out_for_delivery", "delivered"].includes(o.status);
    case "order_advance_verified": return o.advance_paid === 0;
    case "order_confirmed": return closed || o.status === "pending_confirmation";
    case "order_shipped": return !["shipped", "out_for_delivery", "delivered"].includes(o.status);
    case "order_out_for_delivery": return o.status !== "out_for_delivery";
    case "order_delivered": return o.status !== "delivered";
    case "order_cancelled": return !["cancelled", "rejected"].includes(o.status);
    case "order_refunded": return o.refunded_amount === 0;
    default: return false;
  }
}

async function render(db: Db, row: OutboxRow, ctx: EmailContext): Promise<Rendered | null | "stale"> {
  if (row.kind === "contact_received") return renderContactReceived(row.payload.name ?? "", ctx);
  if (row.kind === "staff_alert") return renderStaffAlert(row.payload.kind, row.payload.ref, row.payload.summary ?? "", ctx);
  if (row.kind === "back_in_stock") {
    const pr = (await db.query<{ name: string; slug: string; stock: number; variant_label: string | null }>("select name, slug, stock, variant_label from products where id = $1", [row.payload.productId]))[0];
    return pr ? renderBackInStock({ name: displayName(pr.name, pr.variant_label), slug: pr.slug, stock: pr.stock }, ctx) : null;
  }
  if (row.kind === "password_reset") return row.payload.resetToken ? renderPasswordReset(row.payload.resetToken, ctx) : null;
  if (row.kind.startsWith("order_")) {
    const o = (await db.query<{ id: string; order_number: string; customer_name: string; status: string; payment_method: string; payment_provider: string | null; subtotal: number; discount: number; shipping_fee: number; shipping_status: string; total: number; advance_required: number; advance_paid: number; carrier: string | null; tracking_number: string | null; refunded_amount: number; payment_status: string }>(
      "select id, order_number, customer_name, status, payment_method, payment_provider, subtotal, discount, shipping_fee, shipping_status, total, advance_required, advance_paid, carrier, tracking_number, refunded_amount, payment_status from orders where order_number = $1", [row.payload.orderNumber]))[0];
    if (!o) return null;
    if (orderEmailStale(row.kind, o)) return "stale";
    const items = await db.query<{ product_name: string; quantity: number; line_total: number }>("select product_name, quantity, line_total from order_items where order_id = $1", [o.id]);
    const d: OrderEmailData = {
      orderNumber: o.order_number, customerName: o.customer_name, status: o.status, paymentMethod: o.payment_method, paymentProvider: o.payment_provider, subtotal: o.subtotal, discount: o.discount,
      shippingFee: o.shipping_fee, shippingStatus: o.shipping_status, total: o.total, advanceRequired: o.advance_required, advancePaid: o.advance_paid, carrier: o.carrier, trackingNumber: o.tracking_number, refundedAmount: o.refunded_amount, paymentStatus: o.payment_status, items: items.map((i) => ({ name: i.product_name, quantity: i.quantity, lineTotal: i.line_total })),
    };
    return renderOrderEmail(row.kind, d, ctx);
  }
  if (row.kind.startsWith("repair_")) {
    const r = (await db.query<{ reference: string; customer_name: string; status: RepairStatus; estimate_amount: number | null; estimate_is_confirmed: boolean; customer_message: string | null }>(
      "select reference, customer_name, status, estimate_amount, estimate_is_confirmed, customer_message from repair_inquiries where reference = $1", [row.payload.reference]))[0];
    if (!r) return null;
    const status = (row.payload.status as RepairStatus | undefined) ?? r.status;
    const d: RepairEmailData = { reference: r.reference, customerName: r.customer_name, status, label: REPAIR_LABEL[status] ?? status, estimateAmount: r.estimate_amount, estimateIsConfirmed: r.estimate_is_confirmed, customerMessage: r.customer_message };
    return renderRepairEmail(row.kind, d, ctx);
  }
  return null;
}

export interface ProcessResult { configured: boolean; sent: number; failed: number; expired: number; skipped: number }

/**
 * Sends pending notifications. Safe to run concurrently and repeatedly: rows are claimed with SKIP LOCKED,
 * each row has a stable idempotency key (so a retry after a timeout cannot double-send at the provider),
 * and a failure never affects the order or repair that queued the email.
 */
export async function processOutbox(db: Db, ctx: EmailContext, send: SendFn | null, limit = 20): Promise<ProcessResult> {
  const result: ProcessResult = { configured: send !== null, sent: 0, failed: 0, expired: 0, skipped: 0 };
  await expireUnpaidOnlineOrders(db).catch(() => 0); // housekeeping that runs whenever the queue runs, even with email switched off
  if (!send) return result; // not configured: leave everything queued, never pretend to send

  await releaseRestockedAlerts(db); // catches any restock that happened without going through an admin page

  const rows = await db.tx((q) =>
    q.query<OutboxRow>(
      `select id, kind, recipient, payload, attempts, dedupe_key, created_at from notification_outbox
       where status = 'pending' and attempts < $1 order by created_at limit $2 for update skip locked`, [MAX_ATTEMPTS, limit]));

  for (const row of rows) {
    if (Date.now() - new Date(row.created_at).getTime() > expireAfter(row.kind)) {
      // Wipe the payload too: it may hold a secret token.
      await db.query("update notification_outbox set status = 'failed', payload = '{}'::jsonb, last_error = 'expired before it could be sent' where id = $1 and status = 'pending'", [row.id]);
      result.expired++;
      continue;
    }
    try {
      const msg = await render(db, row, ctx);
      if (msg === "stale") {
        await db.query("update notification_outbox set status = 'failed', attempts = attempts + 1, last_error = 'not sent: the order changed, so this message was no longer accurate' where id = $1", [row.id]);
        result.skipped++;
        continue;
      }
      if (!msg) {
        await db.query("update notification_outbox set status = 'failed', attempts = attempts + 1, last_error = 'no template or record for this notification' where id = $1", [row.id]);
        result.skipped++;
        continue;
      }
      await send({ to: row.recipient, subject: msg.subject, html: msg.html, text: msg.text, idempotencyKey: row.dedupe_key });
      await db.query("update notification_outbox set status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = null, payload = case when kind = 'password_reset' then '{}'::jsonb else payload end where id = $1", [row.id]);
      result.sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const err = (e instanceof Error ? e.message : "unknown error").slice(0, 300);
      await db.query("update notification_outbox set attempts = $2, last_error = $3, status = $4 where id = $1", [row.id, attempts, err, attempts >= MAX_ATTEMPTS ? "failed" : "pending"]);
      result.failed++;
    }
  }
  return result;
}
