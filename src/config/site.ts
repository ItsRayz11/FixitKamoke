/**
 * Central business configuration. Nothing here is invented: every owner-specific value is read from
 * environment variables and is `null` until the owner supplies it. Items that are null render as
 * "not yet configured" and are listed in docs/LAUNCH_BLOCKERS.md.
 */
const env = (k: string) => {
  const v = process.env[k]?.trim();
  return v ? v : null;
};

/** The shop's real public address. Used on production unless SITE_URL overrides it. */
export const PRODUCTION_URL = "https://fixitkamoke.xyz";

function vercelUrl(): string | null {
  if (process.env.VERCEL_ENV === "production") return PRODUCTION_URL;
  const host = process.env.VERCEL_ENV === "preview" ? env("VERCEL_URL") : null;
  return host ? `https://${host.replace(/^https?:\/\//, "")}` : null;
}

export const site = {
  name: "Fixit",
  tagline: "Mobile repair and accessories in Kamoki",
  founder: "Ali Hassan",
  currency: "PKR",
  // SITE_URL is read at run time; NEXT_PUBLIC_SITE_URL is baked in at build time. Prefer SITE_URL.
  // Fallbacks on Vercel, so links, emails and payment callbacks never point at localhost when SITE_URL was forgotten:
  // production uses fixitkamoke.xyz; a preview uses its own address. Local development still gets localhost.
  baseUrl: (env("SITE_URL") ?? env("NEXT_PUBLIC_SITE_URL") ?? vercelUrl() ?? "http://localhost:3000").replace(/\/$/, ""),
  /** E.164 digits only, no plus sign, e.g. 923001234567. Owner must supply. */
  whatsappNumber: env("NEXT_PUBLIC_WHATSAPP_NUMBER")?.replace(/\D/g, "") ?? null,
  address: env("NEXT_PUBLIC_SHOP_ADDRESS"),
  mapsUrl: env("NEXT_PUBLIC_MAPS_URL"),
  mapsEmbedUrl: env("NEXT_PUBLIC_MAPS_EMBED_URL"),
  openingHours: env("NEXT_PUBLIC_OPENING_HOURS"),
  contactEmail: env("NEXT_PUBLIC_CONTACT_EMAIL"),
  social: {
    facebook: env("NEXT_PUBLIC_FACEBOOK_URL"),
    instagram: env("NEXT_PUBLIC_INSTAGRAM_URL"),
    tiktok: env("NEXT_PUBLIC_TIKTOK_URL"),
    youtube: env("NEXT_PUBLIC_YOUTUBE_URL"),
  },
  /** Show the demo-data banner when running with seeded demo products. */
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "1",
} as const;
