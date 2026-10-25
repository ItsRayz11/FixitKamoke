import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export const dynamic = "force-dynamic"; // read SITE_URL at run time, not when the site was built

// Demo and staging builds must never be indexed.
export default function robots(): MetadataRoute.Robots {
  if (site.demoMode) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/cart", "/checkout", "/order/", "/track", "/account", "/repairs/status/", "/repairs/track", "/unsubscribe", "/maintenance"] },
    sitemap: `${site.baseUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
