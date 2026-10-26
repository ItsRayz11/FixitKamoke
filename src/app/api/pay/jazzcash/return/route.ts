import { NextResponse } from "next/server";
import { site } from "@/config/site";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jazzcashConfig, readJazzcashResult } from "@/lib/payments/jazzcash";
import { recordEvent, settlePayment } from "@/lib/payments/settle";

export const dynamic = "force-dynamic";

const back = (path: string) => NextResponse.redirect(`${site.baseUrl}${path}`, 303);

/**
 * JazzCash posts the signed result here (the customer's browser carries it back, and the same address can be set as JazzCash's server
 * notification). The signature covers every field, so the result is trusted only if it verifies; the page shown afterwards reads
 * the real status from our own records and never from the address bar.
 */
export async function POST(req: Request) {
  const cfg = jazzcashConfig();
  if (!cfg) return back("/pay/result?error=1");
  const posted: Record<string, string> = {};
  try {
    for (const [k, v] of (await req.formData()).entries()) if (typeof v === "string" && k.length < 60 && v.length < 500) posted[k] = v;
  } catch { return back("/pay/result?error=1"); }

  const db = await getDb();
  const r = readJazzcashResult(cfg, posted);
  if (!r.verified) {
    if (rateLimit("pay-bad-signature:jazzcash", 30, 60 * 60_000)) await recordEvent(db, "jazzcash", false, "bad_signature", r.reason, null);
    return back("/pay/result?error=1");
  }
  await settlePayment(db, { provider: "jazzcash", identifiers: [r.reference], amountPkr: r.amountPkr, requireAmount: true, paid: r.paid, providerRef: r.providerRef });
  return back(`/pay/result?ref=${encodeURIComponent(r.reference)}`);
}

/** Some browsers return with a GET. Nothing in it is trusted: it only chooses which of our own records to show. */
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("pp_TxnRefNo");
  return back(ref && /^[A-Za-z0-9]{8,30}$/.test(ref) ? `/pay/result?ref=${ref}` : "/pay/result?error=1");
}
