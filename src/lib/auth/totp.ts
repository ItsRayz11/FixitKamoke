import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32 text");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new random 160-bit secret, as the base32 text authenticator apps expect. */
export const newSecret = () => base32Encode(crypto.randomBytes(20));

/** RFC 4226 one-time code for a counter (SHA-1, 6 digits: what every authenticator app uses). */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secret).update(msg).digest();
  const o = h[19] & 0xf;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * Checks a typed code. Accepts the current 30-second step and one either side (phone clocks drift), and refuses any step
 * that is not newer than `lastStep`, so a code that was already used (or shoulder-surfed) cannot be replayed.
 * Returns the matching step, or null.
 */
export function verifyTotp(secretBase32: string, input: string, lastStep: number | null, nowMs = Date.now()): number | null {
  const code = input.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const now = stepAt(nowMs);
  let match: number | null = null;
  for (const s of [now - 1, now, now + 1]) {
    const ok = crypto.timingSafeEqual(Buffer.from(hotp(secret, s)), Buffer.from(code));
    if (ok && (lastStep === null || s > lastStep)) match = s;
  }
  return match;
}

export function otpauthUri(secret: string, account: string, issuer = "Fixit"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

// ---- Encryption of the secret at rest ----

function key(): Buffer | null {
  const k = process.env.TWO_FACTOR_KEY?.trim();
  return k && k.length >= 32 ? crypto.createHash("sha256").update(k).digest() : null;
}

/** True when the server has a TWO_FACTOR_KEY, which is required before anyone can turn two-step sign-in on. */
export const twoFactorConfigured = () => key() !== null;

export function seal(plain: string): string {
  const k = key();
  if (!k) throw new Error("TWO_FACTOR_KEY is not set");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

/** Returns null (never throws) for a wrong key or tampered value. */
export function unseal(sealed: string): string | null {
  const k = key();
  const [v, iv, tag, ct] = sealed.split(".");
  if (!k || v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---- Recovery codes ----

/** Ten single-use codes, like "K7QM2-X9PDA". Shown once; only hashes are stored. */
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(crypto.randomBytes(7)).slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const normaliseRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z2-7]/g, "");
export const hashRecovery = (s: string) => crypto.createHash("sha256").update(normaliseRecovery(s)).digest("hex");
