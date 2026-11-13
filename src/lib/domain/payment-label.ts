const PROVIDER: Record<string, string> = { safepay: "Safepay", jazzcash: "JazzCash", easypaisa: "Easypaisa" };

/** Ways to pay by hand: the customer sends money, staff check it arrived, then mark the order paid. */
export const MANUAL_METHODS = ["bank_transfer", "jazzcash_manual", "easypaisa_manual"] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];
export const isManualMethod = (m: string): m is ManualMethod => (MANUAL_METHODS as readonly string[]).includes(m);

/** How a payment method is named to customers and staff. Online payments name the gateway used. */
export function paymentLabel(method: string, provider?: string | null): string {
  if (method === "cod") return "Cash on delivery";
  if (method === "online") return provider && PROVIDER[provider] ? `Online payment (${PROVIDER[provider]})` : "Online payment";
  if (method === "jazzcash_manual") return "JazzCash transfer";
  if (method === "easypaisa_manual") return "Easypaisa transfer";
  return "Bank transfer";
}
