import { HttpStatus } from "@nestjs/common";
import { AuthRateLimitService } from "../src/auth/auth-rate-limit.service";

describe("AuthRateLimitService", () => {
  it("records only the normalized identity, origin, and action", async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const service = new AuthRateLimitService({
      authAttempt: { count: jest.fn().mockResolvedValue(0), create },
    } as never);

    await service.check("person@example.com", "127.0.0.1", "login");

    expect(create).toHaveBeenCalledWith({
      data: {
        email: "person@example.com",
        origin: "127.0.0.1",
        action: "login",
      },
    });
  });

  it("returns a public 429 after five recent attempts", async () => {
    const create = jest.fn();
    const service = new AuthRateLimitService({
      authAttempt: { count: jest.fn().mockResolvedValue(5), create },
    } as never);

    await expect(
      service.check("person@example.com", "127.0.0.1", "login"),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(create).not.toHaveBeenCalled();
  });
});
