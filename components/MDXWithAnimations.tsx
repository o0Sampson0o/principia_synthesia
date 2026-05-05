"use client";

import type { MDXRemoteSerializeResult } from "next-mdx-remote";

export default function MDXWithAnimations({
  source,
  options,
}: {
  source: string;
  options?: any;
}) {
  const MDXRemote = require("next-mdx-remote").MDXRemote;

  return (
    <div className="markdown-content">
      <MDXRemote source={source} options={options} />
    </div>
  );
}
