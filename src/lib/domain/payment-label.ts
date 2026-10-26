const PROVIDER: Record<string, string> = { safepay: "Safepay", jazzcash: "JazzCash", easypaisa: "Easypaisa" };

/** How a payment method is named to customers and staff. Online payments name the gateway used. */
export function paymentLabel(method: string, provider?: string | null): string {
  if (method === "cod") return "Cash on delivery";
  if (method === "online") return provider && PROVIDER[provider] ? `Online payment (${PROVIDER[provider]})` : "Online payment";
  return "Bank transfer";
}
