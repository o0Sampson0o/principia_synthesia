// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/** `@/db` is mocked: only the target parsing is under test, not the lookups. */
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));

import { parseEmbedTarget } from "@/lib/embed-resolve";

const HOME = { defaultPublisher: "alice" };

describe("parseEmbedTarget", () => {
  it("resolves a bare slug against the embedding article's publisher", () => {
    expect(parseEmbedTarget({ slug: "anim-orbit", ...HOME })).toEqual({
      publisherSlug: "alice",
      targetSlug: "anim-orbit",
      type: null,
      bookSlug: null,
    });
  });

  it("reads the wikilink address form, so another publisher's object can be named", () => {
    expect(parseEmbedTarget({ slug: "bob:objects:anim-orbit", ...HOME })).toEqual({
      publisherSlug: "bob",
      targetSlug: "anim-orbit",
      type: "objects",
      bookSlug: null,
    });
  });

  it("accepts the address with the brackets left on, as the copy button emits it", () => {
    expect(parseEmbedTarget({ slug: "[[bob:objects:anim-orbit]]", ...HOME })).toMatchObject({
      publisherSlug: "bob",
      targetSlug: "anim-orbit",
      type: "objects",
    });
  });

  it("ignores a label, which addresses nothing", () => {
    expect(parseEmbedTarget({ slug: "[[bob:articles:article-x|Some Title]]", ...HOME })).toMatchObject({
      publisherSlug: "bob",
      targetSlug: "article-x",
      type: "articles",
    });
  });

  it("points a book section at the section, scoped to its book", () => {
    expect(parseEmbedTarget({ slug: "bob:books:book-optics:chapter-one", ...HOME })).toEqual({
      publisherSlug: "bob",
      targetSlug: "chapter-one",
      type: "articles",
      bookSlug: "book-optics",
    });
  });

  it("keeps the publisher/slug shorthand working", () => {
    expect(parseEmbedTarget({ slug: "bob/anim-orbit", ...HOME })).toEqual({
      publisherSlug: "bob",
      targetSlug: "anim-orbit",
      type: null,
      bookSlug: null,
    });
  });

  it("lets an explicit publisher prop win over the one in the address", () => {
    expect(
      parseEmbedTarget({ slug: "bob:objects:anim-orbit", publisher: "carol", ...HOME })
    ).toMatchObject({ publisherSlug: "carol", targetSlug: "anim-orbit" });
  });

  it("treats a slug that only looks like an address as a plain slug", () => {
    // `widgets` is not one of the three addressable types.
    expect(parseEmbedTarget({ slug: "bob:widgets:thing", ...HOME })).toEqual({
      publisherSlug: "alice",
      targetSlug: "bob:widgets:thing",
      type: null,
      bookSlug: null,
    });
  });
});
