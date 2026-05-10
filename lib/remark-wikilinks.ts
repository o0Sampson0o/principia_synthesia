import { visit } from "unist-util-visit"
import type { Root, Text, Link, PhrasingContent } from "mdast"

/**
 * Remark plugin that transforms `[[wikilink]]` syntax in MDX/Markdown into
 * standard hyperlinks. Supported syntaxes:
 *
 * - `[[slug]]`            → link to `/<slug>` (article)
 * - `[[slug|Label]]`      → same, with custom display text
 * - `[[book:slug]]`       → link to `/curriculum/<slug>` (book table of contents)
 * - `[[anim:slug]]`       → link to `/animations/<slug>` (animation preview page)
 *
 * The plugin operates on the MDAST `text` node level, splitting runs of text
 * that contain `[[...]]` patterns into text + link nodes in-place.
 */
export function remarkWikilinks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return

      const regex = /\[\[([^\]]+)\]\]/g
      const parts: PhrasingContent[] = []
      let lastIndex = 0
      let match

      while ((match = regex.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, match.index) })
        }

        const inner = match[1]

        // Split on | for optional display label
        const [target, label] = inner.includes("|")
          ? inner.split("|").map((s) => s.trim())
          : [inner.trim(), null]

        // Resolve URL: 
        // - book:slug → /curriculum/slug
        // - anim:slug → /animations/slug (preview page)
        // - else → /slug
        let url: string
        let displayText: string

        if (target.startsWith("book:")) {
          const bookSlug = target.slice(5).trim()
          url = `/curriculum/${bookSlug}`
          displayText = label ?? bookSlug
        } else if (target.startsWith("anim:")) {
          const animSlug = target.slice(5).trim()
          url = `/animations/${animSlug}`
          displayText = label ?? animSlug
        } else {
          url = `/${target}`
          displayText = label ?? target
        }

        const link: Link = {
          type: "link",
          url,
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
