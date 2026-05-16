"use client";

import { useEffect, useState } from "react";

interface Props {
  source: string;
}

export default function GraphvizDiagram({ source }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source.trim()) return;
    let cancelled = false;

    async function render() {
      const { instance } = await import("@viz-js/viz");
      const viz = await instance();
      try {
        const el = viz.renderSVGElement(source);
        el.removeAttribute("width");
        el.removeAttribute("height");
        el.setAttribute("style", "width:100%;height:auto;");
        if (!cancelled) {
          setSvg(el.outerHTML);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    render();
    return () => { cancelled = true; };
  }, [source]);

  if (error) {
    return (
      <pre className="text-xs text-red-500 bg-red-50 dark:bg-red-950 rounded p-3 overflow-x-auto whitespace-pre-wrap">
        {error}
      </pre>
    );
  }

  if (!svg) {
    return <p className="text-xs themed-muted animate-pulse">Rendering…</p>;
  }

  return (
    <div
      className="flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
