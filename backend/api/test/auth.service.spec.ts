import { BadRequestException } from "@nestjs/common";
import { AuthService } from "../src/auth/auth.service";
import { tokenDigest } from "../src/auth/auth.utils";

describe("AuthService token safety", () => {
  const createService = (prisma: object) =>
    new AuthService(
      prisma as never,
      { sign: jest.fn() } as never,
      { validate: jest.fn().mockResolvedValue(undefined) } as never,
      { check: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
    );

  it("only revokes the session represented by the full refresh cookie", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = createService({ authSession: { updateMany } });
    await service.logout("session-1.refresh-secret");
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "session-1",
          refreshHash: tokenDigest("refresh-secret"),
          revokedAt: null,
        },
      }),
    );
    await service.logout("session-1");
    expect(updateMany).toHaveBeenCalledTimes(1);
    await service.logout("session-1.refresh-secret.untrusted-suffix");
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("rotates a valid refresh token and rejects reuse of a revoked one", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue(undefined);
    const findFirst = jest.fn().mockResolvedValue({
      id: "session-1",
      persistent: true,
      user: { id: "u1", email: "person@example.com", name: "Pessoa" },
    });
    const transaction = jest.fn(async (work: (tx: object) => unknown) =>
      work({ authSession: { findFirst, updateMany, create } }),
    );
    const service = new AuthService(
      { $transaction: transaction } as never,
      { sign: jest.fn().mockReturnValue("new-access") } as never,
      { validate: jest.fn() } as never,
      { check: jest.fn() } as never,
      {} as never,
    );

    await expect(service.refresh("session-1.refresh-secret")).resolves.toEqual(
      expect.objectContaining({ access: "new-access", persistent: true }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "session-1",
          refreshHash: tokenDigest("refresh-secret"),
          revokedAt: null,
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", persistent: true }),
      }),
    );

    findFirst.mockResolvedValueOnce(null);
    await expect(service.refresh("session-1.refresh-secret")).rejects.toThrow(
      "Sessão expirada.",
    );
  });

  it("does not change a password when another request already consumed the reset token", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const userUpdate = jest.fn();
    const sessionsUpdate = jest.fn();
    const transaction = jest.fn(async (work: (tx: object) => unknown) =>
      work({
        passwordResetToken: { updateMany },
        user: { update: userUpdate },
        authSession: { updateMany: sessionsUpdate },
      }),
    );
    const service = createService({
      passwordResetToken: {
        findFirst: jest.fn().mockResolvedValue({ id: "reset-1", userId: "u1" }),
      },
      $transaction: transaction,
    });
    await expect(
      service.reset("raw-reset-token", "senha-segura-123"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionsUpdate).not.toHaveBeenCalled();
  });

  it("records legal acceptance and sends only a hashed verification token on registration", async () => {
    const createUser = jest.fn().mockResolvedValue({
      id: "u1",
      email: "person@example.com",
      name: "Pessoa",
    });
    const createVerification = jest.fn().mockResolvedValue(undefined);
    const sendVerification = jest.fn().mockResolvedValue(undefined);
    const passwords = { validate: jest.fn().mockResolvedValue(undefined) };
    const rateLimit = { check: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: createUser,
        },
        emailVerificationToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: createVerification,
        },
      } as never,
      { sign: jest.fn() } as never,
      passwords as never,
      rateLimit as never,
      { sendVerification } as never,
    );

    await service.register(
      " Person@Example.com ",
      " Pessoa ",
      "senha-segura-123",
      true,
      "127.0.0.1",
      "/onboarding",
    );

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "person@example.com",
          name: "Pessoa",
          legalAcceptances: {
            create: expect.objectContaining({ origin: "127.0.0.1" }),
          },
        }),
      }),
    );
    expect(createVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          returnTo: "/onboarding",
        }),
      }),
    );
    expect(sendVerification).toHaveBeenCalledWith(
      "person@example.com",
      expect.any(String),
    );
  });
});
