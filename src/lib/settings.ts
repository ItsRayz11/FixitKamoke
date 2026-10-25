import { getDb } from "@/lib/db";
import { site } from "@/config/site";
import { z } from "zod";

/**
 * Owner-editable store settings. Stored in store_settings (key 'store'), falling back to environment values,
 * and finally to null. Nothing is invented: unset values stay null and the UI says "to be confirmed".
 */
export const storeSettingsSchema = z.object({
  whatsappNumber: z.string().trim().regex(/^\d{10,15}$/, "Digits only, with country code, e.g. 923001234567").nullable(),
  address: z.string().trim().max(300).nullable(),
  mapsUrl: z.string().trim().url().max(500).nullable(),
  mapsEmbedUrl: z.string().trim().url().max(800).nullable(),
  openingHours: z.string().trim().max(200).nullable(),
  contactEmail: z.string().trim().email().nullable(),
  facebook: z.string().trim().url().nullable(),
  instagram: z.string().trim().url().nullable(),
  tiktok: z.string().trim().url().nullable(),
  youtube: z.string().trim().url().nullable(),
  showFounder: z.boolean(),
  founderMessage: z.string().trim().max(800).nullable(),
  founderPhotoUrl: z.string().trim().url().nullable(),
  bankName: z.string().trim().max(100).nullable(),
  bankAccountTitle: z.string().trim().max(100).nullable(),
  bankAccountNumber: z.string().trim().max(60).nullable(),
  heroTitle: z.string().trim().max(120).nullable(),
  heroSubtitle: z.string().trim().max(300).nullable(),
  announcement: z.string().trim().max(160).nullable(),
  policiesApproved: z.boolean(),
  /** Repair types the shop really offers. Empty means "tell us the problem", never a guessed list. */
  repairServices: z.array(z.string().trim().min(1).max(80)).max(30),
  codEnabled: z.boolean(),
  bankTransferEnabled: z.boolean(),
  /** Owner-written specifics for policy pages (Markdown). Null shows "to be confirmed". */
  shippingTerms: z.string().trim().max(4000).nullable(),
  returnsTerms: z.string().trim().max(4000).nullable(),
  warrantyTerms: z.string().trim().max(4000).nullable(),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const defaultSettings = (): StoreSettings => ({
  whatsappNumber: site.whatsappNumber,
  address: site.address,
  mapsUrl: site.mapsUrl,
  mapsEmbedUrl: site.mapsEmbedUrl,
  openingHours: site.openingHours,
  contactEmail: site.contactEmail,
  facebook: site.social.facebook,
  instagram: site.social.instagram,
  tiktok: site.social.tiktok,
  youtube: site.social.youtube,
  showFounder: false,
  founderMessage: null,
  founderPhotoUrl: null,
  bankName: null,
  bankAccountTitle: null,
  bankAccountNumber: null,
  heroTitle: null,
  heroSubtitle: null,
  announcement: null,
  policiesApproved: false,
  repairServices: [],
  codEnabled: true,
  bankTransferEnabled: true,
  shippingTerms: null,
  returnsTerms: null,
  warrantyTerms: null,
});

export async function getStore(): Promise<StoreSettings> {
  const base = defaultSettings();
  try {
    const rows = await (await getDb()).query<{ value: Partial<StoreSettings> }>("select value from store_settings where key = 'store'");
    const stored = rows[0]?.value ?? {};
    return { ...base, ...Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined)) } as StoreSettings;
  } catch {
    return base;
  }
}

export async function saveStore(next: StoreSettings): Promise<void> {
  const db = await getDb();
  await db.query(
    `insert into store_settings(key, value) values ('store', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(next)],
  );
}
