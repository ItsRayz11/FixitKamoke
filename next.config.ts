import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Production-only hardening. Dev needs eval/websockets for hot reload, so it is not applied there.
// 'unsafe-inline' scripts are required by Next.js bootstrap and JSON-LD blocks; everything else is locked down:
// no foreign scripts, no plugins, no framing by other sites, forms only post back to this site.
const prodHeaders =
  process.env.NODE_ENV === "production"
    ? [
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-src https://www.google.com https://maps.google.com",
            "frame-ancestors 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
          ].join("; "),
        },
      ]
    : [];

const nextConfig: NextConfig = {
  // Cache Components is intentionally off: DB-driven pages are dynamic and cached explicitly later. See docs/DECISION_LOG.md.
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Tailwind v4 is compiled by the Turbopack loader the scaffold shipped with. Do not remove.
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders, ...prodHeaders] }];
  },
};

export default nextConfig;
