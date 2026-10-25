import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Cache Components is intentionally off: DB-driven pages are dynamic and cached explicitly later. See docs/DECISION_LOG.md.
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Tailwind v4 is compiled by the Turbopack loader the scaffold shipped with. Do not remove.
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
