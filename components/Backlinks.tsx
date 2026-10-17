import Link from "next/link";
import { getBacklinks, type BacklinkTarget } from "@/lib/backlinks";

/**
 * "Linked from": the public pages whose wikilinks point here — what turns a set
 * of articles into a wiki you can walk both ways. Renders nothing when no page
 * links in, so a new article carries no empty section.
 */
export default async function Backlinks({ target }: { target: BacklinkTarget }) {
  const links = await getBacklinks(target);
  if (links.length === 0) return null;

  return (
    <section className="ps-backlinks ps-no-print" aria-labelledby="backlinks-heading">
      <h2 id="backlinks-heading" className="ps-backlinks-heading">
        Linked from <span className="ps-mono-meta themed-muted">{links.length}</span>
      </h2>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="ps-backlinks-link">
              <span className="ps-backlinks-title">{l.title}</span>
              {l.bookTitle && <span className="ps-backlinks-context">{l.bookTitle}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
