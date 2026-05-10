# Wikilink Syntax

Principia Synthesia supports a `[[wikilink]]` syntax in MDX article content.
Links are processed at render time by the custom `remarkWikilinks` remark
plugin (`lib/remark-wikilinks.ts`), which transforms them into standard `<a>`
tags before the MDX is compiled.

---

## Supported syntaxes

### Article link (plain)

```
[[slug]]
```

Links to `/<slug>`. The display text is the slug itself.

```
[[quantum-mechanics]]
→ <a href="/quantum-mechanics">quantum-mechanics</a>
```

---

### Article link with custom display text

```
[[slug|Display Text]]
```

Links to `/<slug>` with the given display text.

```
[[quantum-mechanics|Quantum Mechanics 101]]
→ <a href="/quantum-mechanics">Quantum Mechanics 101</a>
```

---

### Book (curriculum) link

```
[[book:book-slug]]
[[book:book-slug|Display Text]]
```

Links to `/curriculum/<book-slug>`, the book's table of contents. Without a
label the book slug is used as display text.

```
[[book:classical-mechanics]]
→ <a href="/curriculum/classical-mechanics">classical-mechanics</a>

[[book:classical-mechanics|Classical Mechanics]]
→ <a href="/curriculum/classical-mechanics">Classical Mechanics</a>
```

---

### Animation link

```
[[anim:anim-slug]]
[[anim:anim-slug|Display Text]]
```

Links to `/animations/<anim-slug>`, the standalone animation preview page.
Without a label the animation slug is used as display text.

```
[[anim:double-pendulum]]
→ <a href="/animations/double-pendulum">double-pendulum</a>

[[anim:double-pendulum|Double Pendulum Simulation]]
→ <a href="/animations/double-pendulum">Double Pendulum Simulation</a>
```

---

## How the plugin works

`remarkWikilinks` is a standard remark plugin that operates on the
[MDAST](https://github.com/syntax-tree/mdast) text node level. It visits every
`text` node, splits any `[[...]]` matches out of the raw string, and replaces
them with `link` AST nodes in place. Text before and after each match is
preserved as sibling `text` nodes.

The plugin runs before `rehype-katex` and `remark-gfm` in the render pipeline
so it does not interfere with math or GFM syntax.

---

## Notes and limitations

- Wikilinks work in article body content only (the `content` MDX field).
  They are not processed in summaries, titles, or category names.
- The plugin does **not** validate that the target slug exists in the database;
  a broken wikilink will render as a working `<a>` that returns a 404.
- Spaces in slugs are not supported. Use hyphens: `[[my-article]]` not
  `[[my article]]`.
- Nesting or escaping brackets inside a wikilink is not supported.
