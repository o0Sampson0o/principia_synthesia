import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { makeSlashSource } from "@/lib/live-preview/slash-menu";
import { pickAndUpload } from "@/lib/live-preview/paste-drop";
import { searchLinkTargets } from "@/lib/link-targets";
import { linkTargetToWikilink, matchMentionQuery, matchWikilinkQuery, type LinkTarget } from "@/lib/link-target-format";

/**
 * `[[` link completion: typing `[[` and part of a title lists matching
 * articles, book sections and books (the author's own first), and picking one
 * writes the full `[[publisher:type:slug|Title]]` link — nobody types a slug.
 * Hand-written link syntax (`[[pub:…`) is left alone.
 */

const KIND_DETAIL: Record<LinkTarget["kind"], string> = { article: "article", book: "book", section: "section" };

function detailFor(t: LinkTarget, ownPublisher: string): string {
  const where = t.kind === "section" ? `${KIND_DETAIL.section} · ${t.bookTitle}` : KIND_DETAIL[t.kind];
  return t.publisherSlug === ownPublisher ? where : `${where} · @${t.publisherSlug}`;
}

function applyTarget(t: LinkTarget) {
  return (view: EditorView, _c: Completion, from: number, to: number) => {
    const link = linkTargetToWikilink(t);
    // An auto-closed "]]" after the caret belongs to the link being replaced.
    const after = view.state.sliceDoc(to, to + 2);
    const end = after === "]]" ? to + 2 : to;
    view.dispatch({ changes: { from, to: end, insert: link }, selection: { anchor: from + link.length } });
  };
}

/**
 * `[[title` and `@title` both search link targets; picking one writes the
 * wikilink in place of what was typed (the `[[` or the `@`).
 */
export function wikilinkSource(publisherSlug: string) {
  // Per-editor memo: retyping or backspacing over a query reuses its answer.
  const cache = new Map<string, Promise<LinkTarget[]>>();
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = matchWikilinkQuery(before) ?? matchMentionQuery(before);
    if (!match) return null;
    const key = match.query.trim().toLowerCase();
    let pending = cache.get(key);
    if (!pending) {
      pending = searchLinkTargets(publisherSlug, key).catch(() => []);
      cache.set(key, pending);
    }
    const targets = await pending;
    if (context.aborted || targets.length === 0) return null;
    return {
      from: line.from + match.start,
      filter: false,
      options: targets.map((t) => ({
        label: t.title,
        detail: detailFor(t, publisherSlug),
        type: "wikilink",
        apply: applyTarget(t),
      })),
    };
  };
}

/** The editor's completions: the "/" block menu and "[[" links, one popup. */
export function editorCompletions(publisherSlug: string): Extension {
  const upload = {
    keywords: "upload image picture photo pdf file document attach",
    completion: {
      label: "Image or PDF",
      detail: "upload",
      type: "image",
      apply: (view: EditorView, _c: Completion, from: number, to: number) => {
        view.dispatch({ changes: { from, to, insert: "" } });
        pickAndUpload(view, publisherSlug);
      },
    },
  };
  return autocompletion({
    override: [makeSlashSource([upload]), wikilinkSource(publisherSlug)],
    icons: true,
    defaultKeymap: true,
  });
}
