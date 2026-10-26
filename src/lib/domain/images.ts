/**
 * Cloudinary can resize and recompress on the fly by adding a transformation to the address. This inserts
 * `f_auto,q_auto,w_<width>` (best format for the visitor's browser, sensible quality, no larger than needed).
 * Any other address, and any Cloudinary address that already carries a transformation, is returned untouched,
 * so photos hosted elsewhere keep working exactly as before. Safe to use in client components.
 */
export function optimizeImageUrl(url: string, width = 800): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url);
  if (!m) return url;
  const w = Math.max(100, Math.min(2400, Math.round(width)));
  return `${m[1]}f_auto,q_auto,w_${w}/${m[2]}`;
}

/** True for the https address of an image the owner could have uploaded (used to validate pasted or uploaded links). */
export function isHttpsUrl(s: string): boolean {
  try { return new URL(s).protocol === "https:"; } catch { return false; }
}
