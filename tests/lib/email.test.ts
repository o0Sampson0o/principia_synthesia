import { describe, it, expect, vi } from "vitest";

vi.mock("nodemailer", () => ({
  createTransport: vi.fn(() => ({
    sendMail: vi.fn().mockResolvedValue({}),
  })),
}));

import { buildInvitationEmailHtml, buildVerificationEmailHtml } from "@/lib/email";

describe("buildInvitationEmailHtml", () => {
  it("escapes script injection in orgName", () => {
    const html = buildInvitationEmailHtml({
      orgName: "<script>alert(1)</script>",
      inviterName: "Alice",
      role: "member",
      acceptUrl: "https://example.com/invite/token",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in inviterName", () => {
    const html = buildInvitationEmailHtml({
      orgName: "My Org",
      inviterName: '<img src=x onerror="alert(1)">',
      role: "admin",
      acceptUrl: "https://example.com/invite/token",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapes HTML in role", () => {
    const html = buildInvitationEmailHtml({
      orgName: "My Org",
      inviterName: "Bob",
      role: "<b>hacked</b>",
      acceptUrl: "https://example.com/invite/token",
    });
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("escapes the acceptUrl", () => {
    const html = buildInvitationEmailHtml({
      orgName: "My Org",
      inviterName: "Bob",
      role: "member",
      acceptUrl: 'https://example.com/" onclick="alert(1)',
    });
    expect(html).not.toContain('" onclick="');
    expect(html).toContain("&quot;");
  });

  it("renders valid output for clean inputs", () => {
    const html = buildInvitationEmailHtml({
      orgName: "Acme",
      inviterName: "Alice",
      role: "admin",
      acceptUrl: "https://example.com/invite/abc",
    });
    expect(html).toContain("Acme");
    expect(html).toContain("Alice");
    expect(html).toContain("admin");
    expect(html).toContain("https://example.com/invite/abc");
  });
});

describe("buildVerificationEmailHtml", () => {
  it("escapes the verification URL", () => {
    const html = buildVerificationEmailHtml('https://example.com/" onclick="bad');
    expect(html).not.toContain('" onclick="');
  });

  it("renders a valid link for a clean URL", () => {
    const html = buildVerificationEmailHtml("https://example.com/verify/token123");
    expect(html).toContain("https://example.com/verify/token123");
  });
});
