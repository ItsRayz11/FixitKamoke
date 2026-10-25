/**
 * The visitor's IP address, for rate limiting only.
 *
 * `X-Forwarded-For` is a list: each proxy appends the address it received the request from. Anything to the LEFT can be
 * typed by the visitor, so reading the first value lets an attacker dodge limits by sending a different fake address
 * each time. The LAST value is the one added by the proxy in front of this app (Vercel, nginx, Cloudflare, ...) and
 * cannot be forged by the visitor. If the app is exposed with no proxy at all, no header can be trusted; run it behind one.
 */
export function clientIp(get: (name: string) => string | null | undefined): string {
  const real = get("x-real-ip")?.trim();
  const list = get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return real || list[list.length - 1] || "unknown";
}
