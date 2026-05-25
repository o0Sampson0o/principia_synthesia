// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── DB mock ─────────────────────────────────────────────────────────────────

const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

const mockSelectFromWhereLimit = vi.hoisted(() => vi.fn());
const mockSelectFromWhere = vi.hoisted(() => vi.fn());
const mockSelectFrom = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    update: mockUpdate,
    select: mockSelect,
  },
}));

// ─── Auth mock ────────────────────────────────────────────────────────────────

const mockRequireSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  requireSession: mockRequireSession,
}));

// ─── next/cache mock ──────────────────────────────────────────────────────────

const mockRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

// ─── Drizzle-orm pass-through ─────────────────────────────────────────────────

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((...args) => actual.eq(...(args as Parameters<typeof actual.eq>))),
    and: vi.fn((...args) => actual.and(...(args as Parameters<typeof actual.and>))),
    isNull: vi.fn((...args) => actual.isNull(...(args as Parameters<typeof actual.isNull>))),
  };
});

import { markNotificationRead, markAllNotificationsRead } from "@/app/notifications/actions";
import { setupUpdateQueue } from "@/tests/helpers/drizzle-mocks";

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

describe("markNotificationRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({ userId: 5 });
  });

  it("marks notification read when it belongs to the current user", async () => {
    // select chain: db.select({...}).from(n).where(...).limit(1) → Promise<row[]>
    mockSelectFromWhereLimit.mockResolvedValue([{ id: 10, userId: 5 }]);
    mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    setupUpdateQueue(mockUpdate, mockUpdateSet, mockUpdateWhere);

    const fd = makeFormData({ notificationId: "10" });
    const result = await markNotificationRead(fd);

    expect(result).toBeUndefined();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ readAt: expect.any(Date) })
    );
  });

  it("throws Forbidden when notification belongs to another user", async () => {
    // select returns a notification owned by userId 99 (not the session user)
    mockSelectFromWhereLimit.mockResolvedValue([{ id: 10, userId: 99 }]);
    mockSelectFromWhere.mockReturnValue({ limit: mockSelectFromWhereLimit });
    mockSelectFrom.mockReturnValue({ where: mockSelectFromWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });

    // update should NOT be called since we throw before it
    setupUpdateQueue(mockUpdate, mockUpdateSet, mockUpdateWhere);

    const fd = makeFormData({ notificationId: "10" });
    await expect(markNotificationRead(fd)).rejects.toThrow("Forbidden");
  });
});

describe("markAllNotificationsRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({ userId: 5 });
    setupUpdateQueue(mockUpdate, mockUpdateSet, mockUpdateWhere);
  });

  it("updates all unread notifications for the session user", async () => {
    const result = await markAllNotificationsRead();

    expect(result).toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ readAt: expect.any(Date) })
    );
  });
});
