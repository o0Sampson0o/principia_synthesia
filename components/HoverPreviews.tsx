"use client";

import { useEffect, useRef, useState } from "react";
import type { LinkPreview } from "@/app/api/preview/route";

/**
 * Hover previews for links inside an article body (Wikipedia's Page Previews,
 * Obsidian's page preview):
 *
 *  - an internal link (`/pub/articles/…`, `/pub/books/…`) shows the target's
 *    title and opening lines, fetched from /api/preview — which answers only
 *    what that page would show this viewer;
 *  - an equation reference (`#eq-…`) shows the equation itself, typeset,
 *    copied from where it already sits on this page — no request.
 *
 * Delegated listeners on the document, scoped to `.markdown-content`, so it
 * covers every link the MDX renderer produced without touching it. Opens on
 * hover (after a short intent delay) or keyboard focus; closes on leave, blur
 * or Escape, and stays open while the pointer is over the card. Skipped on
 * devices without hover, where a tap simply follows the link.
 */

type Card =
  | { kind: "link"; preview: LinkPreview; href: string }
  | { kind: "equation"; html: string; label: string };

const OPEN_DELAY = 350;
const CLOSE_DELAY = 180;
const INTERNAL_RE = /^\/[a-z0-9-]+\/(articles|books)\/[a-z0-9-]+(\/[a-z0-9-]+)*\/?$/;

const cache = new Map<string, Promise<LinkPreview | null>>();
function fetchPreview(path: string): Promise<LinkPreview | null> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`/api/preview?path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? (r.json() as Promise<LinkPreview>) : null))
      .catch(() => null);
    cache.set(path, p);
  }
  return p;
}

/** What a link would preview, or null when it is not previewable. */
function previewTarget(a: HTMLAnchorElement): { eq: Element; label: string } | { path: string } | null {
  if (a.closest(".ps-preview")) return null;
  const raw = a.getAttribute("href") ?? "";
  if (raw.startsWith("#eq-")) {
    const anchor = document.getElementById(decodeURIComponent(raw.slice(1)));
    const eq = anchor?.closest(".katex-display") ?? anchor?.closest(".katex");
    return eq ? { eq, label: a.textContent?.trim() ?? "" } : null;
  }
  let url: URL;
  try {
    url = new URL(raw, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin || url.pathname === location.pathname) return null;
  return INTERNAL_RE.test(url.pathname) ? { path: url.pathname.replace(/\/$/, "") } : null;
}

export default function HoverPreviews() {
  const [card, setCard] = useState<Card | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;

    const place = (a: HTMLElement) => {
      const r = a.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 24);
      const left = Math.min(Math.max(12, r.left), window.innerWidth - width - 12);
      const above = window.innerHeight - r.bottom < 220 && r.top > 240;
      setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above });
    };

    const close = () => {
      window.clearTimeout(openTimer.current);
      anchorRef.current?.removeAttribute("aria-describedby");
      anchorRef.current = null;
      setCard(null);
    };
    const scheduleClose = () => {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(close, CLOSE_DELAY);
    };

    const open = (a: HTMLAnchorElement, immediate: boolean) => {
      const target = previewTarget(a);
      if (!target) return;
      window.clearTimeout(closeTimer.current);
      if (anchorRef.current === a) return;
      window.clearTimeout(openTimer.current);
      openTimer.current = window.setTimeout(async () => {
        let next: Card | null = null;
        if ("eq" in target) {
          // Drop ids from the copy: the original's anchor id must stay unique.
          const copy = target.eq.cloneNode(true) as Element;
          copy.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
          // outerHTML: the .katex-display wrapper is what sets the number apart.
          next = { kind: "equation", html: copy.outerHTML, label: target.label };
        } else {
          const preview = await fetchPreview(target.path);
          if (preview) next = { kind: "link", preview, href: target.path };
        }
        if (!next || !a.isConnected) return;
        anchorRef.current?.removeAttribute("aria-describedby");
        anchorRef.current = a;
        a.setAttribute("aria-describedby", "ps-preview-card");
        place(a);
        setCard(next);
      }, immediate ? 0 : OPEN_DELAY);
    };

    const linkFrom = (t: EventTarget | null) =>
      t instanceof Element ? (t.closest(".markdown-content a[href]") as HTMLAnchorElement | null) : null;

    const onOver = (e: PointerEvent) => {
      const a = linkFrom(e.target);
      if (a) open(a, false);
      else if (cardRef.current?.contains(e.target as Node)) window.clearTimeout(closeTimer.current);
    };
    const onOut = (e: PointerEvent) => {
      const a = linkFrom(e.target);
      const into = e.relatedTarget as Node | null;
      if ((a || cardRef.current?.contains(e.target as Node)) && !cardRef.current?.contains(into) && !a?.contains(into)) {
        window.clearTimeout(openTimer.current);
        scheduleClose();
      }
    };
    const onFocusIn = (e: FocusEvent) => {
      const a = linkFrom(e.target);
      if (a) open(a, true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (linkFrom(e.target)) scheduleClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && anchorRef.current) close();
    };
    const onScroll = () => {
      if (anchorRef.current) close();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  if (!card || !pos) return null;

  return (
    <div
      ref={cardRef}
      id="ps-preview-card"
      role="tooltip"
      className="ps-preview"
      data-above={pos.above || undefined}
      style={{ top: pos.top, left: pos.left }}
    >
      {card.kind === "equation" ? (
        <>
          <p className="ps-preview-meta">Equation {card.label}</p>
          <div className="ps-preview-equation" dangerouslySetInnerHTML={{ __html: card.html }} />
        </>
      ) : (
        <>
          <p className="ps-preview-meta">
            {card.preview.kind}
            {card.preview.context ? ` · ${card.preview.context}` : ""}
          </p>
          <p className="ps-preview-title">{card.preview.title}</p>
          {card.preview.html && (
            // Server-built: escaped text plus KaTeX output (lib/preview-excerpt.ts).
            <p className="ps-preview-body" dangerouslySetInnerHTML={{ __html: card.preview.html }} />
          )}
        </>
      )}
    </div>
  );
}
