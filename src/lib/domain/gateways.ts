/** What a customer sees for each online payment choice. Kept free of server code so checkout pages can import it. */
export const ONLINE_LABEL: Record<string, string> = {
  safepay: "Pay online by card or wallet (Safepay)",
  jazzcash: "Pay with JazzCash",
  easypaisa: "Pay with Easypaisa",
};
export const ONLINE_HINT = "You will be taken to the payment provider's secure page. Your order is marked paid only when they confirm it to us.";
