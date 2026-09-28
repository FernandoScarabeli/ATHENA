import { BadRequestException } from "@nestjs/common";
import * as argon2 from "argon2";
import { AuthService } from "../src/auth/auth.service";
import { resetCodeDigest, tokenDigest } from "../src/auth/auth.utils";

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

  it("sends a six-digit reset code only for a verified account and stores a keyed digest", async () => {
    const previousSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = "test-access-secret";
    try {
      const create = jest.fn().mockResolvedValue(undefined);
      const sendPasswordResetCode = jest.fn().mockResolvedValue(undefined);
      const service = createService({
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: "u1",
            email: "person@example.com",
            verifiedAt: new Date(),
          }),
        },
        passwordResetToken: {
          create,
        },
      });
      (service as unknown as { mail: unknown }).mail = {
        sendPasswordResetCode,
      };

      await service.requestReset(" Person@Example.com ", "127.0.0.1");

      const [, code, resetId] = sendPasswordResetCode.mock.calls[0];
      expect(code).toMatch(/^\d{6}$/);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: resetId,
          userId: "u1",
          tokenHash: resetCodeDigest(resetId, "u1", code),
          expiresAt: expect.any(Date),
        }),
      });
      const resetData = create.mock.calls[0][0].data;
      expect(resetData.expiresAt.getTime() - resetData.createdAt.getTime()).toBe(
        10 * 60_000,
      );
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("keeps reset requests indistinguishable for unknown accounts", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const sendPasswordResetCode = jest.fn();
    const service = createService({
      user: { findUnique },
      passwordResetToken: { updateMany: jest.fn(), create: jest.fn() },
    });
    (service as unknown as { mail: unknown }).mail = {
      sendPasswordResetCode,
    };

    await expect(
      service.requestReset("missing@example.com", "127.0.0.1"),
    ).resolves.toBeUndefined();
    expect(sendPasswordResetCode).not.toHaveBeenCalled();
  });

  it("rejects invalid or expired reset codes before validating a new password", async () => {
    const previousSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = "test-access-secret";
    try {
      const passwords = { validate: jest.fn() };
      const rateLimit = { check: jest.fn().mockResolvedValue(undefined) };
      const findFirst = jest.fn().mockResolvedValue({
        id: "reset-1",
        userId: "u1",
        tokenHash: resetCodeDigest("reset-1", "u1", "654321"),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const service = new AuthService(
        {
          user: { findUnique: jest.fn().mockResolvedValue({ id: "u1" }) },
          passwordResetToken: { findFirst },
        } as never,
        { sign: jest.fn() } as never,
        passwords as never,
        rateLimit as never,
        {} as never,
      );

      await expect(
        service.resetWithCode(
          "person@example.com",
          "123456",
          "uma-senha-longa-123",
          "127.0.0.1",
        ),
      ).rejects.toThrow("Código inválido ou expirado.");
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "u1",
            usedAt: null,
            expiresAt: { gt: expect.any(Date) },
          }),
        }),
      );
      expect(rateLimit.check).toHaveBeenCalledWith(
        "person@example.com",
        "127.0.0.1",
        "reset-password-code",
      );
      expect(passwords.validate).not.toHaveBeenCalled();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = previousSecret;
    }
  });

  it("consumes a valid reset code once, changes the password and revokes sessions", async () => {
    const previousSecret = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = "test-access-secret";
    const hashSpy = jest.spyOn(argon2, "hash").mockResolvedValue("new-hash");
    try {
      const now = new Date();
      const reset = {
        id: "reset-1",
        userId: "u1",
        tokenHash: resetCodeDigest("reset-1", "u1", "012345"),
        expiresAt: new Date(now.getTime() + 60_000),
      };
      const tokenUpdate = jest.fn().mockResolvedValue({ count: 1 });
      const userUpdate = jest.fn().mockResolvedValue(undefined);
      const sessionsUpdate = jest.fn().mockResolvedValue({ count: 2 });
      const transaction = jest.fn(async (work: (tx: object) => unknown) =>
        work({
          passwordResetToken: { updateMany: tokenUpdate },
          user: { update: userUpdate },
          authSession: { updateMany: sessionsUpdate },
        }),
      );
      const service = new AuthService(
        {
          user: { findUnique: jest.fn().mockResolvedValue({ id: "u1" }) },
          passwordResetToken: { findFirst: jest.fn().mockResolvedValue(reset) },
          $transaction: transaction,
        } as never,
        { sign: jest.fn() } as never,
        { validate: jest.fn().mockResolvedValue(undefined) } as never,
        { check: jest.fn().mockResolvedValue(undefined) } as never,
        {} as never,
      );

      await expect(
        service.resetWithCode(
          " Person@Example.com ",
          "012345",
          "uma-senha-longa-123",
          "127.0.0.1",
        ),
      ).resolves.toBeUndefined();

      expect(tokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "reset-1", userId: "u1" }),
          data: { usedAt: expect.any(Date) },
        }),
      );
      expect(tokenUpdate).toHaveBeenCalledWith({
        where: { userId: "u1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { passwordHash: "new-hash" },
      });
      expect(sessionsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    } finally {
      hashSpy.mockRestore();
      if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = previousSecret;
    }
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
