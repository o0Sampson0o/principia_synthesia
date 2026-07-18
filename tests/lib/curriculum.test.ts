// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────
// withDividerTitles issues: db.select({...}).from().where().orderBy() → rows

const mockSelect = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: { select: mockSelect } }));

// Pass real eq/and/isNull/asc through so query builders don't crash.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual };
});

import { withDividerTitles } from "@/lib/curriculum";

/** Chain: .from().where().orderBy() resolving to `rows`. */
function dividersResolving(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from };
}

type Section = {
  position: number;
  articleSlug: string;
  partTitle: string | null;
  chapterTitle: string | null;
};

function section(position: number, slug: string): Section {
  return { position, articleSlug: slug, partTitle: null, chapterTitle: null };
}

describe("withDividerTitles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns sections unchanged when there are no dividers", async () => {
    mockSelect.mockReturnValueOnce(dividersResolving([]));
    const sections = [section(0, "article-a"), section(1, "article-b")];
    const out = await withDividerTitles(sections, 1);
    expect(out).toEqual(sections);
  });

  it("folds a 'part' divider onto the first following section's partTitle", async () => {
    mockSelect.mockReturnValueOnce(
      dividersResolving([{ position: 0, partTitle: "Part I", dividerLevel: "part" }])
    );
    const sections = [section(1, "article-a"), section(2, "article-b")];
    const out = await withDividerTitles(sections, 1);
    expect(out[0].partTitle).toBe("Part I");
    expect(out[1].partTitle).toBeNull();
  });

  it("folds a 'chapter' divider onto the first following section's chapterTitle", async () => {
    mockSelect.mockReturnValueOnce(
      dividersResolving([{ position: 0, partTitle: "Chapter 1", dividerLevel: "chapter" }])
    );
    const sections = [section(1, "article-a"), section(2, "article-b")];
    const out = await withDividerTitles(sections, 1);
    expect(out[0].chapterTitle).toBe("Chapter 1");
    expect(out[0].partTitle).toBeNull();
    expect(out[1].chapterTitle).toBeNull();
  });

  it("folds both levels onto the same section (part then chapter dividers)", async () => {
    mockSelect.mockReturnValueOnce(
      dividersResolving([
        { position: 0, partTitle: "Part I", dividerLevel: "part" },
        { position: 1, partTitle: "Chapter 1", dividerLevel: "chapter" },
      ])
    );
    const sections = [section(2, "article-a"), section(3, "article-b")];
    const out = await withDividerTitles(sections, 1);
    expect(out[0].partTitle).toBe("Part I");
    expect(out[0].chapterTitle).toBe("Chapter 1");
  });

  it("treats a legacy NULL dividerLevel as a part", async () => {
    mockSelect.mockReturnValueOnce(
      dividersResolving([{ position: 0, partTitle: "Legacy Part", dividerLevel: null }])
    );
    const sections = [section(1, "article-a")];
    const out = await withDividerTitles(sections, 1);
    expect(out[0].partTitle).toBe("Legacy Part");
  });
});
