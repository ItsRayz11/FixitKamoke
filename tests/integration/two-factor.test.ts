import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { base32Decode, hotp, stepAt } from "@/lib/auth/totp";
import {
  beginSetup, challengeUser, checkCurrentCode, completeChallenge, confirmSetup, createChallenge, disableTwoFactor, MAX_CHALLENGE_ATTEMPTS,
  pendingSecret, TwoFactorError, twoFactorState, userHasTwoFactor,
} from "@/lib/auth/two-factor";

let db: Db;
let uid: string;
const prevKey = process.env.TWO_FACTOR_KEY;

beforeAll(async () => {
  process.env.TWO_FACTOR_KEY = "integration-key-0123456789-abcdefghijklmnop";
  db = await createPgliteDb();
  await migrate(db);
});
afterAll(async () => {
  if (prevKey === undefined) delete process.env.TWO_FACTOR_KEY; else process.env.TWO_FACTOR_KEY = prevKey;
  await db.close();
});
beforeEach(async () => {
  await db.query("delete from admin_users");
  uid = (await db.query<{ id: string }>("insert into admin_users(email, password_hash, role) values ('o@shop.test','x','owner') returning id"))[0].id;
});

const codeNow = (secret: string, offsetSteps = 0) => hotp(base32Decode(secret), stepAt() + offsetSteps);
async function enable(): Promise<{ secret: string; recovery: string[] }> {
  const secret = await beginSetup(db, uid);
  const recovery = (await confirmSetup(db, uid, codeNow(secret)))!;
  return { secret, recovery };
}

describe("setting up", () => {
  it("is off by default and needs a confirmed code before anything is enforced", async () => {
    expect(await userHasTwoFactor(db, uid)).toBe(false);
    const secret = await beginSetup(db, uid);
    expect(await userHasTwoFactor(db, uid)).toBe(false); // started, not confirmed: sign-in is unchanged
    expect((await twoFactorState(db, uid)).pending).toBe(true);
    expect(await pendingSecret(db, uid)).toBe(secret);
    expect(await confirmSetup(db, uid, "000000" === codeNow(secret) ? "111111" : "000000")).toBeNull(); // wrong code
    expect(await userHasTwoFactor(db, uid)).toBe(false);
  });

  it("stores the secret encrypted, switches on with a right code and returns ten recovery codes", async () => {
    const secret = await beginSetup(db, uid);
    const stored = (await db.query<{ totp_secret: string }>("select totp_secret from admin_users where id = $1", [uid]))[0].totp_secret;
    expect(stored).not.toContain(secret);
    const codes = await confirmSetup(db, uid, codeNow(secret));
    expect(codes).toHaveLength(10);
    const s = await twoFactorState(db, uid);
    expect(s.enabledAt).not.toBeNull();
    expect(s.recoveryLeft).toBe(10);
    const hashes = await db.query<{ code_hash: string }>("select code_hash from admin_recovery_codes where user_id = $1", [uid]);
    expect(hashes.every((h) => !codes!.some((c) => h.code_hash.includes(c)))).toBe(true); // only hashes are stored
    await expect(beginSetup(db, uid)).rejects.toBeInstanceOf(TwoFactorError); // already on
  });

  it("is refused when the server has no key", async () => {
    const k = process.env.TWO_FACTOR_KEY;
    delete process.env.TWO_FACTOR_KEY;
    await expect(beginSetup(db, uid)).rejects.toThrow(/TWO_FACTOR_KEY/);
    process.env.TWO_FACTOR_KEY = k;
  });
});

describe("the second step of signing in", () => {
  it("accepts a current code once, and the same code cannot be used again", async () => {
    const { secret } = await enable();
    // The code used to confirm setup is already spent; the next step's code works.
    const t = await createChallenge(db, uid);
    expect((await completeChallenge(db, t, codeNow(secret))).result).toBe("bad"); // same step as the one used in setup
    const t2 = await createChallenge(db, uid);
    const ok = await completeChallenge(db, t2, codeNow(secret, 1));
    expect(ok).toEqual({ result: "ok", userId: uid });
    const t3 = await createChallenge(db, uid);
    expect((await completeChallenge(db, t3, codeNow(secret, 1))).result).toBe("bad"); // replay of a used code
  });

  it("accepts each recovery code exactly once", async () => {
    const { recovery } = await enable();
    const t = await createChallenge(db, uid);
    expect((await completeChallenge(db, t, recovery[3].toLowerCase())).result).toBe("ok");
    const t2 = await createChallenge(db, uid);
    expect((await completeChallenge(db, t2, recovery[3])).result).toBe("bad");
    expect((await twoFactorState(db, uid)).recoveryLeft).toBe(9);
  });

  it("locks the challenge after five wrong tries, even if the sixth would be right", async () => {
    const { secret } = await enable();
    const t = await createChallenge(db, uid);
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS - 1; i++) expect((await completeChallenge(db, t, "000000")).result).toBe("bad");
    expect((await completeChallenge(db, t, "000000")).result).toBe("locked");
    expect((await completeChallenge(db, t, codeNow(secret, 1))).result).toBe("expired"); // challenge is gone: password again
    expect(await challengeUser(db, t)).toBeNull();
  });

  it("expires, is replaced by a newer sign-in attempt, and a wrong shape of input is just wrong", async () => {
    await enable();
    const t = await createChallenge(db, uid);
    expect(await challengeUser(db, t)).toBe(uid);
    await db.query("update admin_login_challenges set expires_at = now() - interval '1 second'");
    expect((await completeChallenge(db, t, "123456")).result).toBe("expired");
    const a = await createChallenge(db, uid);
    const b = await createChallenge(db, uid);
    expect(await challengeUser(db, a)).toBeNull();
    expect(await challengeUser(db, b)).toBe(uid);
    expect((await completeChallenge(db, b, "hello")).result).toBe("bad");
    expect((await completeChallenge(db, b, "")).result).toBe("bad");
  });

  it("does not let one account's challenge accept another account's code", async () => {
    const { secret } = await enable();
    const other = (await db.query<{ id: string }>("insert into admin_users(email, password_hash, role) values ('x@shop.test','x','staff') returning id"))[0].id;
    const t = await createChallenge(db, other); // the other account has no second step at all
    expect((await completeChallenge(db, t, codeNow(secret, 1))).result).toBe("bad");
  });
});

describe("turning it off", () => {
  it("removes the secret, recovery codes and any open challenge", async () => {
    const { secret } = await enable();
    await createChallenge(db, uid);
    await disableTwoFactor(db, uid);
    expect(await userHasTwoFactor(db, uid)).toBe(false);
    expect((await db.query("select 1 from admin_recovery_codes")).length).toBe(0);
    expect((await db.query("select 1 from admin_login_challenges")).length).toBe(0);
    expect((await db.query<{ totp_secret: string | null }>("select totp_secret from admin_users where id = $1", [uid]))[0].totp_secret).toBeNull();
    expect(await checkCurrentCode(db, uid, codeNow(secret, 1))).toBe(false); // nothing to check against any more
  });
});
