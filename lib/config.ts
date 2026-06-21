export const config = {
  features: {
    PDF_EXPORT: process.env.PDF_EXPORT === "true",
    EPUB_EXPORT: process.env.EPUB_EXPORT === "true",
    BUNDLE_EXPORT: process.env.BUNDLE_EXPORT === "true",
  },
  contact: {
    email: "support@principiasynthesia.com",
    githubIssues: "https://github.com/principia-synthesia/principia-synthesia/issues",
  },
} as const;
