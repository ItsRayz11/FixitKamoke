import { NextResponse } from "next/server";
import { getAdmin, hasRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { activeSubscribers, csvCell } from "@/lib/marketing";
import { site } from "@/config/site";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdmin();
  if (!admin || !hasRole(admin, "manager")) return new NextResponse("Not found", { status: 404 });
  const subs = await activeSubscribers(await getDb());
  await audit(admin.email, "subscribers_exported", "marketing_consent", null, { count: subs.length });
  const base = site.baseUrl.replace(/\/$/, "");
  const lines = ["email,consent_given_at,source,unsubscribe_link", ...subs.map((s) => [s.email, s.consentedAt, s.source, `${base}/unsubscribe?token=${s.unsubscribeToken}`].map(csvCell).join(","))];
  return new NextResponse(lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="fixit-subscribers.csv"', "Cache-Control": "no-store" } });
}
