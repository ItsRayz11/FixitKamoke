import type { Db } from "@/lib/db";
import { REPAIR_LABEL, type RepairStatus } from "@/lib/domain/repair-state";
import { renderOrderEmail, renderPasswordReset, renderRepairEmail, renderStaffAlert, type EmailContext, type OrderEmailData, type RepairEmailData, type Rendered } from "./templates";

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

async function render(db: Db, row: OutboxRow, ctx: EmailContext): Promise<Rendered | null> {
  if (row.kind === "staff_alert") return renderStaffAlert(row.payload.kind, row.payload.ref, row.payload.summary ?? "", ctx);
  if (row.kind === "password_reset") return row.payload.resetToken ? renderPasswordReset(row.payload.resetToken, ctx) : null;
  if (row.kind.startsWith("order_")) {
    const o = (await db.query<{ id: string; order_number: string; customer_name: string; status: string; payment_method: string; subtotal: number; discount: number; shipping_fee: number; shipping_status: string; total: number }>(
      "select id, order_number, customer_name, status, payment_method, subtotal, discount, shipping_fee, shipping_status, total from orders where order_number = $1", [row.payload.orderNumber]))[0];
    if (!o) return null;
    const items = await db.query<{ product_name: string; quantity: number; line_total: number }>("select product_name, quantity, line_total from order_items where order_id = $1", [o.id]);
    const d: OrderEmailData = {
      orderNumber: o.order_number, customerName: o.customer_name, status: o.status, paymentMethod: o.payment_method, subtotal: o.subtotal, discount: o.discount,
      shippingFee: o.shipping_fee, shippingStatus: o.shipping_status, total: o.total, items: items.map((i) => ({ name: i.product_name, quantity: i.quantity, lineTotal: i.line_total })),
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
  if (!send) return result; // not configured: leave everything queued, never pretend to send

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
