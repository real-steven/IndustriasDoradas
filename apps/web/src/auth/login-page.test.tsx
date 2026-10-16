import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthState } from "./auth-context";
import { LoginPage } from "./login-page";

const rememberedEmailKey = "industrias-doradas:recent-email";

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("uses the same divided industrial concept as desktop", () => {
    renderLogin();

    expect(
      screen.getByRole("heading", {
        name: "La planta, lista para consultarse.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Bienvenido" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(
      screen.getByRole("checkbox", { name: "Recordar correo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "¿Olvidó su contraseña?" }),
    ).toBeInTheDocument();
  });

  it("uses the login email for password recovery", async () => {
    const user = userEvent.setup();
    const recover = vi.fn(() => Promise.resolve());
    renderLogin({ recover });

    await user.type(
      screen.getByRole("textbox", { name: "CORREO" }),
      "  gerencia@example.com  ",
    );
    await user.click(
      screen.getByRole("button", { name: "¿Olvidó su contraseña?" }),
    );

    await waitFor(() =>
      expect(recover).toHaveBeenCalledWith("gerencia@example.com"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Si la cuenta existe, se enviaron instrucciones al correo.",
    );
  });

  it("remembers only the email after a successful login", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    renderLogin({ signIn });

    await user.type(
      screen.getByRole("textbox", { name: "CORREO" }),
      "gerencia@example.com",
    );
    await user.type(screen.getByLabelText("CONTRASEÑA"), "clave-privada");
    await user.click(screen.getByRole("checkbox", { name: "Recordar correo" }));
    await user.click(
      screen.getByRole("button", { name: "INGRESAR AL PORTAL →" }),
    );

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "gerencia@example.com",
        "clave-privada",
      ),
    );
    expect(window.localStorage.getItem(rememberedEmailKey)).toBe(
      "gerencia@example.com",
    );
    expect(JSON.stringify(window.localStorage)).not.toContain("clave-privada");
  });
});

function renderLogin(overrides: Partial<AuthState> = {}) {
  const auth: AuthState = {
    session: null,
    profile: null,
    loading: false,
    error: null,
    signIn: vi.fn(() => Promise.resolve()),
    recover: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  };

  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}
