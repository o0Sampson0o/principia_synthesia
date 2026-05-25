// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockSelect = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockSelectLimit = vi.hoisted(() => vi.fn());

const mockInsert = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertReturning = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

// ─── Notifications mock ────────────────────────────────────────────────────────

const mockNotify = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notifications", () => ({
  notify: mockNotify,
}));

import { seedOnboardingArticle } from "@/lib/onboarding-seed";

function setupSelectChain(...results: unknown[][]) {
  let call = 0;
  mockSelect.mockImplementation(() => ({ from: mockSelectFrom }));
  mockSelectFrom.mockImplementation(() => ({ where: mockSelectWhere }));
  mockSelectWhere.mockImplementation(() => ({ limit: mockSelectLimit }));
  mockSelectLimit.mockImplementation(() => Promise.resolve(results[call++] ?? []));
}

describe("seedOnboardingArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsertReturning.mockResolvedValue([{ id: 42 }]);
    mockNotify.mockResolvedValue(undefined);
  });

  it("inserts article, visibility row, and notification when user has no articles", async () => {
    setupSelectChain(
      [{ id: 7, publisherSlug: "alice" }], // user lookup
      [],                                   // existingAny (no articles)
      [],                                   // existingSlug
    );

    await seedOnboardingArticle(7);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      7,
      "onboarding_example_article",
      expect.objectContaining({
        articleId: 42,
        publisherSlug: "alice",
        slug: "article-welcome-to-principia",
        title: "Welcome to Principia Synthesia",
      }),
    );
  });

  it("returns early without inserts when user already has articles", async () => {
    setupSelectChain(
      [{ id: 7, publisherSlug: "alice" }], // user lookup
      [{ id: 99 }],                         // existingAny — user has articles
    );

    await seedOnboardingArticle(7);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("returns early without inserts when welcome slug already exists", async () => {
    setupSelectChain(
      [{ id: 7, publisherSlug: "alice" }], // user lookup
      [],                                   // existingAny — no articles by general check
      [{ id: 55 }],                         // existingSlug — slug already exists
    );

    await seedOnboardingArticle(7);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("returns early without inserts when user row is not found", async () => {
    setupSelectChain(
      [], // user lookup returns nothing
    );

    await seedOnboardingArticle(999);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("notification payload includes correct type", async () => {
    setupSelectChain(
      [{ id: 7, publisherSlug: "bob" }],
      [],
      [],
    );

    await seedOnboardingArticle(7);

    const [userId, type] = mockNotify.mock.calls[0];
    expect(userId).toBe(7);
    expect(type).toBe("onboarding_example_article");
  });
});
