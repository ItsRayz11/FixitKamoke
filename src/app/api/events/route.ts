import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { CLIENT_EVENTS, recordEvent, type ClientEvent } from "@/lib/events";
import { rateLimit } from "@/lib/rate-limit";

/** Count-only funnel events. Honours Do Not Track and Global Privacy Control by storing nothing. */
export async function POST(req: NextRequest) {
  if (req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") return new NextResponse(null, { status: 204 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`events:${ip}`, 120, 10 * 60_000)) return new NextResponse(null, { status: 429 });
  let body: { name?: unknown; path?: unknown };
  try { body = await req.json(); } catch { return new NextResponse(null, { status: 400 }); }
  if (typeof body.name !== "string" || typeof body.path !== "string" || !(CLIENT_EVENTS as readonly string[]).includes(body.name)) return new NextResponse(null, { status: 400 });
  await recordEvent(await getDb(), body.name as ClientEvent, body.path);
  return new NextResponse(null, { status: 204 });
}
