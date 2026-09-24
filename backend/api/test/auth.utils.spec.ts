import { safeReturnTo } from "../src/auth/auth.utils";
import { PasswordPolicyService } from "../src/auth/password-policy.service";

describe("identity helpers", () => {
  it.each([
    "/onboarding",
    "/convites/aceitar?token=abc",
    "/projects/p1#details",
  ])("accepts internal return destination %s", (value) =>
    expect(safeReturnTo(value)).toBe(value),
  );
  it.each([
    "https://evil.example",
    "//evil.example",
    "javascript:alert(1)",
    "",
  ])("rejects unsafe return destination %s", (value) =>
    expect(safeReturnTo(value)).toBeUndefined(),
  );
  it("blocks a password reported by the k-anonymous range response", async () => {
    const policy = new PasswordPolicyService() as any;
    policy.rangeFetcher = jest
      .fn()
      .mockResolvedValue("51CC54B60534F68D0F614FCC67950151353:1");
    await expect(policy.validate("password")).rejects.toThrow("pelo menos 12");
    await expect(policy.validate("passwordpassword")).rejects.toThrow(
      "vazamentos",
    );
  });
  it("fails closed when the compromised-password service is unavailable", async () => {
    const policy = new PasswordPolicyService() as any;
    policy.rangeFetcher = jest.fn().mockRejectedValue(new Error("offline"));
    await expect(policy.validate("long-enough-secret")).rejects.toThrow(
      "Não foi possível validar",
    );
  });
});
