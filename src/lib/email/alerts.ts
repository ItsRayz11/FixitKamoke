import type { Queryable } from "@/lib/db";

export type StaffAlertKind = "order" | "repair" | "message";

/**
 * Queues an email telling the shop that something needs attention. Goes to the contact email set in Store settings
 * (and only if "email me about new orders, repairs and messages" is on). The text carries a reference and a short
 * summary only, never a customer's phone number or address. Safe to call inside a transaction.
 */
export async function queueStaffAlert(q: Queryable, kind: StaffAlertKind, ref: string, summary: string): Promise<void> {
  const rows = await q.query<{ value: { contactEmail?: string | null; notifyStaffByEmail?: boolean } }>("select value from store_settings where key = 'store'");
  const v = rows[0]?.value ?? {};
  const to = v.contactEmail?.trim();
  if (!to || v.notifyStaffByEmail === false || !/^\S+@\S+\.\S+$/.test(to)) return;
  await q.query(
    "insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('staff_alert', $1, $2, $3) on conflict (dedupe_key) do nothing",
    [to, JSON.stringify({ kind, ref, summary: summary.slice(0, 200) }), `staff_alert:${kind}:${ref}`],
  );
}
