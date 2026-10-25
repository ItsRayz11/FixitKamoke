import type { Db } from "@/lib/db";

export const CLIENT_EVENTS = ["product_view", "add_to_cart", "checkout_start"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

/** Stores a count-only event: a name and a path. No IP address, device details, cookie id or personal data. */
export async function recordEvent(db: Db, name: ClientEvent, path: string): Promise<void> {
  if (!(CLIENT_EVENTS as readonly string[]).includes(name)) return;
  const clean = path.startsWith("/") ? path.split("?")[0].slice(0, 120) : null;
  await db.query("insert into analytics_events(name, path) values ($1,$2)", [name, clean]);
}
