"use client";

import type { MDXRemoteSerializeResult } from "next-mdx-remote";

// Import DynamicAnimation statically — it's a client component with iframe
import DynamicAnimation from "./DynamicAnimation";

export default function MDXWithAnimations({
  source,
  options,
}: {
  source: string;
  options?: any;
}) {
  // We need to pass DynamicAnimation as a component to MDXRemote
  // Since it uses iframe, we can create a wrapper
  const components: Record<string, any> = {
    DynamicAnimation: (props: any) => <DynamicAnimation {...props} />,
  };

  const MDXRemote = require("next-mdx-remote").MDXRemote;

  return (
    <div className="markdown-content">
      <MDXRemote source={source} components={components} options={options} />
    </div>
  );
}
