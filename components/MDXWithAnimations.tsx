"use client";

import dynamic from "next/dynamic";
import type { MDXRemoteSerializeResult } from "next-mdx-remote";
import type { ComponentType } from "react";

// DynamicAnimation is loaded via dynamic import
// We need to pass it as a component, not a dynamic wrapper
const DynamicAnimation = dynamic(
  () => import("./DynamicAnimation").then(mod => {
    // Return a component that renders the default export
    return function DynamicAnimationWrapper(props: any) {
      const Component = mod.default;
      if (!Component) return null;
      return <Component {...props} />;
    };
  }),
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
