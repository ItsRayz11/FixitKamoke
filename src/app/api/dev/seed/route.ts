import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedDemo } from "@/lib/dev/seed";

// Development/test helper only. Returns 404 in production and unless demo mode is explicitly enabled.
export async function POST() {
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_DEMO_MODE !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json(await seedDemo(await getDb()));
}
