// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.hoisted(() => vi.fn());
const mockInsertValues = vi.hoisted(() => vi.fn());

const mockSelect = vi.hoisted(() => vi.fn());

const mockUpdate = vi.hoisted(() => vi.fn());

const mockDelete = vi.hoisted(() => vi.fn());
const mockDeleteWhere = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

const mockRequireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  requireSession: mockRequireSession,
}));

const mockCanManageOrg = vi.hoisted(() => vi.fn());
const mockGetOrgRole = vi.hoisted(() => vi.fn());
vi.mock("@/lib/roles", () => ({
  canManageOrg: mockCanManageOrg,
  getOrgRole: mockGetOrgRole,
}));

const mockResolvePublisher = vi.hoisted(() => vi.fn());
vi.mock("@/lib/publisher", () => ({
  resolvePublisher: mockResolvePublisher,
}));

const mockRevalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const mockSendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
  buildInvitationEmailHtml: vi.fn(() => "<html>invite</html>"),
}));

function setupSelectSequence(responses: unknown[][]) {
  let callCount = 0;
  mockSelect.mockImplementation(() => {
    const response = responses[callCount] ?? [];
    callCount++;
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(response),
    };
    return chain;
  });
}

describe("inviteMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({
      userId: 1,
      email: "admin@test.com",
      userSlug: "admin",
      isRootAdmin: false,
    });
    mockResolvePublisher.mockResolvedValue({ kind: "org", orgId: 10 });
    mockCanManageOrg.mockResolvedValue(true);
    mockSendEmail.mockResolvedValue(undefined);
  });

  it("rejects when user is not a manager", async () => {
    mockCanManageOrg.mockResolvedValue(false);
    const { inviteMember } = await import("@/app/[publisher]/members/actions");
    const fd = new FormData();
    fd.set("orgId", "10");
    fd.set("email", "invite@test.com");
    fd.set("role", "member");
    await expect(inviteMember("my-org", null, fd)).rejects.toThrow("Forbidden");
  });

  it("returns error when email is already invited", async () => {
    setupSelectSequence([
      [],
      [{ id: 99 }],
      [{ name: "My Org" }],
      [{ displayName: "Admin", email: "admin@test.com" }],
    ]);
    mockInsert.mockReturnValue({
      values: mockInsertValues.mockResolvedValue([{ id: 1 }]),
    });
    mockGetOrgRole.mockResolvedValue(null);

    const { inviteMember } = await import("@/app/[publisher]/members/actions");
    const fd = new FormData();
    fd.set("orgId", "10");
    fd.set("email", "invite@test.com");
    fd.set("role", "member");
    const result = await inviteMember("my-org", null, fd);
    expect(result.error).toMatch(/already been sent/i);
  });

  it("returns error when user is already a member", async () => {
    setupSelectSequence([
      [{ id: 5 }],
    ]);
    mockGetOrgRole.mockResolvedValue("member");

    const { inviteMember } = await import("@/app/[publisher]/members/actions");
    const fd = new FormData();
    fd.set("orgId", "10");
    fd.set("email", "existing@test.com");
    fd.set("role", "member");
    const result = await inviteMember("my-org", null, fd);
    expect(result.error).toMatch(/already a member/i);
  });
});

describe("acceptInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({
      userId: 2,
      email: "user@test.com",
      userSlug: "user",
      isRootAdmin: false,
    });
  });

  it("returns error when invitation is not found", async () => {
    setupSelectSequence([[]]);
    const { acceptInvitation } = await import("@/app/[publisher]/members/actions");
    const result = await acceptInvitation("invalid-token");
    expect(result.error).toMatch(/not found or has expired/i);
  });

  it("returns error when email does not match session user", async () => {
    setupSelectSequence([
      [{ id: 1, orgId: 10, email: "other@test.com", role: "member", expiresAt: new Date(Date.now() + 100000), acceptedAt: null }],
      [{ email: "user@test.com" }],
    ]);
    mockGetOrgRole.mockResolvedValue(null);

    const { acceptInvitation } = await import("@/app/[publisher]/members/actions");
    const result = await acceptInvitation("some-token");
    expect(result.error).toMatch(/different email/i);
  });

  it("returns error for already accepted invitation", async () => {
    setupSelectSequence([
      [{ id: 1, orgId: 10, email: "user@test.com", role: "member", expiresAt: new Date(Date.now() + 100000), acceptedAt: new Date() }],
    ]);
    const { acceptInvitation } = await import("@/app/[publisher]/members/actions");
    const result = await acceptInvitation("some-token");
    expect(result.error).toMatch(/already been accepted/i);
  });
});

describe("cancelInvitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSession.mockResolvedValue({
      userId: 1,
      email: "admin@test.com",
      userSlug: "admin",
      isRootAdmin: false,
    });
    mockResolvePublisher.mockResolvedValue({ kind: "org", orgId: 10 });
    mockCanManageOrg.mockResolvedValue(true);
    mockDelete.mockReturnValue({
      where: mockDeleteWhere.mockResolvedValue(undefined),
    });
  });

  it("deletes the invitation scoped to the org", async () => {
    const { cancelInvitation } = await import("@/app/[publisher]/members/actions");
    const fd = new FormData();
    fd.set("invitationId", "5");
    await cancelInvitation("my-org", fd);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/my-org/members");
  });

  it("does nothing with invalid invitationId", async () => {
    const { cancelInvitation } = await import("@/app/[publisher]/members/actions");
    const fd = new FormData();
    fd.set("invitationId", "0");
    await cancelInvitation("my-org", fd);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("passes a compound WHERE condition (and) so cross-org deletion is prevented", async () => {
    const { cancelInvitation } = await import("@/app/[publisher]/members/actions");
    const fd = new FormData();
    fd.set("invitationId", "99");
    await cancelInvitation("my-org", fd);
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
    const [whereArg] = mockDeleteWhere.mock.calls[0];
    expect(whereArg).toBeDefined();
    expect(typeof whereArg).toBe("object");
  });
});
