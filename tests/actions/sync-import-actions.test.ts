// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockInnerJoin = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());
const mockOrderBy = vi.hoisted(() => vi.fn());

const mockUpdate = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateSetWhere = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
}));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col, val) => ({ _type: "eq", col, val })),
    asc: vi.fn((col) => ({ _type: "asc", col })),
  };
});

import { importSyncBundle } from "@/app/admin/curriculum/[book]/sync/actions";

function setupSelect(rows: unknown[]) {
  mockOrderBy.mockResolvedValue(rows);
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockFrom.mockReturnValue({ innerJoin: mockInnerJoin });
  mockSelect.mockReturnValue({ from: mockFrom });
}

function setupUpdate() {
  mockUpdateSetWhere.mockResolvedValue(undefined);
  mockUpdateSet.mockReturnValue({ where: mockUpdateSetWhere });
  mockUpdate.mockReturnValue({ set: mockUpdateSet });
}

async function makeZipFile(opts: {
  bookSlug: string;
  bookTitle?: string;
  chapters: Array<{
    slug: string;
    title?: string;
    updatedAt: string;
    content?: string;
    omitMdx?: boolean;
  }>;
}): Promise<File> {
  const zip = new JSZip();
  const folder = zip.folder("chapters")!;
  const manifestChapters = opts.chapters.map((c, i) => ({
    slug: c.slug,
    title: c.title ?? c.slug,
    partTitle: null,
    position: i,
    isInternal: false,
    updatedAt: c.updatedAt,
  }));
  for (const c of opts.chapters) {
    if (!c.omitMdx) folder.file(`${c.slug}.mdx`, c.content ?? `# ${c.slug}`);
  }
  zip.file(
    "book.json",
    JSON.stringify({
      bookSlug: opts.bookSlug,
      bookTitle: opts.bookTitle ?? "Book",
      exportedAt: new Date().toISOString(),
      chapters: manifestChapters,
    })
  );
  const buf = await zip.generateAsync({ type: "uint8array" });
  return new File([buf], "bundle.zip", { type: "application/zip" });
}

function makeFormData(file: File): FormData {
  const fd = new FormData();
  fd.append("bundle", file);
  return fd;
}

describe("importSyncBundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ userId: 1, email: "a@x", isAdmin: true });
    setupUpdate();
  });

  it("returns Unauthorized when no admin session", async () => {
    mockGetSession.mockResolvedValue(null);
    const file = await makeZipFile({ bookSlug: "b", chapters: [] });
    const res = await importSyncBundle("b", null, makeFormData(file));
    expect(res).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("rejects when bookSlug in zip does not match URL", async () => {
    const file = await makeZipFile({ bookSlug: "wrong", chapters: [] });
    setupSelect([]);
    const res = await importSyncBundle("right", null, makeFormData(file));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/mismatch/);
  });

  it("updates content when zip updatedAt is newer than DB", async () => {
    const dbDate = new Date("2026-01-01T00:00:00.000Z");
    const zipDate = new Date("2026-02-01T00:00:00.000Z").toISOString();

    setupSelect([
      { id: 1, slug: "intro", isInternal: false, parentBookSlug: null, updatedAt: dbDate },
    ]);

    const file = await makeZipFile({
      bookSlug: "b",
      chapters: [{ slug: "intro", updatedAt: zipDate, content: "# new" }],
    });

    const res = await importSyncBundle("b", null, makeFormData(file));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.updated).toEqual(["intro"]);
      expect(res.skipped).toEqual([]);
    }
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ content: "# new" })
    );
  });

  it("skips chapters when DB updatedAt is newer", async () => {
    const dbDate = new Date("2026-03-01T00:00:00.000Z");
    const zipDate = new Date("2026-01-01T00:00:00.000Z").toISOString();

    setupSelect([
      { id: 1, slug: "intro", isInternal: false, parentBookSlug: null, updatedAt: dbDate },
    ]);

    const file = await makeZipFile({
      bookSlug: "b",
      chapters: [{ slug: "intro", updatedAt: zipDate, content: "# old" }],
    });

    const res = await importSyncBundle("b", null, makeFormData(file));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.updated).toEqual([]);
      expect(res.skipped).toEqual([{ slug: "intro", reason: "db-newer" }]);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips chapters not present in DB (unknown-slug)", async () => {
    setupSelect([]); // no DB rows
    const file = await makeZipFile({
      bookSlug: "b",
      chapters: [
        { slug: "stranger", updatedAt: new Date().toISOString() },
      ],
    });
    const res = await importSyncBundle("b", null, makeFormData(file));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.updated).toEqual([]);
      expect(res.skipped).toEqual([
        { slug: "stranger", reason: "unknown-slug" },
      ]);
    }
  });

  it("skips chapters whose .mdx file is missing from the zip", async () => {
    setupSelect([
      {
        id: 1,
        slug: "intro",
        isInternal: false,
        parentBookSlug: null,
        updatedAt: new Date(0),
      },
    ]);
    const file = await makeZipFile({
      bookSlug: "b",
      chapters: [
        { slug: "intro", updatedAt: new Date().toISOString(), omitMdx: true },
      ],
    });
    const res = await importSyncBundle("b", null, makeFormData(file));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.skipped).toEqual([
        { slug: "intro", reason: "missing-mdx-file" },
      ]);
    }
  });

  it("returns error when book.json is missing", async () => {
    const zip = new JSZip();
    zip.folder("chapters")!.file("foo.mdx", "x");
    const buf = await zip.generateAsync({ type: "uint8array" });
    const file = new File([buf], "b.zip", { type: "application/zip" });
    const res = await importSyncBundle("b", null, makeFormData(file));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/book\.json/);
  });

  it("returns error when zip is invalid", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "bad.zip", {
      type: "application/zip",
    });
    const res = await importSyncBundle("b", null, makeFormData(file));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Invalid zip/);
  });

  it("returns error when no file is supplied", async () => {
    const fd = new FormData();
    const res = await importSyncBundle("b", null, fd);
    expect(res.ok).toBe(false);
  });
});
