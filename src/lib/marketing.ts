import { z } from "zod";
import type { Db } from "@/lib/db";

export class MarketingError extends Error {}

const emailSchema = z.string().trim().toLowerCase().email("Please enter a valid email address").max(200);

/**
 * Records explicit marketing consent. The caller must have shown an unticked consent checkbox and only calls this when it was ticked.
 * Re-subscribing after an unsubscribe is allowed and records fresh consent.
 */
export async function subscribe(db: Db, email: string, source: string, consented: boolean): Promise<void> {
  if (!consented) throw new MarketingError("Please tick the box to agree to receive emails.");
  const e = emailSchema.safeParse(email);
  if (!e.success) throw new MarketingError(e.error.issues[0].message);
  await db.tx(async (q) => {
    await q.query(
      `insert into marketing_consent(email, source) values ($1,$2)
       on conflict (email) do update set unsubscribed_at = null, consented_at = case when marketing_consent.unsubscribed_at is not null then now() else marketing_consent.consented_at end`,
      [e.data, source.slice(0, 40)]);
    await q.query("insert into analytics_events(name, path) values ('newsletter_signup', $1)", [source.slice(0, 40)]);
  });
}

export async function unsubscribe(db: Db, token: string): Promise<boolean> {
  if (!/^[0-9a-f]{32}$/.test(token)) return false;
  const r = await db.query("update marketing_consent set unsubscribed_at = coalesce(unsubscribed_at, now()) where unsubscribe_token = $1 returning id", [token]);
  return r.length > 0;
}

export interface Subscriber { email: string; consentedAt: string; source: string; unsubscribeToken: string }

/** Only people who consented and have not unsubscribed. Order customers are NOT included unless they ticked the box. */
export async function activeSubscribers(db: Db): Promise<Subscriber[]> {
  const r = await db.query<{ email: string; consented_at: Date | string; source: string; unsubscribe_token: string }>(
    "select email, consented_at, source, unsubscribe_token from marketing_consent where unsubscribed_at is null order by consented_at desc");
  return r.map((x) => ({ email: x.email, consentedAt: new Date(x.consented_at).toISOString(), source: x.source, unsubscribeToken: x.unsubscribe_token }));
}

/** Guards against spreadsheet formula injection when the list is exported. */
export const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
