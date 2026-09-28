// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { AuthPage } from "./AuthPage";

vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  api: vi.fn(),
}));

let host: HTMLDivElement;
let root: Root;
const onAuthenticated = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(api).mockReset();
  onAuthenticated.mockReset();
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.history.replaceState({}, "", "/login?returnTo=%2Fprojects%2Fp1");
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const mount = async () => {
  await act(async () =>
    root.render(<AuthPage onAuthenticated={onAuthenticated} />),
  );
};
const setInput = (field: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
};
const input = async (label: string, value: string) => {
  const field = [...host.querySelectorAll<HTMLInputElement>("input")].find(
    (element) => element.closest("label")?.textContent?.includes(label),
  );
  if (!field) throw new Error(`Campo ${label} não encontrado`);
  await act(async () => {
    setInput(field, value);
  });
};

describe("AuthPage", () => {
  it("keeps a safe returnTo through public navigation", async () => {
    await mount();
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Criar conta")
        ?.click(),
    );
    expect(window.location.pathname).toBe("/cadastro");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(
      "/projects/p1",
    );
  });

  it("shows a local mismatch error before attempting registration", async () => {
    await mount();
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Criar conta")
        ?.click(),
    );
    await input("Nome completo", "Pessoa");
    await input("E-mail", "pessoa@example.com");
    const passwords = host.querySelectorAll<HTMLInputElement>(
      'input[type="password"]',
    );
    await act(async () => {
      setInput(passwords[0], "senha-segura-123");
      setInput(passwords[1], "senha-diferente-123");
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(host.textContent).toContain("As senhas precisam coincidir.");
    expect(api).not.toHaveBeenCalled();
  });

  it("logs in and preserves the validated client destination", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      id: "u1",
      name: "Pessoa",
      email: "pessoa@example.com",
    } as never);
    await mount();
    await input("E-mail", "pessoa@example.com");
    await input("Senha", "senha-segura-123");
    await act(async () => {
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(api).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.location.pathname).toBe("/projects/p1");
    expect(onAuthenticated).toHaveBeenCalledWith({
      id: "u1",
      name: "Pessoa",
      email: "pessoa@example.com",
    });
  });

  it("creates a persistent session when the device is remembered", async () => {
    vi.mocked(api).mockResolvedValueOnce({
      id: "u1",
      name: "Pessoa",
      email: "pessoa@example.com",
    } as never);
    await mount();
    await input("E-mail", "pessoa@example.com");
    await input("Senha", "senha-segura-123");
    await act(async () => {
      (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      JSON.parse(
        (vi.mocked(api).mock.calls[0][1] as { body: string }).body,
      ).remember,
    ).toBe(true);
  });

  it("requests a reset code and completes the OTP, password, and confirmation step", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ ok: true } as never)
      .mockResolvedValueOnce({ ok: true } as never);
    window.history.replaceState({}, "", "/esqueci-senha");

    await mount();
    await input("E-mail", "pessoa@example.com");
    await act(async () => {
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(api).toHaveBeenNthCalledWith(
      1,
      "/auth/forgot-password",
      expect.objectContaining({
        body: JSON.stringify({ email: "pessoa@example.com" }),
      }),
    );
    expect(host.textContent).toContain("Código de 6 dígitos");
    expect(host.textContent).toContain(
      "Se houver uma conta com esse e-mail, enviaremos um código para redefinir sua senha.",
    );
    expect(host.querySelector(".auth-note")).toBeNull();

    await act(async () => {
      setInput(host.querySelector("#reset-code") as HTMLInputElement, "12a34567");
    });
    expect((host.querySelector("#reset-code") as HTMLInputElement).value).toBe(
      "123456",
    );
    await input("Senha", "uma-senha-longa-123");
    await input("Confirmar senha", "uma-senha-longa-123");
    await act(async () => {
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(api).toHaveBeenNthCalledWith(
      2,
      "/auth/reset-password",
      expect.objectContaining({
        body: JSON.stringify({
          email: "pessoa@example.com",
          code: "123456",
          password: "uma-senha-longa-123",
          passwordConfirmation: "uma-senha-longa-123",
        }),
      }),
    );
    expect(window.location.pathname).toBe("/login");
    expect(host.textContent).toContain("Senha atualizada. Entre com sua nova senha.");
  });

  it("can change the email and request another reset code", async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ ok: true } as never)
      .mockResolvedValueOnce({ ok: true } as never);
    window.history.replaceState({}, "", "/esqueci-senha");

    await mount();
    await input("E-mail", "pessoa@example.com");
    await act(async () => {
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(".auth-resend-code")?.click();
    });
    expect(api).toHaveBeenNthCalledWith(
      2,
      "/auth/forgot-password",
      expect.objectContaining({
        body: JSON.stringify({ email: "pessoa@example.com" }),
      }),
    );

    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Usar outro e-mail")
        ?.click();
    });
    expect(host.querySelector("#reset-code")).toBeNull();
    expect(
      [...host.querySelectorAll<HTMLInputElement>("input")].some(
        (field) => field.type === "email",
      ),
    ).toBe(true);
  });

  it("returns to login after verification without hiding the confirmation", async () => {
    window.history.replaceState(
      {},
      "",
      "/verificar-email?token=verification-token",
    );
    vi.mocked(api).mockResolvedValueOnce({ returnTo: "/projects/p1" } as never);

    await mount();
    await act(async () => {
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(window.location.pathname).toBe("/login");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(
      "/projects/p1",
    );
    expect(host.textContent).toContain(
      "E-mail confirmado. Agora você já pode entrar.",
    );
  });

  it("stores the invite destination when registering from an invite", async () => {
    window.history.replaceState({}, "", "/cadastro?token=invite-token");
    vi.mocked(api).mockResolvedValueOnce({ ok: true } as never);

    await mount();
    await input("Nome completo", "Pessoa");
    await input("E-mail", "pessoa@example.com");
    await input("Senha", "senha-segura-123");
    await input("Confirmar senha", "senha-segura-123");
    await act(async () => {
      (
        host.querySelector('input[type="checkbox"]') as HTMLInputElement
      ).click();
      (host.querySelector(".auth-card") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(api).toHaveBeenCalledWith(
      "/auth/register",
      expect.objectContaining({
        body: expect.stringContaining(
          '"returnTo":"/convites/aceitar?token=invite-token"',
        ),
      }),
    );
  });

  it('preserves a direct User Story link as the registration return destination', async () => {
    const returnTo = '/projects/p1/requirements/r1/edit';
    window.history.replaceState({}, '', returnTo);
    vi.mocked(api).mockResolvedValueOnce({ ok: true } as never);

    await mount();
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find(button => button.textContent === 'Criar conta')
        ?.click();
    });
    await input('Nome completo', 'Pessoa');
    await input('E-mail', 'pessoa@example.com');
    await input('Senha', 'senha-segura-123');
    await input('Confirmar senha', 'senha-segura-123');
    await act(async () => {
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
      (host.querySelector('.auth-card') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });

    expect(api).toHaveBeenCalledWith(
      '/auth/register',
      expect.objectContaining({
        body: expect.stringContaining(`"returnTo":"${returnTo}"`),
      }),
    );
  });

  it('restores the User Story link after email confirmation and login', async () => {
    const returnTo = '/projects/p1/requirements/r1/edit';
    window.history.replaceState({}, '', '/verificar-email?token=verification-token');
    vi.mocked(api)
      .mockResolvedValueOnce({ returnTo } as never)
      .mockResolvedValueOnce({ id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' } as never);

    await mount();
    await act(async () => {
      (host.querySelector('.auth-card') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe(returnTo);

    await input('E-mail', 'pessoa@example.com');
    await input('Senha', 'senha-segura-123');
    await act(async () => {
      (host.querySelector('.auth-card') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });

    expect(window.location.pathname).toBe(returnTo);
    expect(onAuthenticated).toHaveBeenCalledWith({ id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' });
  });

  it('accepts a direct project invite after a new account confirms its email and logs in', async () => {
    window.history.replaceState({}, '', '/verificar-email?token=verification-token');
    vi.mocked(api)
      .mockResolvedValueOnce({ returnTo: '/convites/aceitar?token=invite-token' } as never)
      .mockResolvedValueOnce({ id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' } as never)
      .mockResolvedValueOnce({ workspaceId: 'w1', projectId: 'p1', ok: true } as never);

    await mount();
    await act(async () => {
      (host.querySelector('.auth-card') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(new URLSearchParams(window.location.search).get('token')).toBe('invite-token');

    await input('E-mail', 'pessoa@example.com');
    await input('Senha', 'senha-segura-123');
    await act(async () => {
      (host.querySelector('.auth-card') as HTMLFormElement).dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });

    expect(api).toHaveBeenNthCalledWith(3, '/invites/accept', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ token: 'invite-token' }),
    }));
    expect(window.location.pathname).toBe('/projects/p1');
    expect(onAuthenticated).toHaveBeenCalledWith({ id: 'u1', name: 'Pessoa', email: 'pessoa@example.com' });
  });
});
