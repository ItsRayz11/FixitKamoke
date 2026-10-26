/** Fire-and-forget funnel counter (client side). Sends a name, a path and a phone-width flag. Silent if blocked or offline. */
export type TrackName = "product_view" | "add_to_cart" | "checkout_start" | "listing_view" | "product_click" | "cart_view" | "checkout_error" | "repair_start";
export function track(name: TrackName) {
  try {
    if (navigator.doNotTrack === "1") return;
    const device = window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
    const body = JSON.stringify({ name, path: location.pathname, device });
    if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch { /* analytics must never break the page */ }
}
