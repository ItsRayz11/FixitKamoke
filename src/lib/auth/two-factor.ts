import crypto from "node:crypto";
import type { Db } from "@/lib/db";
import { hashRecovery, newRecoveryCodes, newSecret, normaliseRecovery, seal, twoFactorConfigured, unseal, verifyTotp } from "./totp";

export class TwoFactorError extends Error {}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const CHALLENGE_TTL_MS = 5 * 60_000;
export const MAX_CHALLENGE_ATTEMPTS = 5;

export interface TwoFactorState { available: boolean; enabledAt: string | null; pending: boolean; recoveryLeft: number }

export async function twoFactorState(db: Db, userId: string): Promise<TwoFactorState> {
  const u = (await db.query<{ totp_secret: string | null; totp_enabled_at: Date | string | null }>("select totp_secret, totp_enabled_at from admin_users where id = $1", [userId]))[0];
  const left = (await db.query<{ n: number }>("select count(*)::int as n from admin_recovery_codes where user_id = $1 and used_at is null", [userId]))[0]?.n ?? 0;
  return {
    available: twoFactorConfigured(),
    enabledAt: u?.totp_enabled_at ? new Date(u.totp_enabled_at).toISOString() : null,
    pending: !!u?.totp_secret && !u.totp_enabled_at,
    recoveryLeft: left,
  };
}

/** Starts (or restarts) setup with a fresh secret. Nothing is enforced until the first code is confirmed. */
export async function beginSetup(db: Db, userId: string): Promise<string> {
  if (!twoFactorConfigured()) throw new TwoFactorError("Two-step sign-in is not available yet: the server needs a TWO_FACTOR_KEY setting.");
  const state = await twoFactorState(db, userId);
  if (state.enabledAt) throw new TwoFactorError("Two-step sign-in is already on for this account.");
  const secret = newSecret();
  await db.query("update admin_users set totp_secret = $2, totp_enabled_at = null, totp_last_step = null where id = $1", [userId, seal(secret)]);
  return secret;
}

/** The secret of a setup that has been started but not confirmed, so the page can show it again after a refresh. */
export async function pendingSecret(db: Db, userId: string): Promise<string | null> {
  const u = (await db.query<{ totp_secret: string | null }>("select totp_secret from admin_users where id = $1 and totp_enabled_at is null", [userId]))[0];
  return u?.totp_secret ? unseal(u.totp_secret) : null;
}

/** Confirms the first code from the app, switches two-step sign-in on and returns the recovery codes (shown once). Null if the code is wrong. */
export async function confirmSetup(db: Db, userId: string, code: string): Promise<string[] | null> {
  const secret = await pendingSecret(db, userId);
  if (!secret) throw new TwoFactorError("Start the setup again to get a new key.");
  const step = verifyTotp(secret, code, null);
  if (step === null) return null;
  const codes = newRecoveryCodes();
  await db.tx(async (q) => {
    await q.query("update admin_users set totp_enabled_at = now(), totp_last_step = $2 where id = $1", [userId, step]);
    await q.query("delete from admin_recovery_codes where user_id = $1", [userId]);
    for (const c of codes) await q.query("insert into admin_recovery_codes(user_id, code_hash) values ($1,$2)", [userId, hashRecovery(c)]);
  });
  return codes;
}

/** Turns two-step sign-in off and forgets the secret and recovery codes. Callers must have checked who is asking. */
export async function disableTwoFactor(db: Db, userId: string): Promise<void> {
  await db.tx(async (q) => {
    await q.query("update admin_users set totp_secret = null, totp_enabled_at = null, totp_last_step = null where id = $1", [userId]);
    await q.query("delete from admin_recovery_codes where user_id = $1", [userId]);
    await q.query("delete from admin_login_challenges where user_id = $1", [userId]);
  });
}

/** Checks a code for the signed-in user (used before sensitive changes such as turning two-step sign-in off). */
export async function checkCurrentCode(db: Db, userId: string, input: string): Promise<boolean> {
  return (await consumeSecondFactor(db, userId, input)) === "ok";
}

export async function userHasTwoFactor(db: Db, userId: string): Promise<boolean> {
  return !!(await db.query("select 1 from admin_users where id = $1 and totp_enabled_at is not null", [userId]))[0];
}

/** After a correct password: opens a short-lived challenge. Returns the secret token to put in a cookie. */
export async function createChallenge(db: Db, userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.query("delete from admin_login_challenges where user_id = $1 or expires_at < now()", [userId]);
  await db.query("insert into admin_login_challenges(user_id, token_hash, expires_at) values ($1,$2,$3)", [userId, sha(token), new Date(Date.now() + CHALLENGE_TTL_MS)]);
  return token;
}

export async function challengeUser(db: Db, token: string): Promise<string | null> {
  const r = (await db.query<{ user_id: string }>("select user_id from admin_login_challenges where token_hash = $1 and expires_at > now() and attempts < $2", [sha(token), MAX_CHALLENGE_ATTEMPTS]))[0];
  return r?.user_id ?? null;
}

export type SecondFactorResult = "ok" | "bad" | "locked" | "expired";

/**
 * Verifies the second step of a sign-in. Each wrong try uses one of five attempts on the challenge, after which it is destroyed
 * and the person must start again with their password. A correct authenticator code can be used once.
 */
export async function completeChallenge(db: Db, token: string, input: string): Promise<{ result: SecondFactorResult; userId?: string }> {
  const h = sha(token);
  const row = (await db.query<{ id: string; user_id: string; attempts: number }>("select id, user_id, attempts from admin_login_challenges where token_hash = $1 and expires_at > now()", [h]))[0];
  if (!row) return { result: "expired" };
  if (row.attempts >= MAX_CHALLENGE_ATTEMPTS) { await db.query("delete from admin_login_challenges where id = $1", [row.id]); return { result: "locked" }; }
  await db.query("update admin_login_challenges set attempts = attempts + 1 where id = $1", [row.id]);

  const result = await consumeSecondFactor(db, row.user_id, input);
  if (result === "ok") { await db.query("delete from admin_login_challenges where id = $1", [row.id]); return { result: "ok", userId: row.user_id }; }
  if (row.attempts + 1 >= MAX_CHALLENGE_ATTEMPTS) { await db.query("delete from admin_login_challenges where id = $1", [row.id]); return { result: "locked" }; }
  return { result: "bad" };
}

async function consumeSecondFactor(db: Db, userId: string, input: string): Promise<"ok" | "bad"> {
  const text = input.trim();
  if (/^\d[\d\s]{4,}$/.test(text)) {
    const u = (await db.query<{ totp_secret: string | null; totp_last_step: string | number | null }>("select totp_secret, totp_last_step from admin_users where id = $1 and totp_enabled_at is not null", [userId]))[0];
    const secret = u?.totp_secret ? unseal(u.totp_secret) : null;
    if (!secret) return "bad";
    const last = u.totp_last_step === null ? null : Number(u.totp_last_step);
    const step = verifyTotp(secret, text, last);
    if (step === null) return "bad";
    // Conditional update: if two requests race with the same code, only one of them wins.
    const won = await db.query("update admin_users set totp_last_step = $2 where id = $1 and (totp_last_step is null or totp_last_step < $2) returning id", [userId, step]);
    return won.length ? "ok" : "bad";
  }
  if (normaliseRecovery(text).length === 10) {
    const used = await db.query("update admin_recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id", [userId, hashRecovery(text)]);
    return used.length ? "ok" : "bad";
  }
  return "bad";
}
