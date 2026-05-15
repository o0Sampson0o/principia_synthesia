import { jwtVerify, type JWTPayload } from "jose";

export interface LicensePayload extends JWTPayload {
  tier: "pro" | "team";
  features: string[];   // e.g. ["PDF_EXPORT","EPUB_EXPORT","BUNDLE_EXPORT"]
  sub: string;          // licensee email or domain
}

const SECRET = new TextEncoder().encode(process.env.LICENSE_SECRET ?? "");

export async function isValidLicense(key: string): Promise<LicensePayload | null> {
  try {
    const { payload } = await jwtVerify(key, SECRET);
    return payload as LicensePayload;
  } catch {
    return null;
  }
}

export function featureEnabled(
  feature: string,
  license?: LicensePayload | null
): boolean {
  const envEnabled = process.env[feature] === "true";
  if (envEnabled) return true;
  if (license?.features?.includes(feature)) return true;
  return false;
}

export async function getLicenseFromRequest(req: Request): Promise<LicensePayload | null> {
  const key = process.env.LICENSE_KEY ?? req.headers.get("x-license-key");
  if (!key) return null;
  return isValidLicense(key);
}
