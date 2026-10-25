import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";

// Test helper: returns the newest queued password-reset token for an email so end-to-end tests do not need a real mailbox.
// Only exists in demo mode and never in production.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_DEMO_MODE !== "1") return new NextResponse("Not found", { status: 404 });
  const email = req.nextUrl.searchParams.get("email") ?? "";
  const rows = await (await getDb()).query<{ payload: { resetToken?: string } }>(
    "select payload from notification_outbox where kind = 'password_reset' and recipient = $1 and status = 'pending' order by created_at desc limit 1", [email.toLowerCase()]);
  return NextResponse.json({ token: rows[0]?.payload.resetToken ?? null });
}
