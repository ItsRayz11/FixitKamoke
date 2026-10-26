import type { Db } from "@/lib/db";

export const CLIENT_EVENTS = ["product_view", "add_to_cart", "checkout_start", "listing_view", "product_click", "cart_view", "checkout_error", "repair_start"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export type DeviceClass = "mobile" | "desktop";

/**
 * Stores a count-only event: a name, a path and a coarse device class (phone-width or not).
 * No IP address, user agent, cookie id or personal data.
 */
export async function recordEvent(db: Db, name: ClientEvent, path: string, device?: string | null): Promise<void> {
  if (!(CLIENT_EVENTS as readonly string[]).includes(name)) return;
  const clean = path.startsWith("/") ? path.split("?")[0].slice(0, 120) : null;
  const dev = device === "mobile" || device === "desktop" ? device : null;
  await db.query("insert into analytics_events(name, path, device) values ($1,$2,$3)", [name, clean, dev]);
}
