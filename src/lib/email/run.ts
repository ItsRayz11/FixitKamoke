import { after } from "next/server";
import { getDb } from "@/lib/db";
import { site } from "@/config/site";
import { getStore } from "@/lib/settings";
import { emailConfig, processOutbox, resendSender, type ProcessResult } from "./outbox";

/** Sends whatever is queued, using the current store settings. Never throws: email problems must not break a customer's order. */
export async function runOutbox(): Promise<ProcessResult> {
  try {
    const cfg = emailConfig();
    const store = await getStore();
    return await processOutbox(await getDb(), { baseUrl: site.baseUrl, whatsappNumber: store.whatsappNumber, contactEmail: store.contactEmail }, cfg ? resendSender(cfg) : null);
  } catch (e) {
    console.error("outbox run failed", e instanceof Error ? e.message : e);
    return { configured: emailConfig() !== null, sent: 0, failed: 0, expired: 0, skipped: 0 };
  }
}

/** Schedules a send after the response has gone out, so the customer never waits on the email provider. */
export function sendQueuedEmailSoon() {
  try {
    after(async () => { await runOutbox(); });
  } catch {
    // Outside a request (tests, scripts): skip. The cron endpoint or the admin button will pick it up.
  }
}
