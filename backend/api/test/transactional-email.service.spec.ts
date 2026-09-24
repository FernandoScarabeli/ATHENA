import { TransactionalEmailService } from "../src/auth/transactional-email.service";
import { tokenDigest } from "../src/auth/auth.utils";

describe("TransactionalEmailService", () => {
  const old = {
    APP_ORIGIN: process.env.APP_ORIGIN,
    RESEND_FROM: process.env.RESEND_FROM,
    NODE_ENV: process.env.NODE_ENV,
  };
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://app.athena.test";
    process.env.RESEND_FROM = "ATHENA <access@athena.test>";
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    process.env.APP_ORIGIN = old.APP_ORIGIN;
    process.env.RESEND_FROM = old.RESEND_FROM;
    process.env.NODE_ENV = old.NODE_ENV;
  });
  const service = (send = jest.fn().mockResolvedValue({ error: null })) => {
    const instance = new TransactionalEmailService() as any;
    instance.client = { emails: { send } };
    return { instance: instance as TransactionalEmailService, send };
  };

  it("sends a verification URL, plain-text fallback, and stable idempotency key", async () => {
    const { instance, send } = service();
    await instance.sendVerification("person@example.com", "raw-token");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "ATHENA <access@athena.test>",
        to: ["person@example.com"],
        subject: "Confirme seu e-mail no ATHENA",
        text: expect.stringContaining(
          "https://app.athena.test/verificar-email?token=raw-token",
        ),
      }),
      { idempotencyKey: `email-verification/${tokenDigest("raw-token")}` },
    );
  });

  it("escapes a workspace name before interpolation into invitation HTML", async () => {
    const { instance, send } = service();
    await instance.sendWorkspaceInvite(
      "person@example.com",
      "<img src=x onerror=alert(1)>",
      "invite-token",
      "invite-1",
    );
    const payload = send.mock.calls[0][0];
    expect(payload.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(payload.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(send.mock.calls[0][1]).toEqual({
      idempotencyKey: `workspace-invite/invite-1/${tokenDigest("invite-token")}`,
    });
  });

  it("returns a recoverable error when Resend rejects a synchronous send", async () => {
    const { instance } = service(
      jest
        .fn()
        .mockResolvedValue({ error: { message: "sender is not verified" } }),
    );

    await expect(
      instance.sendPasswordReset("person@example.com", "reset-token"),
    ).rejects.toThrow("Não foi possível enviar o e-mail agora");
  });
});
