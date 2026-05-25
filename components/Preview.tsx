"use client";

import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { previewMdx } from "@/app/[publisher]/articles/actions";

// Dangerous patterns that require full server-side MDX compilation
const DANGEROUS_PATTERN = /[<>{}$\\\[\]`]|```/;

function needsFullSerialization(content: string): boolean {
  return DANGEROUS_PATTERN.test(content);
}

// Fast markdown renderer for basic content (no MDX, no math, no wiki links)
function renderFastMarkdown(source: string): string {
  const html = source
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
    .replace(/`([^`]+)`/g, '<code class="themed-inline-code text-sm">$1</code>')
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
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
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

    // Check if content needs full server-side MDX compilation
    const needsFull = needsFullSerialization(source);

    if (!needsFull) {
      // Fast mode: render simple markdown immediately
      setUseFastMode(true);
      setError(null);
      setFastHtml(renderFastMarkdown(source));
      onError?.(false);
      return;
    }

    // Content has MDX/math/code — compile server-side with debounce
    setUseFastMode(false);
    setError(null);

    debounceTimer.current = setTimeout(async () => {
      const controller = new AbortController();
      abortController.current = controller;

      try {
        const result = await previewMdx(source);

        if (!controller.signal.aborted) {
          if ("error" in result) {
            setError(new Error(result.error));
            onError?.(true);
          } else {
            setPreviewHtml(result.html);
            onError?.(false);
          }
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error(String(err)));
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

  // Intentionally runs once on mount — initialSource is the seed value only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { processSource(initialSource); }, []);

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
          <summary className="text-xs themed-muted cursor-pointer themed-hover-foreground">
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

  // Full MDX mode — server-rendered HTML, no new Function() in the browser
  if (!previewHtml) return <p className="themed-muted text-sm">Rendering...</p>;

  return (
    <div className="markdown-content">
      <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
    </div>
  );
});

export default Preview;
