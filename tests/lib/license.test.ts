// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { SignJWT } from "jose";
import type { LicensePayload } from "@/lib/license";

// lib/license.ts captures SECRET at module-init time. We must load it AFTER
// setting the env var, so we use vi.resetModules() + dynamic import inside
// beforeAll to guarantee the module is freshly evaluated with our test secret.

const TEST_SECRET = "test-license-secret-at-least-32-chars";

let isValidLicense: (key: string) => Promise<LicensePayload | null>;
let featureEnabled: (feature: string, license?: LicensePayload | null) => boolean;

beforeAll(async () => {
  process.env.LICENSE_SECRET = TEST_SECRET;
  vi.resetModules();
  const mod = await import("@/lib/license");
  isValidLicense = mod.isValidLicense;
  featureEnabled = mod.featureEnabled;
});

afterAll(() => {
  delete process.env.LICENSE_SECRET;
  vi.resetModules();
});

function makeSecret(str: string) {
  return new TextEncoder().encode(str);
}

async function signLicense(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET,
  expiry: string = "7d"
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(makeSecret(secret));
}

describe("isValidLicense", () => {
  it("returns payload for a correctly signed key with tier and features", async () => {
    const token = await signLicense({
      tier: "pro",
      features: ["PDF_EXPORT"],
      sub: "user@example.com",
    });

    const result = await isValidLicense(token);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("pro");
    expect(result!.features).toContain("PDF_EXPORT");
    expect(result!.sub).toBe("user@example.com");
  });

  it("returns null for a key signed with a different secret", async () => {
    const token = await signLicense(
      { tier: "pro", features: ["PDF_EXPORT"], sub: "other@example.com" },
      "a-completely-different-secret-xyz-1234"
    );
    const result = await isValidLicense(token);
    expect(result).toBeNull();
  });

  it("returns null for an expired key", async () => {
    const token = await signLicense(
      { tier: "pro", features: ["PDF_EXPORT"], sub: "user@example.com" },
      TEST_SECRET,
      "-1s"
    );
    const result = await isValidLicense(token);
    expect(result).toBeNull();
  });

  it("returns null for a malformed non-JWT string", async () => {
    const result = await isValidLicense("not-a-jwt-at-all");
    expect(result).toBeNull();
  });
});

describe("featureEnabled", () => {
  it("returns false when env var is not set and license is null", () => {
    delete process.env.PDF_EXPORT;
    const result = featureEnabled("PDF_EXPORT", null);
    expect(result).toBe(false);
  });

  it("returns true when env var is set to 'true' and license is null", () => {
    process.env.PDF_EXPORT = "true";
    try {
      const result = featureEnabled("PDF_EXPORT", null);
      expect(result).toBe(true);
    } finally {
      delete process.env.PDF_EXPORT;
    }
  });

  it("returns true when license payload includes the feature and env is not set", async () => {
    delete process.env.PDF_EXPORT;
    const token = await signLicense({
      tier: "pro",
      features: ["PDF_EXPORT"],
      sub: "user@example.com",
    });
    const payload = await isValidLicense(token);
    expect(payload).not.toBeNull();
    const result = featureEnabled("PDF_EXPORT", payload);
    expect(result).toBe(true);
  });

  it("returns false when license payload has empty features and env is not set", async () => {
    delete process.env.PDF_EXPORT;
    const token = await signLicense({
      tier: "pro",
      features: [],
      sub: "user@example.com",
    });
    const payload = await isValidLicense(token);
    expect(payload).not.toBeNull();
    const result = featureEnabled("PDF_EXPORT", payload);
    expect(result).toBe(false);
  });
});
