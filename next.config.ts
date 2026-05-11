import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "mathjax-full",
    "playwright-core",
    "@sparticuz/chromium",
    "epub-gen-memory",
  ],
  // Ensure @sparticuz/chromium binary files are included in the PDF route's
  // serverless function bundle — Next.js file-tracing skips binary assets by default.
  outputFileTracingIncludes: {
    "/api/curriculum/[book]/export/pdf": [
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
