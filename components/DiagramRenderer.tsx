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
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (format === "mermaid") {
    return <MermaidDiagram source={source} isDark={isDark} />;
  }

  if (format === "graphviz") {
    return <GraphvizDiagram source={source} />;
  }

  // Unknown format — show raw source as fallback
  return (
    <pre className="bg-zinc-50 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
      {source}
    </pre>
  );
}
