import type { Queryable } from "@/lib/db";
import { jazzcashConfig } from "./jazzcash";
import { safepayConfig } from "./safepay";

/**
 * Payment methods. Cash on delivery and bank transfer are real and fully working.
 * An online gateway reaches checkout only when ALL of these are true:
 *   1. it has an adapter here (Easypaisa does not yet),
 *   2. its credentials are set on the server,
 *   3. the owner moved it out of "off" in Admin -> Payments, and
 *   4. a signed notification from the gateway has already been received AND matched to a real test payment ("paid"),
 *      which is how the owner proves the credentials, signature and callback address all work.
 * Until condition 4 is met, "testing" mode shows the choice to signed-in staff only, so a test payment can be made without any customer seeing it.
 * There is no simulated or "demo" payment.
 */
export type OfflineMethod = "cod" | "bank_transfer";
export type GatewayId = "jazzcash" | "easypaisa" | "safepay";

export interface PaymentOptions {
  cod: boolean;
  bankTransfer: boolean;
  /** Gateways a customer may choose right now. */
  online: GatewayId[];
}

export const OFFLINE_LABEL: Record<OfflineMethod, string> = { cod: "Cash on delivery", bank_transfer: "Bank transfer" };

export interface Gateway {
  id: GatewayId;
  name: string;
  /** Text the customer sees on the checkout choice. */
  checkoutLabel: string;
  /** Environment variables the integration needs. */
  requiredEnv: string[];
  /** True once an adapter exists (it still needs the four conditions above to appear at checkout). */
  implemented: boolean;
  /** How the shop learns a payment succeeded. */
  detection: string;
  notes: string;
}

export const GATEWAYS: Gateway[] = [
  {
    id: "safepay", name: "Safepay (cards and wallets)", checkoutLabel: "Pay online by card or wallet",
    requiredEnv: ["SAFEPAY_API_KEY", "SAFEPAY_SECRET_KEY", "SAFEPAY_WEBHOOK_SECRET"], implemented: true,
    detection: "Automatic: Safepay sends our server a signed webhook, and the order is marked paid only when the signature, the reference and the exact amount all match.",
    notes: "Needs a Safepay merchant account. Card details are only ever entered on Safepay's page. Optional: SAFEPAY_ENV=production (default sandbox), SAFEPAY_API_BASE, SAFEPAY_CHECKOUT_BASE.",
  },
  {
    id: "jazzcash", name: "JazzCash (wallet and card)", checkoutLabel: "Pay with JazzCash",
    requiredEnv: ["JAZZCASH_MERCHANT_ID", "JAZZCASH_PASSWORD", "JAZZCASH_INTEGRITY_SALT"], implemented: true,
    detection: "Automatic: JazzCash posts a signed result to our server, and the order is marked paid only when the signature, the reference and the exact amount all match.",
    notes: "Needs a JazzCash merchant account (a personal wallet cannot be used). Optional: JAZZCASH_ENV=production (default sandbox).",
  },
  {
    id: "easypaisa", name: "Easypaisa", checkoutLabel: "Pay with Easypaisa",
    requiredEnv: ["EASYPAISA_STORE_ID", "EASYPAISA_HASH_KEY"], implemented: false,
    detection: "Not built. Easypaisa's automatic notification (IPN) format is only given to merchants, so it cannot be written correctly without their Merchant Integration Guide.",
    notes: "Needs an Easypaisa merchant account. Once you have the guide, send it and this can be built. Until then Easypaisa works only as a manual wallet transfer (see Store settings).",
  },
];

export type GatewayMode = "off" | "testing" | "live";
export interface GatewayState { mode: GatewayMode }
export type GatewaySettings = Partial<Record<GatewayId, GatewayState>>;

export async function getGatewaySettings(db: Queryable): Promise<GatewaySettings> {
  const rows = await db.query<{ value: GatewaySettings }>("select value from store_settings where key = 'gateways'");
  return rows[0]?.value ?? {};
}

export function credentialsPresent(id: GatewayId, env: NodeJS.ProcessEnv = process.env): boolean {
  if (id === "jazzcash") return jazzcashConfig(env) !== null;
  if (id === "safepay") return safepayConfig(env) !== null;
  return false;
}

/** Has this gateway ever delivered a signature-checked notification that was matched to a real payment of ours? */
export async function hasVerifiedPayment(db: Queryable, id: GatewayId): Promise<boolean> {
  return (await db.query("select 1 from payment_events where provider = $1 and verified and outcome = 'paid' limit 1", [id])).length > 0;
}

/** Enabled offline methods (both on unless switched off in Store settings) plus the gateways that pass all four conditions. */
export async function getPaymentOptions(db: Queryable, opts: { env?: NodeJS.ProcessEnv; staff?: boolean } = {}): Promise<PaymentOptions> {
  const env = opts.env ?? process.env;
  const rows = await db.query<{ value: { codEnabled?: boolean; bankTransferEnabled?: boolean } }>("select value from store_settings where key = 'store'");
  const v = rows[0]?.value ?? {};
  const settings = await getGatewaySettings(db);
  const online: GatewayId[] = [];
  for (const g of GATEWAYS) {
    if (!g.implemented || !credentialsPresent(g.id, env)) continue;
    const mode = settings[g.id]?.mode ?? "off";
    if (mode === "live" && (await hasVerifiedPayment(db, g.id))) online.push(g.id);
    else if (mode === "testing" && opts.staff) online.push(g.id); // staff-only, to make the test payment that proves the gateway works
  }
  return { cod: v.codEnabled !== false, bankTransfer: v.bankTransferEnabled !== false, online };
}

export interface GatewayStatus extends Gateway {
  credentialsPresent: boolean;
  mode: GatewayMode;
  verified: boolean;
  /** Where the gateway must be told to send notifications. */
  callbackPath: string | null;
  /** One honest sentence about where this gateway stands. */
  stage: "not_built" | "needs_credentials" | "off" | "testing" | "ready_to_go_live" | "live";
}

export async function gatewayStatuses(db: Queryable, env: NodeJS.ProcessEnv = process.env): Promise<GatewayStatus[]> {
  const settings = await getGatewaySettings(db);
  const out: GatewayStatus[] = [];
  for (const g of GATEWAYS) {
    const creds = credentialsPresent(g.id, env);
    const verified = g.implemented ? await hasVerifiedPayment(db, g.id) : false;
    const mode = settings[g.id]?.mode ?? "off";
    const stage: GatewayStatus["stage"] = !g.implemented ? "not_built" : !creds ? "needs_credentials" : mode === "live" && verified ? "live" : mode === "testing" ? (verified ? "ready_to_go_live" : "testing") : "off";
    out.push({
      ...g, credentialsPresent: creds, mode, verified, stage,
      callbackPath: g.id === "safepay" ? "/api/pay/safepay/webhook" : g.id === "jazzcash" ? "/api/pay/jazzcash/return" : null,
    });
  }
  return out;
}
