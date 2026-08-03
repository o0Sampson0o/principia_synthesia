import { visit } from "unist-util-visit"
import type { Root, Text, Link, PhrasingContent } from "mdast"
import { wikilinkRe, buildWikilink } from "@/lib/wikilink-syntax"

/**
 * Remark plugin that transforms `[[publisher:type:slug]]` wikilink syntax in
 * MDX/Markdown into standard hyperlinks.
 *
 * Supported syntax:
 * - `[[publisher:articles:article-slug]]`      → `/publisher/articles/article-slug`
 * - `[[publisher:books:book-slug]]`            → `/publisher/books/book-slug`
 * - `[[publisher:books:book-slug:section]]`    → `/publisher/books/book-slug/section`
 * - `[[publisher:objects:object-slug]]`        → `/publisher/objects/object-slug`
 * - `[[publisher:type:slug|Display text]]`     → same URL, custom display text
 *
 * The 4-segment form addresses a section inside a specific book, which a bare
 * `[[pub:articles:slug]]` cannot do now that book-internal slugs are only
 * unique within their book.
 *
 * Anything that does not match is left as literal text.
 */
export function remarkWikilinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return

      // Regex: [[publisher:type:slug]] or [[publisher:type:slug|Label]]
      // (single source of truth shared with the editor: lib/wikilink-syntax.ts)
      const regex = wikilinkRe()
      const parts: PhrasingContent[] = []
      let lastIndex = 0
      let match

      while ((match = regex.exec(node.value)) !== null) {
        const [, publisher, type, slug, section, label] = match
        const parsed = buildWikilink(publisher, type, slug, section, label)
        // Not a meaningful target (e.g. a section on a non-book). Leave the raw
        // text in place rather than linking somewhere that does not exist —
        // `lastIndex` is untouched, so the match is emitted as literal text
        // along with whatever precedes it.
        if (!parsed) continue

        if (match.index > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) })
        }

        const link: Link = {
          type: "link",
          url: parsed.href,
          children: [{ type: "text", value: parsed.display }],
        }
        parts.push(link)
        lastIndex = match.index + match[0].length
      }

      if (parts.length === 0) return

      if (lastIndex < node.value.length) {
        parts.push({ type: "text", value: node.value.slice(lastIndex) })
      }

      parent.children.splice(index, 1, ...parts)
    })
  }
}
