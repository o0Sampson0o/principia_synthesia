export const config = {
  // Canonical origin, never with a trailing slash — callers append paths directly.
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.principiasynthesia.org").replace(/\/+$/, ""),
  features: {
    PDF_EXPORT: process.env.PDF_EXPORT === "true",
    EPUB_EXPORT: process.env.EPUB_EXPORT === "true",
    BUNDLE_EXPORT: process.env.BUNDLE_EXPORT === "true",
  },
  contact: {
    email: "support@principiasynthesia.org",
    githubIssues: "https://github.com/o0Sampson0o/principia_synthesia/issues",
  },
} as const;
