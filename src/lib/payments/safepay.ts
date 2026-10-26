import crypto from "node:crypto";

/**
 * Safepay (cards and wallets on Safepay's own hosted page). We create a payment tracker with Safepay's API, send the customer
 * to Safepay to pay, and Safepay tells our server the result with a signed webhook. Card details never touch this site.
 *
 * Written from Safepay's public API reference and SDKs. It has NOT been run against a live Safepay account from here, and
 * Safepay's address and payload details can differ by account version, so every address below can be overridden with a setting
 * and the gateway stays off until the owner's sandbox test has passed end to end (Admin -> Payments).
 */
export interface SafepayConfig {
  apiKey: string; secretKey: string; webhookSecret: string; env: "sandbox" | "production"; apiBase: string; checkoutBase: string;
}

export function safepayConfig(env: NodeJS.ProcessEnv = process.env): SafepayConfig | null {
  const apiKey = env.SAFEPAY_API_KEY?.trim(), secretKey = env.SAFEPAY_SECRET_KEY?.trim(), webhookSecret = env.SAFEPAY_WEBHOOK_SECRET?.trim();
  if (!apiKey || !secretKey || !webhookSecret) return null;
  const e = env.SAFEPAY_ENV?.trim() === "production" ? "production" : "sandbox";
  const host = e === "production" ? "https://api.getsafepay.com" : "https://sandbox.api.getsafepay.com";
  return {
    apiKey, secretKey, webhookSecret, env: e,
    apiBase: (env.SAFEPAY_API_BASE?.trim() || host).replace(/\/$/, ""),
    checkoutBase: (env.SAFEPAY_CHECKOUT_BASE?.trim() || `${host}/checkout/pay`).replace(/\/$/, ""),
  };
}

export interface SafepayRequest { reference: string; amountPkr: number; successUrl: string; cancelUrl: string }

/** Asks Safepay for a payment tracker and returns the hosted-checkout address to send the customer to. */
export async function createSafepayCheckout(cfg: SafepayConfig, r: SafepayRequest, fetchImpl: typeof fetch = fetch): Promise<{ tracker: string; url: string }> {
  const res = await fetchImpl(`${cfg.apiBase}/order/v1/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-SFPY-MERCHANT-SECRET": cfg.secretKey },
    body: JSON.stringify({ client: cfg.apiKey, amount: r.amountPkr, currency: "PKR", environment: cfg.env }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Safepay refused to start the payment (HTTP ${res.status}). Check the API key, secret key and environment.`);
  const json = (await res.json().catch(() => null)) as { data?: { token?: string } } | null;
  const tracker = json?.data?.token;
  if (!tracker || typeof tracker !== "string") throw new Error("Safepay did not return a payment tracker. Check SAFEPAY_API_BASE against your Safepay dashboard.");
  const q = new URLSearchParams({ env: cfg.env, beacon: tracker, source: "custom", order_id: r.reference, redirect_url: r.successUrl, cancel_url: r.cancelUrl });
  return { tracker, url: `${cfg.checkoutBase}?${q.toString()}` };
}

/** HMAC-SHA512 (hex) of the exact bytes Safepay sent, keyed with the webhook secret, compared in constant time. */
export function verifySafepaySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const want = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.trim().toLowerCase()), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface SafepayEvent { strings: string[]; amounts: number[]; state: "paid" | "failed" | "other" }

/**
 * Reads a webhook body without trusting any one field name: collects every text value and every amount, and works out
 * whether it reports success or failure from the event type / status words. The caller then matches the text values against
 * the trackers and references it issued, and checks the amount, so an event we cannot match to one of our own payments changes nothing.
 */
export function readSafepayEvent(body: unknown): SafepayEvent {
  const strings: string[] = [], amounts: number[] = [], words: string[] = [];
  const walk = (v: unknown, key: string, depth: number) => {
    if (depth > 7 || v === null || v === undefined) return;
    if (typeof v === "string") {
      strings.push(v);
      if (/^(type|event|status|state)$/i.test(key)) words.push(v.toLowerCase());
    } else if (typeof v === "number" && /amount|total/i.test(key)) amounts.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key, depth + 1));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k, depth + 1);
  };
  walk(body, "", 0);
  const text = words.join(" ");
  const state = /fail|declin|cancel|expire|error/.test(text) ? "failed" : /succe|paid|captur|complet/.test(text) ? "paid" : "other";
  return { strings, amounts, state };
}
