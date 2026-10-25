import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";

const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;

describe("clientIp", () => {
  it("uses the address added by the trusted proxy (the last entry), not one the visitor typed", () => {
    // attacker sends X-Forwarded-For: 1.1.1.1 ; the proxy appends the real address
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" }))).toBe("203.0.113.7");
  });
  it("cannot be dodged by changing the spoofed part", () => {
    const a = clientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }));
    const b = clientIp(h({ "x-forwarded-for": "8.8.8.8, 7.7.7.7, 203.0.113.7" }));
    expect(a).toBe(b);
  });
  it("prefers x-real-ip when the platform sets it, and falls back to unknown", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.4");
    expect(clientIp(h({}))).toBe("unknown");
  });
});
