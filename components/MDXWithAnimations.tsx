"use client";

import dynamic from "next/dynamic";
import type { MDXRemoteSerializeResult } from "next-mdx-remote";
import type { ComponentType } from "react";

const DynamicAnimation = dynamic(
  () => import("./DynamicAnimation"),
  {
    ssr: false,
    loading: () => null,
  }
);

const mdxComponents = {
  DynamicAnimation,
};

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
      <MDXRemote source={source} components={mdxComponents} options={options} />
    </div>
  );
}
