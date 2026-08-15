"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  source: string;
  isDark?: boolean;
}

let idCounter = 0;

/**
 * Reads the page's own palette so a diagram is drawn in the site's colours
 * rather than Mermaid's stock purple. The tokens are the same CSS custom
 * properties everything else on the page uses, so a diagram follows the
 * publisher's theme and the reader's colour scheme without being told about
 * either.
 */
function themeVariables() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();

  const foreground = token("foreground");
  const border = token("border");
  const surface = token("surface");
  const muted = token("muted-foreground");

  return {
    fontFamily: style.getPropertyValue("font-family").trim() || "inherit",
    fontSize: "14px",
    background: "transparent",
    // Nodes: the page's own paper and rule, with body text inside.
    primaryColor: surface,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    secondaryColor: token("muted") || surface,
    secondaryTextColor: foreground,
    secondaryBorderColor: border,
    tertiaryColor: surface,
    tertiaryTextColor: foreground,
    tertiaryBorderColor: border,
    // Edges and labels sit a step back from the nodes they connect.
    lineColor: muted,
    textColor: foreground,
    mainBkg: surface,
    nodeBorder: border,
    clusterBkg: "transparent",
    clusterBorder: border,
    edgeLabelBackground: token("background") || surface,
    titleColor: foreground,
  };
}

export default function MermaidDiagram({ source, isDark = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source.trim()) return;
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        // `base` is the theme that honours themeVariables; the built-in
        // light/dark themes override them with their own palette.
        theme: "base",
        darkMode: isDark,
        themeVariables: themeVariables(),
      });

      try {
        const id = `mermaid-${++idCounter}`;
        // Rendered *into the container* rather than the default (a scratch
        // element on <body>). Mermaid sizes each node by measuring its label,
        // so measuring somewhere with different inherited typography than the
        // place it ends up gives boxes that do not fit their own contents —
        // which is what happened to diagrams embedded in an article, where the
        // prose styles apply and the scratch element's did not.
        const { svg } = await mermaid.render(id, source, containerRef.current ?? undefined);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    render();
    return () => { cancelled = true; };
  }, [source, isDark]);

  if (error) {
    return (
      <pre className="text-xs text-red-500 bg-red-50 dark:bg-red-950 rounded p-3 overflow-x-auto whitespace-pre-wrap">
        {error}
      </pre>
    );
  }

  return <div ref={containerRef} className="flex justify-center" />;
}
