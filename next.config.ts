import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "mathjax-full",
    "playwright-core",
    "@sparticuz/chromium",
    "epub-gen-memory",
  ],
};

export default nextConfig;
