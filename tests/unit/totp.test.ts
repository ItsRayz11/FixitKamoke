import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hashRecovery, hotp, newRecoveryCodes, newSecret, normaliseRecovery, otpauthUri, seal, stepAt, twoFactorConfigured, unseal, verifyTotp } from "@/lib/auth/totp";

// RFC 4226 / RFC 6238 test secret: ASCII "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_B32 = base32Encode(RFC_SECRET);

describe("one-time codes match the published standard", () => {
  it("RFC 4226 appendix D (counters 0 to 9)", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(RFC_SECRET, counter)).toBe(code));
  });
  it("RFC 6238 time vectors (last six digits of the 8-digit values)", () => {
    expect(hotp(RFC_SECRET, stepAt(59_000))).toBe("287082");
    expect(hotp(RFC_SECRET, stepAt(1_111_111_109_000))).toBe("081804");
    expect(hotp(RFC_SECRET, stepAt(1_234_567_890_000))).toBe("005924");
  });
});

describe("base32", () => {
  it("round-trips and ignores spaces, dashes and case", () => {
    const s = newSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s).length).toBe(20);
    expect(base32Decode(s.toLowerCase().replace(/(.{4})/g, "$1 ")).equals(base32Decode(s))).toBe(true);
    expect(() => base32Decode("not*valid")).toThrow();
  });
});

describe("verifying a typed code", () => {
  const t0 = 1_700_000_000_000;
  const at = (ms: number) => hotp(base32Decode(RFC_B32), stepAt(ms));
  it("accepts the current code and one step of clock drift either way, with spaces", () => {
    expect(verifyTotp(RFC_B32, at(t0), null, t0)).toBe(stepAt(t0));
    expect(verifyTotp(RFC_B32, at(t0 - 30_000), null, t0)).toBe(stepAt(t0) - 1);
    expect(verifyTotp(RFC_B32, at(t0 + 30_000), null, t0)).toBe(stepAt(t0) + 1);
    const c = at(t0);
    expect(verifyTotp(RFC_B32, `${c.slice(0, 3)} ${c.slice(3)}`, null, t0)).toBe(stepAt(t0));
  });
  it("rejects old, future, malformed and wrong codes", () => {
    expect(verifyTotp(RFC_B32, at(t0 - 120_000), null, t0)).toBeNull();
    expect(verifyTotp(RFC_B32, at(t0 + 120_000), null, t0)).toBeNull();
    expect(verifyTotp(RFC_B32, "12345", null, t0)).toBeNull();
    expect(verifyTotp(RFC_B32, "abcdef", null, t0)).toBeNull();
    expect(verifyTotp(RFC_B32, at(t0) === "000000" ? "000001" : "000000", null, t0)).toBeNull();
  });
  it("refuses a code from a step that was already used (no replay)", () => {
    const used = stepAt(t0);
    expect(verifyTotp(RFC_B32, at(t0), used, t0)).toBeNull();
    expect(verifyTotp(RFC_B32, at(t0 + 30_000), used, t0)).toBe(used + 1); // the next code is still fine
  });
});

describe("authenticator link", () => {
  it("is a standard otpauth address", () => {
    const u = otpauthUri("ABCDEFGH", "owner@shop.pk");
    expect(u).toBe("otpauth://totp/Fixit:owner%40shop.pk?secret=ABCDEFGH&issuer=Fixit&algorithm=SHA1&digits=6&period=30");
  });
});

describe("secret encryption", () => {
  const prev = process.env.TWO_FACTOR_KEY;
  beforeEach(() => { process.env.TWO_FACTOR_KEY = "unit-test-key-0123456789-abcdefghijklmnop"; });
  afterEach(() => { if (prev === undefined) delete process.env.TWO_FACTOR_KEY; else process.env.TWO_FACTOR_KEY = prev; });

  it("seals and opens, never stores the secret in the clear, and uses a fresh IV each time", () => {
    const a = seal("JBSWY3DPEHPK3PXP"), b = seal("JBSWY3DPEHPK3PXP");
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(a).not.toBe(b);
    expect(unseal(a)).toBe("JBSWY3DPEHPK3PXP");
  });
  it("returns null for tampered data or a different key", () => {
    const a = seal("JBSWY3DPEHPK3PXP");
    expect(unseal(a.slice(0, -2) + "AA")).toBeNull();
    expect(unseal("garbage")).toBeNull();
    process.env.TWO_FACTOR_KEY = "a-completely-different-key-0123456789-xyz";
    expect(unseal(a)).toBeNull();
  });
  it("is unavailable without a long enough key", () => {
    process.env.TWO_FACTOR_KEY = "too-short";
    expect(twoFactorConfigured()).toBe(false);
    expect(() => seal("x")).toThrow();
    delete process.env.TWO_FACTOR_KEY;
    expect(twoFactorConfigured()).toBe(false);
  });
});

describe("recovery codes", () => {
  it("are ten distinct, readable codes whose hash ignores case and dashes", () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(hashRecovery(codes[0])).toBe(hashRecovery(codes[0].toLowerCase().replace("-", " ")));
    expect(hashRecovery(codes[0])).not.toBe(hashRecovery(codes[1]));
    expect(normaliseRecovery("ab-cd 23")).toBe("ABCD23");
  });
});
