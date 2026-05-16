"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  source: string;
  isDark?: boolean;
}

let idCounter = 0;

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
        theme: isDark ? "dark" : "default",
      });

      try {
        const id = `mermaid-${++idCounter}`;
        const { svg } = await mermaid.render(id, source);
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
