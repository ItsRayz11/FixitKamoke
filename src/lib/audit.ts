import type { Queryable } from "@/lib/db";
import { getDb } from "@/lib/db";

/** Records a sensitive admin action. Pass `q` to write inside the same transaction as the change. */
export async function audit(actor: string, action: string, entity: string, entityId: string | null, detail: Record<string, unknown> = {}, q?: Queryable) {
  const db = q ?? (await getDb());
  await db.query("insert into audit_events(actor, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5)", [actor, action, entity, entityId, JSON.stringify(detail)]);
}
