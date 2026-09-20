import { UnauthorizedException } from "@nestjs/common";
import { AuthController } from "../src/auth/auth.controller";
import { JwtCookieGuard } from "../src/common/auth";

describe("AuthController cookies", () => {
  const response = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
  it("issues a session refresh cookie without maxAge when the device is not remembered", async () => {
    const auth = {
      validateLogin: jest
        .fn()
        .mockResolvedValue({
          id: "u1",
          name: "Pessoa",
          email: "person@example.com",
        }),
      session: jest
        .fn()
        .mockResolvedValue({
          access: "access",
          refresh: "s.secret",
          persistent: false,
        }),
    };
    const controller = new AuthController(auth as never, {} as never);
    const res = response();
    await expect(
      controller.login(
        { email: "person@example.com", password: "secret", remember: false },
        { ip: "127.0.0.1" } as never,
        res as never,
      ),
    ).resolves.toMatchObject({ id: "u1" });
    expect(res.cookie).toHaveBeenNthCalledWith(
      1,
      "athena_access",
      "access",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        maxAge: 900000,
      }),
    );
    expect(res.cookie).toHaveBeenNthCalledWith(
      2,
      "athena_refresh",
      "s.secret",
      expect.not.objectContaining({ maxAge: expect.anything() }),
    );
  });
  it("uses a 30-day maxAge for a remembered device", async () => {
    const auth = {
      validateLogin: jest
        .fn()
        .mockResolvedValue({
          id: "u1",
          name: "Pessoa",
          email: "person@example.com",
        }),
      session: jest
        .fn()
        .mockResolvedValue({
          access: "access",
          refresh: "s.secret",
          persistent: true,
        }),
    };
    const controller = new AuthController(auth as never, {} as never);
    const res = response();
    await controller.login(
      { email: "person@example.com", password: "secret", remember: true },
      { ip: "127.0.0.1" } as never,
      res as never,
    );
    expect(res.cookie).toHaveBeenLastCalledWith(
      "athena_refresh",
      "s.secret",
      expect.objectContaining({ maxAge: 2592000000 }),
    );
  });
});

describe("JwtCookieGuard", () => {
  const context = (request: object) => ({
    switchToHttp: () => ({ getRequest: () => request }),
  });
  it("rejects an otherwise valid access token when its persisted session is revoked", async () => {
    const jwt = {
      verify: jest
        .fn()
        .mockReturnValue({ sub: "u1", email: "person@example.com", sid: "s1" }),
    };
    const prisma = {
      authSession: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const guard = new JwtCookieGuard(jwt as never, prisma as never);
    await expect(
      guard.canActivate(
        context({ cookies: { athena_access: "token" } }) as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "s1",
          userId: "u1",
          revokedAt: null,
        }),
      }),
    );
  });
  it("sets the identity only after the active session lookup succeeds", async () => {
    const request: any = { cookies: { athena_access: "token" } };
    const jwt = {
      verify: jest
        .fn()
        .mockReturnValue({ sub: "u1", email: "person@example.com", sid: "s1" }),
    };
    const guard = new JwtCookieGuard(
      jwt as never,
      {
        authSession: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }) },
      } as never,
    );
    await expect(guard.canActivate(context(request) as never)).resolves.toBe(
      true,
    );
    expect(request.user).toMatchObject({ sub: "u1", sid: "s1" });
  });
});
