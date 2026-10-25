import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runOutbox } from "@/lib/email/run";

/**
 * Sends queued emails. Call it from a scheduler (for example Vercel Cron) with `Authorization: Bearer <CRON_SECRET>`.
 * Without a configured secret the endpoint is disabled, so it can never be triggered anonymously.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return new NextResponse("Not found", { status: 404 });
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(given), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return new NextResponse("Unauthorized", { status: 401 });
  const r = await runOutbox();
  return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
}
