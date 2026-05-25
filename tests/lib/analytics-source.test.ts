import { describe, it, expect } from "vitest";
import { classifyReferrer, type ReferrerSource } from "@/lib/analytics-source";

const SITE_HOST = "principia-synthesia.com";

describe("classifyReferrer", () => {
  const cases: Array<{ referrer: string | null; expected: ReferrerSource; label: string }> = [
    // Direct
    { label: "null referrer → direct", referrer: null, expected: "direct" },
    { label: "empty string → direct", referrer: "", expected: "direct" },
    { label: "malformed URL → direct", referrer: "not-a-url", expected: "direct" },

    // Internal
    { label: "same host (no www) → internal", referrer: `https://${SITE_HOST}/some/path`, expected: "internal" },
    { label: "same host with path and query → internal", referrer: `https://${SITE_HOST}/alice/articles/foo?v=abc123`, expected: "internal" },

    // Search engines
    { label: "google.com → search", referrer: "https://google.com/search?q=topology", expected: "search" },
    { label: "www.google.com → search", referrer: "https://www.google.com/", expected: "search" },
    { label: "bing.com → search", referrer: "https://bing.com/search", expected: "search" },
    { label: "duckduckgo.com → search", referrer: "https://duckduckgo.com/?q=test", expected: "search" },
    { label: "yandex.com → search", referrer: "https://yandex.com/search", expected: "search" },
    { label: "yandex.ru → search", referrer: "https://yandex.ru/yandsearch", expected: "search" },
    { label: "baidu.com → search", referrer: "https://baidu.com/s?wd=test", expected: "search" },
    { label: "brave search → search", referrer: "https://search.brave.com/search", expected: "search" },

    // Social networks
    { label: "twitter.com → social", referrer: "https://twitter.com/status/123", expected: "social" },
    { label: "x.com → social", referrer: "https://x.com/i/web/status/123", expected: "social" },
    { label: "t.co short link → social", referrer: "https://t.co/abc123", expected: "social" },
    { label: "facebook.com → social", referrer: "https://facebook.com/post/123", expected: "social" },
    { label: "fb.me → social", referrer: "https://fb.me/post", expected: "social" },
    { label: "linkedin.com → social", referrer: "https://linkedin.com/in/alice", expected: "social" },
    { label: "lnkd.in → social", referrer: "https://lnkd.in/abc", expected: "social" },
    { label: "reddit.com → social", referrer: "https://reddit.com/r/math", expected: "social" },
    { label: "news.ycombinator.com → social", referrer: "https://news.ycombinator.com/item?id=1", expected: "social" },
    { label: "instagram.com → social", referrer: "https://instagram.com/p/xyz", expected: "social" },
    { label: "bsky.app → social", referrer: "https://bsky.app/profile/alice", expected: "social" },
    { label: "mastodon.social → social", referrer: "https://mastodon.social/@alice", expected: "social" },

    // External
    { label: "arbitrary domain → external", referrer: "https://someotherblog.com/article", expected: "external" },
    { label: "subdomain of external → external", referrer: "https://sub.example.org/page", expected: "external" },
    { label: "localhost → external", referrer: "http://localhost:3000/test", expected: "external" },
  ];

  for (const { label, referrer, expected } of cases) {
    it(label, () => {
      expect(classifyReferrer(referrer, SITE_HOST)).toBe(expected);
    });
  }
});
