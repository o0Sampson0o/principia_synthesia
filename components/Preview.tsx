"use client";

import { useState, useEffect } from "react";
import { MDXRemote, type MDXRemoteSerializeResult } from "next-mdx-remote";
import { serialize } from "next-mdx-remote/serialize";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { remarkWikilinks } from "@/lib/remark-wikilinks";
import "katex/dist/katex.min.css";

export default function Preview({ source }: { source: string }) {
  const [mdx, setMdx] = useState<MDXRemoteSerializeResult | null>(null);

  useEffect(() => {
    serialize(source, {
      mdxOptions: {
        remarkPlugins: [remarkMath, remarkGfm, remarkWikilinks],
        rehypePlugins: [rehypeKatex],
      },
    }).then(setMdx);
  }, [source]);

  if (!mdx) return <p className="text-gray-400 text-sm">Rendering...</p>;

  return <div className="markdown-content"><MDXRemote {...mdx} /></div>;
}
