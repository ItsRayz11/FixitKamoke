import crypto from "node:crypto";
import type { Db } from "@/lib/db";
import { hashToken } from "./create-order";
import { normalizePkMobile } from "@/lib/domain/phone";

export interface OrderView {
  orderNumber: string;
  status: string;
  createdAt: string;
  customerName: string;
  city: string;
  paymentMethod: string;
  paymentStatus: string;
  paymentProvider: string | null;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  shippingStatus: string;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  history: { status: string; at: string }[];
}

interface OrderRow {
  id: string; order_number: string; status: string; created_at: Date | string; customer_name: string; city: string; payment_method: string; payment_status: string; payment_provider: string | null;
  subtotal: number; discount: number; shipping_fee: number; total: number; shipping_status: string; phone: string; tracking_token_hash: string;
}

const safeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function build(db: Db, o: OrderRow): Promise<OrderView> {
  const items = await db.query<{ product_name: string; quantity: number; unit_price: number; line_total: number }>(
    "select product_name, quantity, unit_price, line_total from order_items where order_id = $1 order by product_name", [o.id]);
  const history = await db.query<{ to_status: string; created_at: Date | string }>(
    "select to_status, created_at from order_status_history where order_id = $1 order by created_at, id", [o.id]);
  return {
    orderNumber: o.order_number, status: o.status, createdAt: new Date(o.created_at).toISOString(), customerName: o.customer_name, city: o.city,
    paymentMethod: o.payment_method, paymentStatus: o.payment_status, paymentProvider: o.payment_provider, subtotal: o.subtotal, discount: o.discount, shippingFee: o.shipping_fee, total: o.total, shippingStatus: o.shipping_status,
    items: items.map((i) => ({ name: i.product_name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total })),
    history: history.map((h) => ({ status: h.to_status, at: new Date(h.created_at).toISOString() })),
  };
}

const COLS = "id, order_number, status, created_at, customer_name, city, payment_method, payment_status, payment_provider, subtotal, discount, shipping_fee, total, shipping_status, phone, tracking_token_hash";

export async function findOrderByToken(db: Db, orderNumber: string, token: string): Promise<OrderView | null> {
  const rows = await db.query<OrderRow>(`select ${COLS} from orders where order_number = $1`, [orderNumber.toUpperCase()]);
  const o = rows[0];
  return o && safeEq(o.tracking_token_hash, hashToken(token)) ? build(db, o) : null;
}

export async function findOrderByPhone(db: Db, orderNumber: string, phone: string): Promise<OrderView | null> {
  const norm = normalizePkMobile(phone);
  if (!norm) return null;
  const rows = await db.query<OrderRow>(`select ${COLS} from orders where order_number = $1`, [orderNumber.trim().toUpperCase()]);
  const o = rows[0];
  return o && safeEq(o.phone, norm) ? build(db, o) : null;
}

/** An order that belongs to this signed-in account. Never matched by phone or email. */
export async function findOrderForCustomer(db: Db, customerId: string, orderNumber: string): Promise<OrderView | null> {
  const rows = await db.query<OrderRow & { customer_id: string | null }>(`select ${COLS}, customer_id from orders where order_number = $1 and customer_id = $2`, [orderNumber.toUpperCase(), customerId]);
  return rows[0] ? build(db, rows[0]) : null;
}

export const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: "Received, awaiting confirmation",
  confirmed: "Confirmed",
  processing: "Being prepared",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Could not be accepted",
  failed_delivery: "Delivery attempt failed",
  return_requested: "Return requested",
  returned: "Returned",
};
