import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { runRecurring } from "@/lib/finance/expenses";
import { todayPk } from "@/lib/finance/reports";

/**
 * Posts this month's recurring expenses that have come due. Same protection as /api/cron/email: needs CRON_SECRET and a bearer header.
 * Safe to call as often as you like: each recurring expense posts once per month.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return new NextResponse("Not found", { status: 404 });
  const a = Buffer.from(req.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new NextResponse("Unauthorized", { status: 401 });
  const db = await getDb();
  const today = await todayPk(db);
  const posted = await runRecurring(db, today.slice(0, 7), today, "system:cron");
  return NextResponse.json({ posted }, { headers: { "Cache-Control": "no-store" } });
}
