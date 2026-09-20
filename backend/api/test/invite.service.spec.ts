import { InviteService } from "../src/auth/invite.service";

describe("InviteService", () => {
  const owner = jest.fn().mockResolvedValue({ role: "OWNER" });
  const service = (extra: Record<string, unknown> = {}) => {
    const prisma: any = {
      workspaceMember: { findUnique: owner, findFirst: jest.fn() },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ id: "w1", name: "Produto" }),
      },
      workspaceInvite: {
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: "i1",
          role: "EDITOR",
          expiresAt: new Date(),
        }),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      ...extra,
    };
    prisma.$transaction = jest.fn(async (work: (tx: object) => unknown) =>
      work(prisma),
    );
    return new InviteService(
      prisma as never,
      { sendWorkspaceInvite: jest.fn().mockResolvedValue(undefined) } as never,
    );
  };
  it("does not allow OWNER in a new invite", async () =>
    await expect(
      service().create("u1", "w1", "person@example.com", "OWNER" as never),
    ).rejects.toThrow("EDITOR ou VIEWER"));
  it("checks membership and replaces pending invitations in one transaction", async () => {
    await expect(
      service().create("u1", "w1", "person@example.com", "EDITOR" as never),
    ).resolves.toEqual(expect.objectContaining({ id: "i1", role: "EDITOR" }));
  });
  it("does not disclose a valid invitation to a different verified account", async () => {
    const invites = service({
      workspaceInvite: {
        findFirst: jest.fn().mockResolvedValue({
          id: "i1",
          workspaceId: "w1",
          email: "invitee@example.com",
          acceptedAt: null,
        }),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    await expect(
      invites.accept("u2", "other@example.com", "raw-token"),
    ).rejects.toThrow("Não foi possível aceitar");
  });
  it("keeps acceptance idempotent after the invitation expiry", async () => {
    const invites = service({
      workspaceInvite: {
        findFirst: jest.fn().mockResolvedValue({
          id: "i1",
          workspaceId: "w1",
          email: "invitee@example.com",
          acceptedAt: new Date("2026-09-01"),
        }),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    await expect(
      invites.accept("u2", "invitee@example.com", "raw-token"),
    ).resolves.toEqual({ workspaceId: "w1", ok: true });
  });
});
