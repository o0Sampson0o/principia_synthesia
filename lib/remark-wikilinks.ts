import { visit } from "unist-util-visit"
import type { Root, Text, Link, PhrasingContent } from "mdast"
import { wikilinkRe } from "@/lib/wikilink-syntax"

/**
 * Remark plugin that transforms `[[publisher:type:slug]]` wikilink syntax in
 * MDX/Markdown into standard hyperlinks.
 *
 * Supported syntax:
 * - `[[publisher:articles:article-slug]]`     → `/publisher/articles/article-slug`
 * - `[[publisher:books:book-slug]]`            → `/publisher/books/book-slug`
 * - `[[publisher:objects:object-slug]]`        → `/publisher/objects/object-slug`
 * - `[[publisher:type:slug|Display text]]`     → same URL, custom display text
 *
 * Anything that does not match the three-segment `[[p:t:s]]` pattern is left
 * as literal text.
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
        if (match.index > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) })
        }

        const [, publisher, type, slug, label] = match
        const href = `/${publisher}/${type}/${slug}`
        const displayText = label ?? slug

        const link: Link = {
          type: "link",
          url: href,
          children: [{ type: "text", value: displayText }],
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
