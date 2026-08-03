# Wikilink Syntax

Principia Synthesia supports a `[[wikilink]]` syntax in MDX article content.
Links are processed at render time by the custom `remarkWikilinks` remark
plugin (`lib/remark-wikilinks.ts`), which transforms them into standard `<a>`
tags before the MDX is compiled.

---

## Supported syntax

Most wikilinks use a three-segment format: `[[publisher:type:slug]]`. Book
sections take an optional fourth segment — see [Book section link](#book-section-link).

### Article link

```
[[publisher:articles:slug]]
```

Links to `/<publisher>/articles/<slug>`. The display text defaults to the slug.

```
[[alice:articles:quantum-mechanics]]
→ <a href="/alice/articles/quantum-mechanics">quantum-mechanics</a>
```

---

### Article link with custom display text

```
[[publisher:articles:slug|Display Text]]
```

```
[[alice:articles:quantum-mechanics|Quantum Mechanics 101]]
→ <a href="/alice/articles/quantum-mechanics">Quantum Mechanics 101</a>
```

---

### Book (curriculum) link

```
[[publisher:books:book-slug]]
[[publisher:books:book-slug|Display Text]]
```

Links to `/<publisher>/books/<book-slug>`, the book's table of contents.

```
[[alice:books:classical-mechanics]]
→ <a href="/alice/books/classical-mechanics">classical-mechanics</a>

[[alice:books:classical-mechanics|Classical Mechanics]]
→ <a href="/alice/books/classical-mechanics">Classical Mechanics</a>
```

---

### Book section link

```
[[publisher:books:book-slug:section-slug]]
[[publisher:books:book-slug:section-slug|Display Text]]
```

Links to `/<publisher>/books/<book-slug>/<section-slug>`, a single section
inside a book. The display text defaults to the *section* slug.

```
[[alice:books:classical-mechanics:intro]]
→ <a href="/alice/books/classical-mechanics/intro">intro</a>
```

**Use this form for book chapters.** Book-internal article slugs are only
unique within their own book (see the partial unique indexes on `articles`), so
two books can each have an `intro`. A bare `[[alice:articles:intro]]` cannot say
which one you meant: it resolves only when exactly one book has that slug, and
otherwise lands on a disambiguation page.

The fourth segment is only meaningful after `books`. `[[p:articles:a:b]]` and
`[[p:objects:a:b]]` are not links and stay as literal text.

---

### Object link

```
[[publisher:objects:object-slug]]
[[publisher:objects:object-slug|Display Text]]
```

Links to `/<publisher>/objects/<object-slug>`.

```
[[alice:objects:double-pendulum]]
→ <a href="/alice/objects/double-pendulum">double-pendulum</a>

[[alice:objects:double-pendulum|Double Pendulum Simulation]]
→ <a href="/alice/objects/double-pendulum">Double Pendulum Simulation</a>
```

---

## How the plugin works

`remarkWikilinks` is a standard remark plugin that operates on the
[MDAST](https://github.com/syntax-tree/mdast) text node level. It visits every
`text` node, splits any `[[...]]` matches out of the raw string, and replaces
them with `link` AST nodes in place. Text before and after each match is
preserved as sibling `text` nodes.

The regex matches `[[publisher:articles|books|objects:slug]]` with an optional
fourth `:section` segment — exactly those three resource types. Anything that
does not match, including a fourth segment on a non-book type, is left as
literal text. Parsing and URL construction live in `lib/wikilink-syntax.ts`
(`buildWikilink`), shared by the remark transform, the editor's Lezer parser,
and the live-preview chip so all three agree on what resolves and where.

The plugin runs before `rehype-katex` and `remark-gfm` in the render pipeline
so it does not interfere with math or GFM syntax.

---

## Notes and limitations

- Wikilinks work in article body content only (the `content` MDX field).
  They are not processed in summaries, titles, or category names.
- The plugin does **not** validate that the target publisher or slug exists in
  the database; a broken wikilink will render as a working `<a>` that returns a
  404.
- Spaces in slugs are not supported. Use hyphens: `[[alice:articles:my-article]]`
  not `[[alice:articles:my article]]`.
- Nesting or escaping brackets inside a wikilink is not supported.
- A bare `[[pub:articles:slug]]` pointing at a book chapter still works while
  only one book uses that slug; add the book segment as soon as a second book
  reuses it.
- The old two-segment syntaxes (`[[slug]]`, `[[book:slug]]`, `[[anim:slug]]`,
  `[[object:slug]]`) are not supported. All links must use the three-segment
  `[[publisher:type:slug]]` form.
