import crypto from "node:crypto";

/** Hash of a customer's private order link. Kept in its own tiny module so pages that only need it do not pull in order creation. */
export const hashToken = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");
