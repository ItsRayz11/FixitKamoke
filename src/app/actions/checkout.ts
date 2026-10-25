"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getProductsByIds, effectivePrice } from "@/lib/catalog";
import { checkoutSchema, CheckoutError, createOrder, getShippingConfig } from "@/lib/orders/create-order";
import { quoteShipping } from "@/lib/domain/shipping";
import { rateLimit } from "@/lib/rate-limit";
import { getCustomer } from "@/lib/auth/session";
import { listAddresses } from "@/lib/customers/customers";
import { sendQueuedEmailSoon } from "@/lib/email/run";
import { ZodError } from "zod";

const linesSchema = z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).max(50);

export interface CartView {
  lines: { productId: string; slug: string; name: string; image: string | null; unitPrice: number; quantity: number; stock: number; lineTotal: number; problem: string | null }[];
  subtotal: number;
  /** Product ids that no longer exist or are unpublished. */
  missing: string[];
}

/** Authoritative cart view: current prices and stock from the database. */
export async function getCartView(input: unknown): Promise<CartView> {
  const parsed = linesSchema.safeParse(input);
  if (!parsed.success) return { lines: [], subtotal: 0, missing: [] };
  const products = await getProductsByIds(parsed.data.map((l) => l.productId));
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: CartView["lines"] = [];
  const missing: string[] = [];
  for (const l of parsed.data) {
    const p = byId.get(l.productId);
    if (!p) { missing.push(l.productId); continue; }
    const unitPrice = effectivePrice(p);
    const problem = p.stock <= 0 ? "Out of stock" : l.quantity > p.stock ? `Only ${p.stock} available` : null;
    lines.push({ productId: p.id, slug: p.slug, name: p.name, image: p.image?.url ?? null, unitPrice, quantity: l.quantity, stock: p.stock, lineTotal: unitPrice * l.quantity, problem });
  }
  return { lines, subtotal: lines.reduce((s, l) => s + l.lineTotal, 0), missing };
}

export type ShippingView =
  | { status: "quoted"; fee: number; codAvailable: boolean; etaDays: [number, number] | null }
  | { status: "needs_confirmation" }
  | { status: "not_serviceable" }
  | { status: "unconfigured" };

export async function getShippingView(city: string, subtotal: number): Promise<ShippingView> {
  if (typeof city !== "string" || city.trim().length < 2 || !Number.isSafeInteger(subtotal) || subtotal < 0) return { status: "needs_confirmation" };
  const config = await getShippingConfig(await getDb());
  if (!config) return { status: "unconfigured" };
  const q = quoteShipping(config, city, subtotal);
  return q.status === "quoted" ? { status: "quoted", fee: q.fee, codAvailable: q.codAvailable, etaDays: q.etaDays } : { status: q.status };
}

export type PlaceOrderResult =
  | { ok: true; orderNumber: string; token: string }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };

export async function placeOrder(input: unknown): Promise<PlaceOrderResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`order:${ip}`, 10, 10 * 60_000)) {
    return { ok: false, code: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." };
  }
  try {
    const parsed = checkoutSchema.parse(input);
    const customer = await getCustomer(); // from the session cookie, never from the form
    const order = await createOrder(await getDb(), parsed, { customerId: customer?.id });
    if (!order.trackingToken) {
      // Idempotent retry: order exists but the plaintext token is only ever shown once.
      return { ok: false, code: "duplicate", message: `Your order ${order.orderNumber} was already received. Please check your confirmation or contact us.` };
    }
    sendQueuedEmailSoon();
    return { ok: true, orderNumber: order.orderNumber, token: order.trackingToken };
  } catch (e) {
    if (e instanceof CheckoutError) return { ok: false, code: e.code, message: e.message };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
      return { ok: false, code: "invalid", message: "Please check the highlighted fields.", fieldErrors };
    }
    console.error("placeOrder failed", e instanceof Error ? e.message : e);
    return { ok: false, code: "server_error", message: "Something went wrong placing your order. Nothing was charged. Please try again." };
  }
}

export interface CheckoutPrefill { name: string; phone: string; email: string; city: string; area: string; address: string }

/** Pre-fills the checkout form for a signed-in customer from their account and default saved address. */
export async function getCheckoutPrefill(): Promise<CheckoutPrefill | null> {
  const c = await getCustomer();
  if (!c) return null;
  const a = (await listAddresses(await getDb(), c.id))[0];
  return { name: a?.recipientName ?? c.name, phone: a?.phone ?? c.phone ?? "", email: c.email, city: a?.city ?? "", area: a?.area ?? "", address: a?.address ?? "" };
}
