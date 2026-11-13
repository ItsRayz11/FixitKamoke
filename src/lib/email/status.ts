import { z } from "zod";
import type { Queryable } from "@/lib/db";
import type { EmailConfig, SendFn } from "./outbox";

/**
 * What we KNOW about email, not what we hope. "Connected" is only ever shown after a real test message was accepted by the
 * provider; having the settings present is just "ready to test".
 */
export interface EmailTestRecord { at: string; ok: boolean; error: string | null; to: string }

export type EmailConnection = "setup_required" | "untested" | "connected" | "error";

export async function getLastTest(db: Queryable): Promise<EmailTestRecord | null> {
  const r = await db.query<{ value: EmailTestRecord }>("select value from store_settings where key = 'email_test'");
  return r[0]?.value ?? null;
}

export function connectionState(cfg: EmailConfig | null, last: EmailTestRecord | null): EmailConnection {
  if (!cfg) return "setup_required";
  if (!last) return "untested";
  return last.ok ? "connected" : "error";
}

export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

const addressSchema = z.string().trim().toLowerCase().email().max(200);

/** Sends one real test message and records whether the provider accepted it. Never throws. Contains no secrets in what it stores. */
export async function runEmailTest(db: Queryable, cfg: EmailConfig | null, send: SendFn | null, to: string, shopName = "Fixit"): Promise<EmailTestRecord> {
  const at = new Date().toISOString();
  const addr = addressSchema.safeParse(to);
  let rec: EmailTestRecord;
  if (!cfg || !send) rec = { at, ok: false, error: "Email is not set up on the server yet.", to: "" };
  else if (!addr.success) rec = { at, ok: false, error: "That is not a valid email address.", to: "" };
  else {
    try {
      await send({
        to: addr.data, subject: `${shopName} test email`,
        html: `<p>This is a test message from ${shopName}. If you can read it, email sending works.</p>`,
        text: `This is a test message from ${shopName}. If you can read it, email sending works.`,
        idempotencyKey: `email-test-${at}`,
      });
      rec = { at, ok: true, error: null, to: maskEmail(addr.data) };
    } catch (e) {
      rec = { at, ok: false, error: (e instanceof Error ? e.message : "unknown error").slice(0, 300), to: maskEmail(addr.data) };
    }
  }
  await db.query(
    `insert into store_settings(key, value) values ('email_test', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(rec)]);
  return rec;
}
