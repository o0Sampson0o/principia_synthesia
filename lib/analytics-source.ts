export type ReferrerSource =
  | "direct"
  | "search"
  | "social"
  | "internal"
  | "external";

const SEARCH_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "bing.com",
  "www.bing.com",
  "duckduckgo.com",
  "www.duckduckgo.com",
  "yandex.com",
  "www.yandex.com",
  "yandex.ru",
  "www.yandex.ru",
  "baidu.com",
  "www.baidu.com",
  "search.brave.com",
]);

const SOCIAL_HOSTS = new Set([
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
  "t.co",
  "facebook.com",
  "www.facebook.com",
  "fb.me",
  "l.facebook.com",
  "m.facebook.com",
  "linkedin.com",
  "www.linkedin.com",
  "lnkd.in",
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "news.ycombinator.com",
  "instagram.com",
  "www.instagram.com",
  "bsky.app",
  "staging.bsky.app",
]);

/** Matches mastodon.* instance hosts (e.g. mastodon.social, fosstodon.org) */
function isMastodonHost(hostname: string): boolean {
  // Common mastodon instances and any host containing "mastodon"
  return hostname.includes("mastodon") || hostname === "fosstodon.org";
}

/**
 * Classify a raw Referer header value into one of five source categories.
 *
 * @param referrer - The raw Referer header value, or null/empty when absent.
 * @param siteHost - The host of the current site (e.g. "www.principiasynthesia.org").
 *                   Used to detect "internal" referrers.
 */
export function classifyReferrer(
  referrer: string | null,
  siteHost: string
): ReferrerSource {
  if (!referrer) return "direct";

  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    // Malformed URL — treat as direct
    return "direct";
  }

  const hostname = url.hostname.toLowerCase();

  if (hostname === siteHost.toLowerCase()) return "internal";
  if (SEARCH_HOSTS.has(hostname)) return "search";
  if (SOCIAL_HOSTS.has(hostname) || isMastodonHost(hostname)) return "social";

  return "external";
}
