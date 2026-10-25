import { NextResponse, type NextRequest } from "next/server";

/**
 * First line of defence for /admin: no session cookie means redirect to login.
 * This is only a cookie-presence check (proxy cannot hit the database). Every admin page and
 * server action re-validates the session server-side via requireAdmin()/assertAdmin().
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const open = pathname === "/admin/login" || pathname === "/admin/setup";
  const res = !open && !req.cookies.get("fixit_admin")
    ? NextResponse.redirect(new URL("/admin/login", req.url))
    : NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
