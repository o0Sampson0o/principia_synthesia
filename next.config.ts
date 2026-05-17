import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https?:\/\/.*\/((?!admin|api|_next).+)$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "article-pages",
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
  ],
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

export default withPWA(nextConfig);
