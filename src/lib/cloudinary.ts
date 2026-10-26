import crypto from "node:crypto";

export interface CloudinaryConfig { cloudName: string; apiKey: string; apiSecret: string }

/** Upload is available only when all three settings exist on the server. The secret never leaves the server. */
export function cloudinaryConfig(env: NodeJS.ProcessEnv = process.env): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
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
