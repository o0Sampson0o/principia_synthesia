"use client";

import { useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import DynamicAnimation from "@/components/DynamicAnimation";
import InlineAnimation from "@/components/InlineAnimation";
import MermaidBlock from "@/components/MermaidBlock";
import EmbedBody, { EmbedMissing } from "@/components/EmbedBody";
import type { ResolvedEmbed } from "@/lib/embed-resolve";

/**
 * One React root per mount-point element, so an element that is mounted, torn
 * down and mounted again (StrictMode double-invokes every effect in
 * development) is never handed a second root for the same DOM node.
 */
const rootsByElement = new WeakMap<HTMLElement, Root>();

/**
 * Fills the editor Preview's mount points with the real components.
 *
 * The Preview arrives as an HTML string (see `lib/preview-mdx-render.ts`), so
 * anything that needs a browser — a canvas, a Mermaid diagram, an embed that
 * has to be looked up — is left as an empty `[data-ps-embed]` element. This
 * mounts a React root into each one and renders exactly the component the
 * published page would, so what the author sees is what readers get.
 *
 * Returns both props the container needs — spread them onto it:
 *
 *     const preview = usePreviewEmbeds(html);
 *     <div className="markdown-content" {...preview} />
 *
 * Both are part of the contract, which is why they come as a pair rather than
 * being left to the caller:
 *
 * - `ref` is a callback ref held in state, not a `useRef`, so the work re-runs
 *   whenever the container element *itself* is replaced. Re-previewing
 *   unchanged text does exactly that, and a `useRef` would keep pointing at a
 *   stable ref object while the new element sat there empty.
 * - `dangerouslySetInnerHTML` is memoised. React re-applies that prop whenever
 *   it is a new object, which an inline `{{ __html }}` is on every render — so
 *   writing it at the call site tears the mounted components back out on the
 *   next keystroke.
 *
 * Teardown is keyed on the element still being in the document rather than on
 * the effect being cleaned up. A cleanup means one of two things: these
 * elements have been detached and replaced (unmount them, they are gone); or
 * the effect is being re-run over the same live elements, where unmounting
 * would blank the roots the re-run just rendered into.
 */
export function usePreviewEmbeds(html: string | null): {
  ref: (el: HTMLElement | null) => void;
  dangerouslySetInnerHTML: { __html: string };
} {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!container || !html) return;

    const mounted: HTMLElement[] = [];
    for (const el of container.querySelectorAll<HTMLElement>("[data-ps-embed]")) {
      const node = mountedComponent(el);
      if (!node) continue;
      let root = rootsByElement.get(el);
      if (!root) {
        root = createRoot(el);
        rootsByElement.set(el, root);
      }
      mounted.push(el);
      root.render(node);
    }

    return () => {
      // Deferred so the unmount never lands inside the render that detached
      // these elements, and so `isConnected` reflects the settled DOM.
      queueMicrotask(() => {
        for (const el of mounted) {
          if (el.isConnected) continue;
          rootsByElement.get(el)?.unmount();
          rootsByElement.delete(el);
        }
      });
    };
  }, [container, html]);

  const dangerouslySetInnerHTML = useMemo(() => ({ __html: html ?? "" }), [html]);
  return { ref: setContainer, dangerouslySetInnerHTML };
}

/** Maps one mount point to the component it stands in for. */
function mountedComponent(el: HTMLElement) {
  const data = el.dataset;

  switch (data.psEmbed) {
    case "stored-animation":
      if (!data.psPublisher || !data.psSlug) return null;
      return <DynamicAnimation publisher={data.psPublisher} slug={data.psSlug} />;

    case "inline-animation":
      if (!data.psCode) return null;
      return <InlineAnimation code={data.psCode} height={data.psHeight} />;

    case "mermaid":
      if (!data.psSource) return null;
      return <MermaidBlock source={data.psSource} />;

    case "embed":
      if (!data.psSlug || !data.psDefaultPublisher) return null;
      return (
        <PreviewEmbed
          slug={data.psSlug}
          publisher={data.psPublisher}
          defaultPublisher={data.psDefaultPublisher}
        />
      );

    default:
      return null;
  }
}

/**
 * An `<Embed>` in the Preview.
 *
 * The published page resolves embeds while rendering on the server; here the
 * lookup goes over the embeds API and the result is handed to the same
 * `<EmbedBody>`, so the two render identically.
 */
function PreviewEmbed({
  slug,
  publisher,
  defaultPublisher,
}: {
  slug: string;
  publisher?: string;
  defaultPublisher: string;
}) {
  const [embed, setEmbed] = useState<ResolvedEmbed | null | "loading">("loading");

  useEffect(() => {
    let stale = false;
    // The path publisher is the *default* — the one a bare slug resolves
    // against. An explicit `publisher` prop overrides it, so it rides along.
    const query = publisher ? `?publisher=${encodeURIComponent(publisher)}` : "";
    const url = `/api/publishers/${encodeURIComponent(defaultPublisher)}/embeds/${encodeURIComponent(slug)}${query}`;
    fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<ResolvedEmbed>) : null))
      .catch(() => null)
      .then((result) => {
        if (!stale) setEmbed(result);
      });
    return () => {
      stale = true;
    };
  }, [slug, publisher, defaultPublisher]);

  if (embed === "loading") {
    return <div className="my-8 text-sm themed-muted">Loading embed…</div>;
  }
  if (!embed) return <EmbedMissing slug={slug} />;
  return <EmbedBody embed={embed} />;
}
