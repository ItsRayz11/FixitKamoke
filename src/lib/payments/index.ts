import type { Queryable } from "@/lib/db";

/**
 * Payment methods. Offline methods (cash on delivery, bank transfer) are real and fully working.
 * Online gateways are registered here so the owner can see exactly what is missing, but none is implemented:
 * a gateway must never appear at checkout until its merchant credentials, signed callback verification and an
 * end-to-end sandbox test exist. There is no simulated or "demo" payment.
 */
export type OfflineMethod = "cod" | "bank_transfer";

export interface PaymentOptions {
  cod: boolean;
  bankTransfer: boolean;
}

export const OFFLINE_LABEL: Record<OfflineMethod, string> = { cod: "Cash on delivery", bank_transfer: "Bank transfer" };

/** Enabled offline methods. Both are on unless the owner switched one off in Store settings. */
export async function getPaymentOptions(db: Queryable): Promise<PaymentOptions> {
  const rows = await db.query<{ value: { codEnabled?: boolean; bankTransferEnabled?: boolean } }>("select value from store_settings where key = 'store'");
  const v = rows[0]?.value ?? {};
  return { cod: v.codEnabled !== false, bankTransfer: v.bankTransferEnabled !== false };
}

export interface Gateway {
  id: string;
  name: string;
  /** Environment variables the integration will need. */
  requiredEnv: string[];
  /** True only once the adapter, signed-callback verification and a passing sandbox test exist. */
  implemented: boolean;
  notes: string;
}

export const GATEWAYS: Gateway[] = [
  { id: "jazzcash", name: "JazzCash", requiredEnv: ["JAZZCASH_MERCHANT_ID", "JAZZCASH_PASSWORD", "JAZZCASH_INTEGRITY_SALT"], implemented: false, notes: "Needs a JazzCash merchant account and sandbox credentials from JazzCash." },
  { id: "easypaisa", name: "Easypaisa", requiredEnv: ["EASYPAISA_STORE_ID", "EASYPAISA_HASH_KEY"], implemented: false, notes: "Needs an Easypaisa merchant account and sandbox credentials from Easypaisa." },
  { id: "safepay", name: "Safepay (cards)", requiredEnv: ["SAFEPAY_API_KEY", "SAFEPAY_SECRET_KEY", "SAFEPAY_WEBHOOK_SECRET"], implemented: false, notes: "Needs a Safepay merchant account. Card details must only ever be entered on the provider's own page." },
];

export interface GatewayStatus extends Gateway { credentialsPresent: boolean; available: false; reason: string }

/** Honest status for each online gateway. `available` is always false until `implemented` is true. */
export function gatewayStatuses(env: NodeJS.ProcessEnv = process.env): GatewayStatus[] {
  return GATEWAYS.map((g) => {
    const credentialsPresent = g.requiredEnv.every((k) => Boolean(env[k]?.trim()));
    return {
      ...g, credentialsPresent, available: false as const,
      reason: !g.implemented
        ? `Not connected. The integration, signed callback verification and an end-to-end sandbox test are not built.${credentialsPresent ? " Credentials are present but unused." : ` Needs: ${g.requiredEnv.join(", ")}.`}`
        : "Not enabled.",
    };
  });
}
