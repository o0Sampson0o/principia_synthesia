"use client";

import { useState, useEffect } from "react";
import { serialize } from "next-mdx-remote/serialize";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import "katex/dist/katex.min.css";
import MDXWithAnimations from "@/components/MDXWithAnimations";

export default function Preview({ source }: { source: string }) {
  const [serialized, setSerialized] = useState<any>(null);

  useEffect(() => {
    serialize(source, {
      mdxOptions: {
        remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
        rehypePlugins: [rehypeKatex],
      },
    }).then(setSerialized);
  }, [source]);

  if (!serialized) return <p className="text-zinc-400 text-sm">Rendering...</p>;

  return (
    <div className="markdown-content">
      <MDXWithAnimations
        source={source}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
            rehypePlugins: [rehypeKatex],
          },
        }}
      />
    </div>
  );
}
