import crypto from "node:crypto";

export interface CloudinaryConfig { cloudName: string; apiKey: string; apiSecret: string }

/** Upload is available only when all three settings exist on the server. The secret never leaves the server. */
export function cloudinaryConfig(env: NodeJS.ProcessEnv = process.env): CloudinaryConfig | null {
  // A cloud name is letters, digits, "-" and "_". A pasted "@name", quotes or a trailing slash would make Cloudinary answer "Invalid cloud_name".
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim().replace(/^[@\s"'/]+|[\s"'/]+$/g, "");
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

/** Cloudinary's signature: SHA-1 of the sorted "key=value" pairs joined with "&", followed directly by the API secret. */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const base = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("sha1").update(base + apiSecret).digest("hex");
}

export interface UploadTicket { url: string; fields: Record<string, string> }

/**
 * Everything the browser needs to upload one image straight to Cloudinary. The folder and allowed formats are part of the
 * signature, so a stolen ticket cannot be used to upload other file types or into other folders, and it expires in minutes.
 */
export function uploadTicket(cfg: CloudinaryConfig, folder: string, now = Math.floor(Date.now() / 1000)): UploadTicket {
  const signed = { allowed_formats: "jpg,jpeg,png,webp", folder, timestamp: now };
  return {
    url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/image/upload`,
    fields: { ...Object.fromEntries(Object.entries(signed).map(([k, v]) => [k, String(v)])), api_key: cfg.apiKey, signature: signParams(signed, cfg.apiSecret) },
  };
}

/** Folders customers (not staff) may upload into. */
export const CUSTOMER_UPLOAD_FOLDERS = { receipt: "fixit/receipts", repair: "fixit/repairs" } as const;
export type CustomerUploadKind = keyof typeof CUSTOMER_UPLOAD_FOLDERS;

/**
 * True only for an image that really sits in the shop's own image account, in the folder for this kind of upload.
 * Customers send us links after uploading, so every link is checked here and an address pointing anywhere else
 * (another site, another account, a script) is refused.
 */
export function isCustomerUpload(url: unknown, kind: CustomerUploadKind, cloudName: string | undefined | null): url is string {
  if (typeof url !== "string" || !cloudName || url.length > 300) return false;
  // Compare the address piece by piece instead of with a pattern built from settings, so no character in a setting can change the meaning.
  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length).replace(/^v\d+\//, "");
  const folder = `${CUSTOMER_UPLOAD_FOLDERS[kind]}/`;
  if (!rest.startsWith(folder)) return false;
  return /^[A-Za-z0-9_-]{4,80}\.(?:jpe?g|png|webp)$/.test(rest.slice(folder.length));
}

/** Keeps at most `max` valid, distinct links; throws when any link is not one of our uploads. */
export function cleanCustomerUploads(urls: unknown, kind: CustomerUploadKind, cloudName: string | undefined | null, max = 3): string[] {
  if (urls === undefined || urls === null) return [];
  if (!Array.isArray(urls) || urls.length > max) throw new Error(`You can attach up to ${max} photos.`);
  const out: string[] = [];
  for (const u of urls) {
    if (!isCustomerUpload(u, kind, cloudName)) throw new Error("One of the photos could not be used. Please upload it again.");
    if (!out.includes(u)) out.push(u);
  }
  return out;
}
