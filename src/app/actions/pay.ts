"use server";

import { headers } from "next/headers";
import { site } from "@/config/site";
import { clientIp } from "@/lib/client-ip";
import { getDb } from "@/lib/db";
import { getAdmin } from "@/lib/auth/session";
import { hashToken } from "@/lib/orders/create-order";
import { getPaymentOptions } from "@/lib/payments";
import { buildJazzcashForm, jazzcashConfig } from "@/lib/payments/jazzcash";
import { createSafepayCheckout, safepayConfig } from "@/lib/payments/safepay";
import { createAttempt, markAttemptError, orderForPayment, PaymentStartError, setProviderRef } from "@/lib/payments/settle";
import { rateLimit } from "@/lib/rate-limit";
import { PaymentProofError, submitTransferReference } from "@/lib/orders/payment-proof";

export type StartPayResult =
  | { kind: "redirect"; url: string }
  | { kind: "form"; action: string; fields: Record<string, string> }
  | { kind: "error"; message: string };

/**
 * Starts (or restarts) payment for an online order. The caller proves it owns the order with the private order token; the amount
 * comes from the order total in the database and the gateway comes from the order, never from the browser.
 */
export async function startOnlinePayment(orderNumber: string, token: string): Promise<StartPayResult> {
  const h = await headers();
  if (!rateLimit(`pay-start:${clientIp((n) => h.get(n))}`, 15, 10 * 60_000)) return { kind: "error", message: "Too many attempts. Please wait a few minutes and try again." };
  if (typeof orderNumber !== "string" || typeof token !== "string" || !token) return { kind: "error", message: "We could not find that order." };
  const db = await getDb();
  const order = await orderForPayment(db, orderNumber, hashToken(token));
  if (!order) return { kind: "error", message: "We could not find that order." };
  const live = await getPaymentOptions(db, { staff: (await getAdmin()) !== null });
  if (!order.provider || !live.online.includes(order.provider)) return { kind: "error", message: "That payment method is not available right now. Please contact us and we will help you pay." };

  let attempt;
  try { attempt = await createAttempt(db, order); } catch (e) {
    if (e instanceof PaymentStartError) return { kind: "error", message: e.message };
    throw e;
  }
  const result = `${site.baseUrl}/pay/result`;
  try {
    if (order.provider === "jazzcash") {
      const cfg = jazzcashConfig();
      if (!cfg) throw new Error("JazzCash is not configured.");
      return { kind: "form", ...buildJazzcashForm(cfg, { reference: attempt.reference, amountPkr: attempt.amount, orderNumber: order.orderNumber, returnUrl: `${site.baseUrl}/api/pay/jazzcash/return` }) };
    }
    if (order.provider === "safepay") {
      const cfg = safepayConfig();
      if (!cfg) throw new Error("Safepay is not configured.");
      const c = await createSafepayCheckout(cfg, { reference: attempt.reference, amountPkr: attempt.amount, successUrl: `${result}?ref=${attempt.reference}`, cancelUrl: `${result}?ref=${attempt.reference}` });
      await setProviderRef(db, attempt.id, c.tracker);
      return { kind: "redirect", url: c.url };
    }
    throw new Error("No adapter for this gateway.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await markAttemptError(db, attempt.id, msg);
    console.error("start payment failed", order.orderNumber, msg);
    return { kind: "error", message: "We could not reach the payment provider. Nothing was charged. Please try again, or contact us." };
  }
}

/** A customer tells us the transaction ID of a transfer they made. Saved for staff to check; it never marks the order paid. */
export async function sendTransferReference(orderNumber: string, token: string, reference: string): Promise<{ ok: boolean; message: string }> {
  const h = await headers();
  if (!rateLimit(`pay-proof:${clientIp((n) => h.get(n))}`, 10, 60 * 60_000)) return { ok: false, message: "Too many attempts. Please try again later." };
  if (typeof orderNumber !== "string" || typeof token !== "string" || typeof reference !== "string") return { ok: false, message: "Please check the details and try again." };
  try {
    await submitTransferReference(await getDb(), orderNumber, token, reference);
    return { ok: true, message: "Thank you. We have your reference and will confirm the payment shortly." };
  } catch (e) {
    if (e instanceof PaymentProofError) return { ok: false, message: e.message };
    console.error("transfer reference failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong. Please try again or message us." };
  }
}
