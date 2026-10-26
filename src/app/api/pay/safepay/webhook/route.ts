import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { readSafepayEvent, safepayConfig, verifySafepaySignature } from "@/lib/payments/safepay";
import { recordEvent, settlePayment } from "@/lib/payments/settle";

export const dynamic = "force-dynamic";

/**
 * Safepay tells us the result of a payment here. Nothing in the body is believed until the signature over the exact bytes
 * received checks out against our webhook secret. A verified event for something that is not one of our payments changes nothing.
 * Always answers 2xx to a verified event so Safepay does not keep retrying one we have already understood.
 */
export async function POST(req: Request) {
  const cfg = safepayConfig();
  if (!cfg) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const db = await getDb();

  if (!verifySafepaySignature(raw, req.headers.get("x-sfpy-signature"), cfg.webhookSecret)) {
    // Logged so the owner can see a misconfigured secret during the sandbox test, but capped so strangers cannot fill the log.
    if (rateLimit("pay-bad-signature:safepay", 30, 60 * 60_000)) await recordEvent(db, "safepay", false, "bad_signature", "signature missing or does not match SAFEPAY_WEBHOOK_SECRET", null);
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    await recordEvent(db, "safepay", true, "ignored", "signed body is not JSON", null);
    return NextResponse.json({ ok: true });
  }
  const ev = readSafepayEvent(body);
  if (ev.state === "other") {
    await recordEvent(db, "safepay", true, "ignored", "event type is not a payment result", null);
    return NextResponse.json({ ok: true });
  }
  const scale = process.env.SAFEPAY_AMOUNT_UNIT === "paisa" ? 100 : 1;
  const distinct = [...new Set(ev.amounts.map((a) => Math.round((a / scale) * 100) / 100))];
  const amountPkr = distinct.length === 1 && Number.isInteger(distinct[0]) ? distinct[0] : null;
  const identifiers = ev.strings.filter((s) => s.length >= 8 && s.length <= 100).slice(0, 100);
  const r = await settlePayment(db, { provider: "safepay", identifiers, amountPkr, requireAmount: true, paid: ev.state === "paid", providerRef: null });
  return NextResponse.json({ ok: true, outcome: r.outcome });
}
