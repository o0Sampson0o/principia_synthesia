"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { serialize } from "next-mdx-remote/serialize";
import { MDXRemote } from "next-mdx-remote";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import "katex/dist/katex.min.css";
import dynamic from "next/dynamic";
import MdxErrorBoundary from "./MdxErrorBoundary";

// DynamicAnimation loaded dynamically to avoid SSR issues
const DynamicAnimation = dynamic(
  () => import("./DynamicAnimation"),
  {
    ssr: false,
    loading: () => (
      <div className="my-6 flex justify-center text-sm text-zinc-400">
        Loading animation...
      </div>
    ),
  }
);

// Dangerous patterns that require full MDX serialization
const DANGEROUS_PATTERN = /[<>{}$\\\[\]`]|```/;

function needsFullSerialization(content: string): boolean {
  return DANGEROUS_PATTERN.test(content);
}

// Fast markdown renderer for basic content (no MDX, no math, no wiki links)
function renderFastMarkdown(source: string): string {
  let html = source
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/___(.+?)___/g, "<strong><em>$1</em></strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="text-sm bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 dark:text-blue-400 underline underline-offset-2">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '<div class="mb-4"></div>')
    .replace(/\n/g, "<br>");

  return html;
}

interface PreviewRef {
  updateSource: (src: string) => void;
}

interface PreviewProps {
  initialSource: string;
  onError?: (hasError: boolean) => void;
}

const Preview = forwardRef<PreviewRef, PreviewProps>(function Preview(
  { initialSource, onError },
  ref
) {
  const [compiledSource, setCompiledSource] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fastHtml, setFastHtml] = useState<string | null>(null);
  const [useFastMode, setUseFastMode] = useState(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const processSource = (source: string) => {
    // Cancel previous operations
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    if (abortController.current) {
      abortController.current.abort();
    }

    // Check if content needs full MDX serialization
    const needsFull = needsFullSerialization(source);

    if (!needsFull) {
      // Fast mode: render simple markdown immediately
      setUseFastMode(true);
      setError(null);
      setFastHtml(renderFastMarkdown(source));
      onError?.(false);
      return;
    }

    // Content has dangerous patterns, switch to full MDX mode with debounce
    setUseFastMode(false);
    setError(null);

    debounceTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      abortController.current = controller;

      try {
        const result = await serialize(source, {
          mdxOptions: {
            remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
            rehypePlugins: [rehypeKatex],
          },
        });

        if (!controller.signal.aborted) {
          setCompiledSource(result.compiledSource);
          onError?.(false);
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          setError(err);
          onError?.(true);
        }
      }
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  };

  // Initialize with initial source
  useEffect(() => {
    processSource(initialSource);
  }, []);

  // Expose updateSource to parent via ref
  useImperativeHandle(ref, () => ({
    updateSource: (src: string) => {
      processSource(src);
    },
  }));

  if (error) {
    return (
      <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50/50 dark:bg-red-950/10">
        <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
          Failed to render content
        </p>
        <details>
          <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300">
            Error details
          </summary>
          <pre className="mt-2 text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap font-mono">
            {error.message}
          </pre>
        </details>
      </div>
    );
  }

  // Fast mode: render simple HTML directly
  if (useFastMode && fastHtml) {
    return (
      <div className="markdown-content">
        <div dangerouslySetInnerHTML={{ __html: fastHtml }} />
      </div>
    );
  }

  // Full MDX mode
  if (!compiledSource) return <p className="text-zinc-400 text-sm">Rendering...</p>;

  const knownComponents: Record<string, any> = {
    DynamicAnimation: (props: any) => <DynamicAnimation {...props} />,
  };

  const components = new Proxy(knownComponents, {
    get(target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      // Return a placeholder for any unknown component instead of throwing
      return (props: any) => (
        <span className="text-xs text-amber-500 dark:text-amber-400 font-mono">
          &lt;{prop} /&gt;
        </span>
      );
    },
  });

  return (
    <div className="markdown-content">
      <MdxErrorBoundary key={compiledSource}>
        <MDXRemote compiledSource={compiledSource} scope={{}} frontmatter={{}} components={components} />
      </MdxErrorBoundary>
    </div>
  );
});

export default Preview;
