"use client";

import dynamic from "next/dynamic";
import type { MDXRemoteSerializeResult } from "next-mdx-remote";
import type { ComponentType } from "react";

const PendulumSim = dynamic(
  () => import("@/components/animations/PendulumSim"),
  {
    ssr: false,
    loading: () => null,
  }
);

const DoublePendulumSim = dynamic(
  () => import("@/components/animations/DoublePendulumSim"),
  {
    ssr: false,
    loading: () => null,
  }
);

const OrbitSim = dynamic(
  () => import("@/components/animations/OrbitSim"),
  {
    ssr: false,
    loading: () => null,
  }
);

const DynamicAnimation = dynamic(
  () => import("./DynamicAnimation"),
  {
    ssr: false,
    loading: () => null,
  }
);

const mdxComponents = {
  PendulumSim,
  DoublePendulumSim,
  OrbitSim,
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
