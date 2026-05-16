import { describe, it, expect } from "vitest";
import {
  extensionForMime,
  publisherFromBlobPath,
  buildBlobKey,
  isBlobUrl,
} from "@/lib/images";

describe("extensionForMime", () => {
  it("maps image/jpeg to jpg", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });

  it("maps image/png to png", () => {
    expect(extensionForMime("image/png")).toBe("png");
  });

  it("maps image/gif to gif", () => {
    expect(extensionForMime("image/gif")).toBe("gif");
  });

  it("maps image/webp to webp", () => {
    expect(extensionForMime("image/webp")).toBe("webp");
  });

  it("returns null for disallowed MIME types", () => {
    expect(extensionForMime("application/pdf")).toBeNull();
    expect(extensionForMime("text/plain")).toBeNull();
    expect(extensionForMime("image/svg+xml")).toBeNull();
  });
});

describe("publisherFromBlobPath", () => {
  it("extracts publisher slug from valid path", () => {
    expect(publisherFromBlobPath("images/alice/uuid.png")).toBe("alice");
  });

  it("works with hyphenated publisher slugs", () => {
    expect(publisherFromBlobPath("images/my-publisher/abc123.jpg")).toBe("my-publisher");
  });

  it("returns null for paths without images prefix", () => {
    expect(publisherFromBlobPath("foo/bar")).toBeNull();
  });

  it("returns null for nested paths", () => {
    expect(publisherFromBlobPath("images/alice/sub/x.png")).toBeNull();
  });

  it("returns null for bare images/ prefix", () => {
    expect(publisherFromBlobPath("images/")).toBeNull();
  });
});

describe("buildBlobKey", () => {
  it("returns a path matching the expected pattern", () => {
    const key = buildBlobKey("alice", "png");
    expect(key).toMatch(/^images\/alice\/[0-9a-f-]+\.png$/);
  });

  it("includes the correct extension", () => {
    const key = buildBlobKey("pub-test", "jpg");
    expect(key).toMatch(/^images\/pub-test\/[0-9a-f-]+\.jpg$/);
  });

  it("generates unique keys on each call", () => {
    const k1 = buildBlobKey("alice", "png");
    const k2 = buildBlobKey("alice", "png");
    expect(k1).not.toBe(k2);
  });
});

describe("isBlobUrl", () => {
  it("returns true for a valid Vercel Blob URL", () => {
    expect(isBlobUrl("https://abc.public.blob.vercel-storage.com/x.png")).toBe(true);
  });

  it("returns false for an arbitrary HTTPS URL", () => {
    expect(isBlobUrl("https://example.com/x.png")).toBe(false);
  });

  it("returns false for non-URL strings", () => {
    expect(isBlobUrl("not-a-url")).toBe(false);
  });

  it("returns false for http Blob-like URL (protocol mismatch)", () => {
    expect(isBlobUrl("http://abc.public.blob.vercel-storage.com/x.png")).toBe(false);
  });
});
