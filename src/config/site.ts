/**
 * Central business configuration. Nothing here is invented: every owner-specific value is read from
 * environment variables and is `null` until the owner supplies it. Items that are null render as
 * "not yet configured" and are listed in docs/LAUNCH_BLOCKERS.md.
 */
const env = (k: string) => {
  const v = process.env[k]?.trim();
  return v ? v : null;
};

export const site = {
  name: "Fixit",
  tagline: "Mobile repair and accessories in Kamoki",
  founder: "Ali Hassan",
  currency: "PKR",
  // SITE_URL is read at run time; NEXT_PUBLIC_SITE_URL is baked in at build time. Prefer SITE_URL.
  baseUrl: (env("SITE_URL") ?? env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
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
