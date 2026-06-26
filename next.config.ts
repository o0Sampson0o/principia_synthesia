import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // NetworkFirst: always fetch fresh content when online so editors
        // never see a stale version after saving. Falls back to cache only
        // when the network is unavailable (offline reading).
        // Excludes editor/settings routes that must never be served stale.
        urlPattern: /^https?:\/\/.*\/((?!admin|api|_next|settings).+)$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "article-pages",
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /^\/_next\/static\/.*/,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
        handler: "CacheFirst",
        options: {
          cacheName: "images",
          expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
});

// Derive the public Vercel Blob base URL from the token so we can rewrite
// /images/:path* → CDN URL without going through a function.
// Token format: vercel_blob_rw_<STORE_ID>_<secret>
const blobStoreId = process.env.BLOB_READ_WRITE_TOKEN?.match(
  /^vercel_blob_rw_([^_]+)/
)?.[1];
const blobCdnBase = blobStoreId
  ? `https://${blobStoreId}.public.blob.vercel-storage.com`
  : null;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!blobCdnBase) return [];
    return [
      {
        // /images/sampson/photo.png  →  CDN/images/sampson/photo.png
        source: "/images/:path*",
        destination: `${blobCdnBase}/images/:path*`,
      },
    ];
  },
  serverExternalPackages: [
    "mathjax-full",
    "playwright-core",
    "@sparticuz/chromium",
    "epub-gen-memory",
    // Reads its own index.dic/index.aff via import.meta.url at load time; keep
    // it external so the path isn't rewritten and the data files are traced.
    "dictionary-en",
  ],
  // Belt-and-suspenders: force the ~550KB Hunspell dictionary data into the
  // grammar function's bundle so spell checking works on Vercel.
  outputFileTracingIncludes: {
    "/api/grammar": ["./node_modules/dictionary-en/index.{dic,aff}"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
};

export default withSentryConfig(withPWA(nextConfig), {
  // Source map upload + release tracking happens at build time. Requires
  // SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT in the build environment.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print upload logs in CI.
  silent: !process.env.CI,

  // Upload a wider set of client bundle source maps for readable stack traces.
  widenClientFileUpload: true,

  // Tree-shake Sentry logger statements (webpack only — build uses --webpack).
  disableLogger: true,

  // Route Sentry requests through a Next.js rewrite to bypass ad-blockers.
  tunnelRoute: "/monitoring",
});
