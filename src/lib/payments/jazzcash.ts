import crypto from "node:crypto";

/**
 * JazzCash "page redirection": we post a signed form to JazzCash's hosted payment page, the customer pays there, and
 * JazzCash posts a signed result back to our return address. Every field is covered by an HMAC-SHA256 signature made with
 * the merchant's Integrity Salt, so a result that was not made by JazzCash (or was altered) fails the check.
 *
 * Written from JazzCash's published sample integrations. It has NOT been run against a live JazzCash account from here:
 * the owner's sandbox test (Admin -> Payments) is what proves it, and the gateway stays off until that has passed.
 */
export interface JazzcashConfig { merchantId: string; password: string; salt: string; env: "sandbox" | "production" }

export function jazzcashConfig(env: NodeJS.ProcessEnv = process.env): JazzcashConfig | null {
  const merchantId = env.JAZZCASH_MERCHANT_ID?.trim(), password = env.JAZZCASH_PASSWORD?.trim(), salt = env.JAZZCASH_INTEGRITY_SALT?.trim();
  if (!merchantId || !password || !salt) return null;
  return { merchantId, password, salt, env: env.JAZZCASH_ENV?.trim() === "production" ? "production" : "sandbox" };
}

export const JAZZCASH_HOSTS = { sandbox: "https://sandbox.jazzcash.com.pk", production: "https://payments.jazzcash.com.pk" } as const;
const PATH = "/CustomerPortal/transactionmanagement/merchantform/";

/** HMAC-SHA256, keyed with the salt, over  salt&value1&value2…  where the values are the non-empty pp_ / ppmpf_ fields in alphabetical order of their names. */
export function jazzcashHash(fields: Record<string, string>, salt: string): string {
  const parts = Object.keys(fields)
    .filter((k) => k !== "pp_SecureHash" && /^(pp_|ppmpf_)/.test(k) && fields[k] !== "" && fields[k] !== undefined)
    .sort()
    .map((k) => fields[k]);
  return crypto.createHmac("sha256", salt).update([salt, ...parts].join("&")).digest("hex");
}

const pad = (n: number) => String(n).padStart(2, "0");
/** JazzCash wants Pakistan time (UTC+5) as yyyyMMddHHmmss. */
export function jazzcashTime(d: Date): string {
  const p = new Date(d.getTime() + 5 * 3600_000);
  return `${p.getUTCFullYear()}${pad(p.getUTCMonth() + 1)}${pad(p.getUTCDate())}${pad(p.getUTCHours())}${pad(p.getUTCMinutes())}${pad(p.getUTCSeconds())}`;
}

export interface JazzcashRequest { reference: string; amountPkr: number; orderNumber: string; returnUrl: string; now?: Date }

/** The signed form the browser posts to JazzCash. Amount is in paisa (rupees x 100). */
export function buildJazzcashForm(cfg: JazzcashConfig, r: JazzcashRequest): { action: string; fields: Record<string, string> } {
  const now = r.now ?? new Date();
  const fields: Record<string, string> = {
    pp_Version: "1.1", pp_TxnType: "", pp_Language: "EN", pp_MerchantID: cfg.merchantId, pp_SubMerchantID: "", pp_Password: cfg.password,
    pp_BankID: "TBANK", pp_ProductID: "RETL", pp_TxnRefNo: r.reference, pp_Amount: String(r.amountPkr * 100), pp_TxnCurrency: "PKR",
    pp_TxnDateTime: jazzcashTime(now), pp_BillReference: r.orderNumber.replace(/[^A-Za-z0-9]/g, ""), pp_Description: `Fixit order ${r.orderNumber}`,
    pp_TxnExpiryDateTime: jazzcashTime(new Date(now.getTime() + 60 * 60_000)), pp_ReturnURL: r.returnUrl,
    ppmpf_1: "", ppmpf_2: "", ppmpf_3: "", ppmpf_4: "", ppmpf_5: "",
  };
  fields.pp_SecureHash = jazzcashHash(fields, cfg.salt);
  return { action: `${JAZZCASH_HOSTS[cfg.env]}${PATH}`, fields };
}

export type JazzcashResult =
  | { verified: false; reason: string }
  | { verified: true; reference: string; amountPkr: number | null; paid: boolean; code: string; providerRef: string | null };

/** Checks the signature on a result posted back by JazzCash and reads the outcome. A result that fails the signature is never trusted. */
export function readJazzcashResult(cfg: JazzcashConfig, posted: Record<string, string>): JazzcashResult {
  const given = (posted.pp_SecureHash ?? "").trim().toLowerCase();
  if (!given) return { verified: false, reason: "no signature on the result" };
  const want = jazzcashHash(posted, cfg.salt);
  const a = Buffer.from(given), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { verified: false, reason: "signature does not match (wrong Integrity Salt, or the result was altered)" };
  const reference = posted.pp_TxnRefNo ?? "";
  if (!reference) return { verified: false, reason: "signed result has no reference" };
  const paisa = Number(posted.pp_Amount);
  const code = posted.pp_ResponseCode ?? "";
  return {
    verified: true, reference, code,
    amountPkr: Number.isFinite(paisa) && paisa % 100 === 0 ? paisa / 100 : null,
    paid: code === "000",
    providerRef: posted.pp_RetreivalReferenceNo || posted.pp_AuthCode || null,
  };
}
