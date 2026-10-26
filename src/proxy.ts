import { NextResponse, type NextRequest } from "next/server";

/**
 * 1. Maintenance mode: set MAINTENANCE_MODE=1 to show the maintenance page (HTTP 503) to the public.
 *    Staff can still reach /admin.
 * 2. /admin: no session cookie means redirect to login. This is only a cookie-presence check (proxy cannot
 *    hit the database). Every admin page and server action re-validates the session via requireAdmin()/assertAdmin().
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (!isAdmin) {
    if (process.env.MAINTENANCE_MODE === "1" && pathname !== "/maintenance") {
      const res = NextResponse.rewrite(new URL("/maintenance", req.url), { status: 503 });
      res.headers.set("Retry-After", "3600");
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    return NextResponse.next();
  }

  const open = pathname === "/admin/login" || pathname.startsWith("/admin/login/") || pathname === "/admin/setup";
  const res = !open && !req.cookies.get("fixit_admin")
    ? NextResponse.redirect(new URL("/admin/login", req.url))
    : NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

// Everything except Next internals, API routes and static files.
export const config = { matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"] };
