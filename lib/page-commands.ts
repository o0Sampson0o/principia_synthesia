/**
 * Static page destinations for the Ctrl/Cmd+Shift+P command palette.
 * Content (articles/books/objects) is searched server-side via lib/search;
 * these cover the app's fixed pages so every screen is reachable from the
 * palette without typing URLs.
 */

export interface PageCommand {
  label: string;
  href: string;
  /** Extra match terms beyond the label (lowercase). */
  keywords: string[];
  /** Grouping shown in the palette. */
  section: "Pages" | "Settings";
  /** Hidden when no user session exists. */
  requiresAuth: boolean;
}

const STATIC_COMMANDS: PageCommand[] = [
  { label: "Home", href: "/", keywords: ["index", "front", "start"], section: "Pages", requiresAuth: false },
  { label: "Search", href: "/search", keywords: ["find", "browse"], section: "Pages", requiresAuth: false },
  { label: "Timeline", href: "/timeline", keywords: ["history", "events", "chronology"], section: "Pages", requiresAuth: false },
  { label: "Organizations", href: "/organizations", keywords: ["orgs", "teams", "groups"], section: "Pages", requiresAuth: false },
  { label: "Notifications", href: "/notifications", keywords: ["inbox", "alerts", "bell"], section: "Pages", requiresAuth: true },
  { label: "Pricing", href: "/pricing", keywords: ["plans", "billing", "license"], section: "Pages", requiresAuth: false },
  { label: "Support", href: "/support", keywords: ["help", "contact", "faq"], section: "Pages", requiresAuth: false },
  { label: "Settings", href: "/settings", keywords: ["preferences", "options", "account"], section: "Settings", requiresAuth: true },
  { label: "Settings: Account", href: "/settings/account", keywords: ["password", "display name", "profile", "credentials"], section: "Settings", requiresAuth: true },
  { label: "Settings: Theme", href: "/settings/theme", keywords: ["color", "palette", "dark mode", "appearance", "tokens"], section: "Settings", requiresAuth: true },
  { label: "Settings: API tokens", href: "/settings/api-tokens", keywords: ["token", "api key", "personal access", "ps-sync", "sync"], section: "Settings", requiresAuth: true },
  { label: "Settings: Onboarding", href: "/settings/onboarding", keywords: ["tour", "replay", "intro", "walkthrough"], section: "Settings", requiresAuth: true },
];

/** All commands available to the current viewer (userSlug = null when logged out). */
export function getPageCommands(userSlug: string | null): PageCommand[] {
  const commands = STATIC_COMMANDS.filter((c) => !c.requiresAuth || userSlug !== null);
  if (userSlug) {
    commands.push({
      label: `My page (@${userSlug})`,
      href: `/${userSlug}`,
      keywords: ["profile", "publisher", "my articles", "my books"],
      section: "Pages",
      requiresAuth: true,
    });
  }
  return commands;
}

/**
 * Case-insensitive filter: every whitespace-separated query term must appear
 * in the label or one of the keywords. An empty query matches everything.
 */
export function filterPageCommands(commands: PageCommand[], query: string): PageCommand[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands;
  return commands.filter((c) => {
    const haystack = [c.label.toLowerCase(), ...c.keywords].join(" ");
    return terms.every((t) => haystack.includes(t));
  });
}
