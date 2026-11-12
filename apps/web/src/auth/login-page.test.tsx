import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../i18n/language-provider";
import { AuthContext, type AuthState } from "./auth-context";
import { LoginPage } from "./login-page";

const rememberedEmailKey = "industrias-doradas:recent-email";
const emailDraftKey = "industrias-doradas:login-email-draft";

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

  it("restores an unfinished email after the login page reloads", async () => {
    const user = userEvent.setup();
    const firstRender = renderLogin();

    await user.type(
      screen.getByRole("textbox", { name: "CORREO" }),
      "gerencia@example.com",
    );
    expect(window.localStorage.getItem(emailDraftKey)).not.toBeNull();

    firstRender.unmount();
    renderLogin();

    expect(screen.getByRole("textbox", { name: "CORREO" })).toHaveValue(
      "gerencia@example.com",
    );
  });

  it("discards an unfinished email after five minutes", async () => {
    const user = userEvent.setup();
    const firstRender = renderLogin();

    await user.type(
      screen.getByRole("textbox", { name: "CORREO" }),
      "temporal@example.com",
    );
    window.localStorage.setItem(
      emailDraftKey,
      JSON.stringify({
        email: "temporal@example.com",
        expiresAt: Date.now() - 1,
      }),
    );

    firstRender.unmount();
    renderLogin();

    expect(screen.getByRole("textbox", { name: "CORREO" })).toHaveValue("");
    expect(window.localStorage.getItem(emailDraftKey)).toBeNull();
  });

  it("asks before opening a session found in the browser", async () => {
    const user = userEvent.setup();
    const continueFoundSession = vi.fn(() => Promise.resolve());
    const signOut = vi.fn(() => Promise.resolve());
    renderLogin({
      foundSession: { email: "lucia@example.com" },
      continueFoundSession,
      signOut,
    });

    expect(
      screen.getByRole("heading", { name: "Sesión disponible" }),
    ).toBeVisible();
    expect(screen.getByText("lucia@example.com")).toBeVisible();
    expect(screen.queryByLabelText("CONTRASEÑA")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "CONTINUAR CON ESTA CUENTA →",
      }),
    );
    expect(continueFoundSession).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "USAR OTRA CUENTA" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("starts with the password hidden behind an accessible eye button", () => {
    renderLogin();

    const password = screen.getByLabelText("CONTRASEÑA");
    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("title", "Mostrar contraseña");
    expect(toggle).toHaveAttribute("aria-controls", "password");
    expect(toggle.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "show-password",
    );
  });

  it("shows and hides the exact password without submitting", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    renderLogin({ signIn });
    const password = screen.getByLabelText<HTMLInputElement>("CONTRASEÑA");
    const secret = "Clave ñ 123 €";

    await user.type(password, secret);
    await user.click(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    );

    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue(secret);
    const hideToggle = screen.getByRole("button", {
      name: "Ocultar contraseña",
    });
    expect(hideToggle.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "hide-password",
    );

    await user.click(hideToggle);

    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue(secret);
    expect(signIn).not.toHaveBeenCalled();
    expect(JSON.stringify(window.localStorage)).not.toContain(secret);
  });

  it("keeps focus and caret in the field when toggled with the pointer", async () => {
    const user = userEvent.setup();
    renderLogin();
    const password = screen.getByLabelText<HTMLInputElement>("CONTRASEÑA");

    await user.type(password, "clave-privada");
    password.setSelectionRange(3, 5);
    await user.click(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    );

    expect(password).toHaveFocus();
    expect(password.selectionStart).toBe(3);
    expect(password.selectionEnd).toBe(5);

    await user.click(
      screen.getByRole("button", { name: "Ocultar contraseña" }),
    );

    expect(password).toHaveFocus();
    expect(password.selectionStart).toBe(3);
    expect(password.selectionEnd).toBe(5);
  });

  it("toggles from the keyboard and keeps focus on the eye button", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    renderLogin({ signIn });
    const password = screen.getByLabelText("CONTRASEÑA");

    await user.type(password, "clave-privada");
    await user.tab();
    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(toggle).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(password).toHaveAttribute("type", "text");
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAccessibleName("Ocultar contraseña");

    await user.keyboard(" ");
    expect(password).toHaveAttribute("type", "password");
    expect(toggle).toHaveAccessibleName("Mostrar contraseña");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("submits with Enter while visible and hides the password again", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(() => Promise.resolve());
    renderLogin({ signIn });
    const password = screen.getByLabelText("CONTRASEÑA");

    await user.type(
      screen.getByRole("textbox", { name: "CORREO" }),
      "gerencia@example.com",
    );
    await user.type(password, "clave-privada");
    await user.click(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    );
    await user.type(password, "{Enter}");

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        "gerencia@example.com",
        "clave-privada",
      ),
    );
    expect(password).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    ).toBeInTheDocument();
    expect(JSON.stringify(window.localStorage)).not.toContain("clave-privada");
  });

  it("starts hidden again when the login view is opened again", async () => {
    const user = userEvent.setup();
    const firstRender = renderLogin();

    await user.type(screen.getByLabelText("CONTRASEÑA"), "clave-privada");
    await user.click(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    );
    firstRender.unmount();
    renderLogin();

    expect(screen.getByLabelText("CONTRASEÑA")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByLabelText("CONTRASEÑA")).toHaveValue("");
  });

  it("translates the complete login without reloading", async () => {
    const user = userEvent.setup();
    const auth = createAuth();

    render(
      <LanguageProvider>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </LanguageProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Cambiar idioma a inglés" }),
    );

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeVisible();
    expect(screen.getByLabelText("EMAIL")).toBeVisible();
    expect(screen.getByLabelText("PASSWORD")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show password" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ENTER PORTAL →" }),
    ).toBeVisible();
  });
});

function renderLogin(overrides: Partial<AuthState> = {}) {
  const auth = createAuth(overrides);

  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function createAuth(overrides: Partial<AuthState> = {}): AuthState {
  return {
    session: null,
    profile: null,
    foundSession: null,
    loading: false,
    error: null,
    continueFoundSession: vi.fn(() => Promise.resolve()),
    signIn: vi.fn(() => Promise.resolve()),
    recover: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}
