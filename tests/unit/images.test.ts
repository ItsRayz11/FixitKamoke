import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { optimizeImageUrl } from "@/lib/domain/images";
import { cloudinaryConfig, signParams, uploadTicket } from "@/lib/cloudinary";

describe("optimizeImageUrl", () => {
  const u = "https://res.cloudinary.com/demo/image/upload/v1712345678/fixit/products/cable.jpg";
  it("asks Cloudinary for the best format, sensible quality and a limited width", () => {
    expect(optimizeImageUrl(u, 800)).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800/v1712345678/fixit/products/cable.jpg");
  });
  it("clamps silly widths", () => {
    expect(optimizeImageUrl(u, 5)).toContain("w_100/");
    expect(optimizeImageUrl(u, 99999)).toContain("w_2400/");
  });
  it("leaves every other address, and already-transformed Cloudinary addresses, alone", () => {
    for (const x of ["https://example.com/a.jpg", "/demo/stand.svg", "https://res.cloudinary.com/demo/image/upload/w_300/v1/a.jpg", "https://res.cloudinary.com/demo/video/upload/v1/a.mp4", "not a url"]) {
      expect(optimizeImageUrl(x, 800)).toBe(x);
    }
  });
});

describe("Cloudinary signing", () => {
  it("follows Cloudinary's documented method: sorted key=value pairs joined with &, the secret appended, SHA-1 in hex", () => {
    const sig = signParams({ timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300" }, "abcd");
    expect(sig).toBe(crypto.createHash("sha1").update("eager=w_400,h_300&public_id=sample_image&timestamp=1315060510abcd").digest("hex"));
    expect(sig).toMatch(/^[0-9a-f]{40}$/);
    expect(signParams({ b: 2, a: 1 }, "s")).toBe(signParams({ a: 1, b: 2 }, "s")); // order of keys does not matter
  });
  it("is available only with all three settings", () => {
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" } as unknown as NodeJS.ProcessEnv)).toEqual({ cloudName: "c", apiKey: "k", apiSecret: "s" });
  });
  it("issues a ticket that binds the folder and allowed formats, and never contains the secret", () => {
    const t = uploadTicket({ cloudName: "my cloud", apiKey: "123", apiSecret: "topsecret" }, "fixit/spin", 1700000000);
    expect(t.url).toBe("https://api.cloudinary.com/v1_1/my%20cloud/image/upload");
    expect(t.fields).toMatchObject({ folder: "fixit/spin", allowed_formats: "jpg,jpeg,png,webp", timestamp: "1700000000", api_key: "123" });
    expect(t.fields.signature).toBe(signParams({ allowed_formats: "jpg,jpeg,png,webp", folder: "fixit/spin", timestamp: 1700000000 }, "topsecret"));
    expect(JSON.stringify(t)).not.toContain("topsecret");
  });
});
