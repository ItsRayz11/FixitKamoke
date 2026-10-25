/** Fire-and-forget funnel counter (client side). Sends a name and a path only. Silent if blocked or offline. */
export function track(name: "product_view" | "add_to_cart" | "checkout_start") {
  try {
    if (navigator.doNotTrack === "1") return;
    const body = JSON.stringify({ name, path: location.pathname });
    if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch { /* analytics must never break the page */ }
}
