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
  it("requires eight characters, a letter, a number, and a special character", async () => {
    const policy = new PasswordPolicyService();
    await expect(policy.validate("Ab1!xyz")).rejects.toThrow("8 caracteres");
    await expect(policy.validate("password!long")).rejects.toThrow("número");
    await expect(policy.validate("12345678!")).rejects.toThrow("letra");
    await expect(policy.validate("Password123")).rejects.toThrow(
      "caractere especial",
    );
    await expect(policy.validate("Senha@123")).resolves.toBeUndefined();
  });
});
