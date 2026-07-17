/**
 * MDX heading components for article prose.
 *
 * MdH1: authored `#` headings render as <h2 class="md-h1"> so the page title
 * stays the document's only <h1> (screen-reader heading navigation depends on
 * it) while .md-h1 preserves the h1 visual scale.
 *
 * All levels append a quiet "§" self-link when rehype-slug has stamped an id,
 * so any section can be linked and cited. The anchor fades in on heading
 * hover/focus (see .md-anchor in globals.css).
 */

type HeadingProps = React.HTMLAttributes<HTMLHeadingElement>;

function Anchor({ id }: { id?: string }) {
  if (!id) return null;
  return (
    <a href={`#${id}`} className="md-anchor" aria-label="Link to this section">
      §
    </a>
  );
}

export function MdH1(props: HeadingProps) {
  const { children, className, ...rest } = props;
  return (
    <h2 {...rest} className={["md-h1", className].filter(Boolean).join(" ")}>
      {children}
      <Anchor id={props.id} />
    </h2>
  );
}

export function MdH2(props: HeadingProps) {
  const { children, ...rest } = props;
  return (
    <h3 {...rest} className="md-h2-demoted">
      {children}
      <Anchor id={props.id} />
    </h3>
  );
}

export function MdH3(props: HeadingProps) {
  const { children, ...rest } = props;
  return (
    <h4 {...rest} className="md-h3-demoted">
      {children}
      <Anchor id={props.id} />
    </h4>
  );
}
