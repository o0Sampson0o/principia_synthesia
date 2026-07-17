/**
 * Authored `#` headings inside article MDX render as <h2 class="md-h1">:
 * the page title stays the document's only <h1> (screen-reader heading
 * navigation depends on it), while .md-h1 preserves the h1 visual scale.
 */
export default function MdH1(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={["md-h1", props.className].filter(Boolean).join(" ")} />;
}
