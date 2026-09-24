// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

let host: HTMLDivElement;
let root!: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mount = async () => {
  await act(async () => root.render(<LandingPage />));
};

describe("LandingPage", () => {
  it("communicates the impact story without relying on the visual canvas", async () => {
    await mount();
    expect(host.querySelector("h1")?.textContent).toContain("Quando um requisito muda");
    expect(host.textContent).toContain("3 possíveis impactos");
    expect(host.textContent).toContain("Documento de segurança");
    expect(host.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("takes primary and secondary access actions to the public auth routes", async () => {
    await mount();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
    await act(async () => buttons.find((button) => button.textContent?.includes("Criar conta"))?.click());
    expect(window.location.pathname).toBe("/cadastro");
    window.history.replaceState({}, "", "/");
    await act(async () => buttons.find((button) => button.textContent?.trim().startsWith("Entrar"))?.click());
    expect(window.location.pathname).toBe("/login");
  });
});
