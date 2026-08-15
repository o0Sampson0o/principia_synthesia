"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const MermaidDiagram = dynamic(() => import("./MermaidDiagram"), { ssr: false });
const GraphvizDiagram = dynamic(() => import("./GraphvizDiagram"), { ssr: false });

interface Props {
  format: string;
  source: string;
}

export default function DiagramRenderer({ format, source }: Props) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // `ps-diagram` keeps the rendered SVG inside its column (app/globals.css).
  // It lives here rather than on each caller so a diagram *object* and a
  // ```mermaid fence are sized the same way.
  if (format === "mermaid") {
    return (
      <div className="ps-diagram">
        <MermaidDiagram source={source} isDark={isDark} />
      </div>
    );
  }

  if (format === "graphviz") {
    return (
      <div className="ps-diagram">
        <GraphvizDiagram source={source} />
      </div>
    );
  }

  // Unknown format — show raw source as fallback
  return (
    <pre className="themed-pre text-sm whitespace-pre-wrap">
      {source}
    </pre>
  );
}
