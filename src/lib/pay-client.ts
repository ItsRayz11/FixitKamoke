import type { StartPayResult } from "@/app/actions/pay";

/** Remembers an order's private link token in this browser, so the payment result page can take the customer back to their order. */
export const tokenKey = (orderNumber: string) => `fixit_order_token_${orderNumber}`;
export function rememberToken(orderNumber: string, token: string) { try { localStorage.setItem(tokenKey(orderNumber), token); } catch { /* private mode: the result page falls back to Track order */ } }
export function recallToken(orderNumber: string): string | null { try { return localStorage.getItem(tokenKey(orderNumber)); } catch { return null; } }

/** Sends the browser to the payment provider: a plain redirect, or a signed form posted to their page. Returns an error message if it could not start. */
export function launchPayment(r: StartPayResult): string | null {
  if (r.kind === "error") return r.message;
  if (r.kind === "redirect") { window.location.assign(r.url); return null; }
  const f = document.createElement("form");
  f.method = "POST"; f.action = r.action; f.style.display = "none";
  for (const [k, v] of Object.entries(r.fields)) { const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.appendChild(i); }
  document.body.appendChild(f);
  f.submit();
  return null;
}
