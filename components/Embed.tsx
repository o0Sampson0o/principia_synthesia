import { resolveEmbed, type EmbedTarget } from "@/lib/embed-resolve";
import EmbedBody, { EmbedMissing } from "@/components/EmbedBody";

export type EmbedProps = EmbedTarget;

/**
 * `<Embed slug="…" />` — render another piece of this site's content in place.
 *
 * One tag for everything embeddable, rather than a component per type: the
 * author names what they want and the target's own type decides how it draws.
 * An animation renders as its canvas, a dataset as its table, a diagram as its
 * diagram — all through `<ObjectRender>`, the same code the object's own page
 * uses.
 *
 * An article embeds as a card linking to it, not as inlined prose. Splicing one
 * article's body into another would double its headings in the table of
 * contents and make citation numbering ambiguous; a card is the honest form of
 * "this article is relevant here". Quote the passage, or use a `[[wikilink]]`,
 * when you want the words themselves.
 */
export default async function Embed({ slug, publisher, defaultPublisher }: EmbedProps) {
  const embed = await resolveEmbed({ slug, publisher, defaultPublisher });
  if (!embed) return <EmbedMissing slug={slug} />;
  return <EmbedBody embed={embed} />;
}
