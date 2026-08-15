import rehypeShiki from "@shikijs/rehype";
import type { PluggableList } from "unified";

/**
 * Syntax highlighting for fenced code blocks.
 *
 * One config, used by every renderer that shows article prose, so a ```cpp
 * block looks the same on the published page and in the editor Preview.
 *
 * Two themes are emitted at once (`defaultColor: false` writes `--shiki-light`
 * and `--shiki-dark` CSS variables onto each token) because the site follows
 * the reader's colour scheme with `prefers-color-scheme` and has no server-side
 * knowledge of it. `app/globals.css` picks the variable to use.
 */

/** Grammars loaded up front — the languages articles here actually use. */
const EAGER_LANGUAGES = [
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "jsx",
  "latex",
  "lua",
  "makefile",
  "markdown",
  "python",
  "rust",
  "shell",
  "sql",
  "tsx",
  "typescript",
  "yaml",
];

/**
 * Highlighted output, keyed by code + language.
 *
 * Every route here is dynamic, so the same article is re-highlighted on every
 * request without this. Capped and cleared wholesale rather than evicted
 * one-by-one: the cost of a miss is one re-highlight, which is not worth an LRU
 * to avoid.
 */
const CACHE_LIMIT = 500;
const cache = new Map<string, import("hast").Root>();
const boundedCache = {
  get: (key: string) => cache.get(key),
  set(key: string, value: import("hast").Root) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, value);
    return this;
  },
};

/**
 * The rehype plugin list that adds highlighting. Spread into a pipeline *after*
 * `remarkFencedEmbeds` has claimed the fences that are embeds, not listings.
 */
export const codeHighlightPlugins: PluggableList = [
  [
    rehypeShiki,
    {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
      langs: EAGER_LANGUAGES,
      // Anything outside the eager set is loaded on first use; a language that
      // does not exist at all falls back to unhighlighted text rather than
      // throwing and taking the whole article down with it.
      lazy: true,
      fallbackLanguage: "text",
      cache: boundedCache,
      onError: () => {},
    },
  ],
];
