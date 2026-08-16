import type { ReactElement } from "react";
import { compileMDX } from "next-mdx-remote/rsc";
import * as Sentry from "@sentry/nextjs";
import { buildArticleComponents, buildArticleMdxOptions } from "@/lib/article-mdx";
import { describeMdxError } from "@/lib/mdx-error";
import type { ResolvedCitation } from "@/lib/remark-cite-numbering";
import MdxErrorBoundary from "./MdxErrorBoundary";
import MdxErrorNotice from "./MdxErrorNotice";

/**
 * The single entry point for rendering an article body on a published page.
 *
 * A malformed body is authored content, not an outage: one unbalanced `$$`
 * fence should cost the reader the prose, not the whole route. Before this
 * existed, `<MDXRemote>` threw straight out of the page's server render and
 * unwound to `app/[publisher]/error.tsx`, taking the masthead, the table of
 * contents, the comments and the book navigation down with it.
 *
 * `compileMDX` does its parse inside the `await` here, so a try/catch contains
 * compile failures deterministically. Everything that can still fail *after*
 * that — client components in the body, server components nested in the
 * compiled tree — stays covered by `<MdxErrorBoundary>`.
 */
export default async function ArticleBody({
  source,
  publisherSlug,
  cites,
  showDetails = false,
}: {
  /** The frontmatter-stripped body from `prepareArticleBody`. */
  source: string;
  /** Publisher the body's bare `<Embed slug="…" />` tags resolve against. */
  publisherSlug: string;
  cites: {
    slugToNumber: Map<string, number>;
    resolved: Map<string, ResolvedCitation>;
  };
  /** Surface the compiler's reason inline — editors only. */
  showDetails?: boolean;
}) {
  const options = buildArticleMdxOptions(cites);
  let content: ReactElement;

  try {
    ({ content } = await compileMDX({
      source,
      options,
      components: buildArticleComponents(publisherSlug),
    }));
  } catch (error) {
    // Report it — a body that stopped compiling is usually a regression in the
    // plugin chain, not just a typo, and nobody is watching the reader's screen.
    Sentry.captureException(error, {
      tags: { area: "mdx-compile" },
      extra: { publisherSlug },
    });
    const detail = await describeMdxError(error, source, options.mdxOptions);
    return <MdxErrorNotice detail={detail} showDetails={showDetails} />;
  }

  return (
    <MdxErrorBoundary showDetails={showDetails}>
      <div className="markdown-content">{content}</div>
    </MdxErrorBoundary>
  );
}
