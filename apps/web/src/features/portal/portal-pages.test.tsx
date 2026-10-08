import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import { QueryProvider } from "../../app/query-provider";
import {
  AuthContext,
  type AuthState,
  type RoleCode,
} from "../../auth/auth-context";

describe("portal gerencial", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("retira las rutas del antiguo modulo de administracion", () => {
    renderPortal("JEFE_EMPRESA", "/gerencia/administracion");

    expect(
      screen.getByRole("heading", { name: "Página no encontrada" }),
    ).toBeInTheDocument();
  });

  it("presenta el nuevo resumen sin inventar datos operativos", () => {
    renderPortal("JEFE_EMPRESA", "/gerencia");

    expect(
      screen.getByRole("heading", { name: "Buenos días, Lucía." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin datos en vivo")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Administración/u }),
    ).not.toBeInTheDocument();
  });

  it("expone la navegacion confirmada y separa los modulos futuros", () => {
    renderPortal("JEFE_EMPRESA", "/gerencia");

    expect(screen.getByRole("link", { name: "Operación" })).toHaveAttribute(
      "href",
      "/gerencia/operacion",
    );
    expect(screen.getByRole("link", { name: "Oro" })).toHaveAttribute(
      "href",
      "/gerencia/oro",
    );
    expect(
      screen.getByRole("link", { name: /Trabajadores/u }),
    ).toHaveAttribute("href", "/gerencia/trabajadores");
    expect(screen.getAllByText("PRÓXIMAMENTE").length).toBeGreaterThan(0);
  });

  it("explica que el oro es opcional y no representa custodia", () => {
    renderPortal("JEFE_EMPRESA", "/gerencia/oro");

    expect(
      screen.getByRole("heading", { name: "Oro por cargamento" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Vacío significa no registrado/u)).toBeInTheDocument();
    expect(screen.getByText(/sin custodia ni existencia acumulada/u)).toBeInTheDocument();
  });

  it("conserva la consulta real de auditoria en la nueva estructura", async () => {
    const transport = vi.fn<typeof fetch>((input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(url).toContain("/audit-events");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer fictitious-token",
      );
      return Promise.resolve(emptyPage());
    });
    vi.stubGlobal("fetch", transport);

    renderPortal("JEFE_EMPRESA", "/gerencia/auditoria");

    expect(
      await screen.findByRole("heading", {
        name: "Aún no hay movimientos disponibles",
      }),
    ).toBeInTheDocument();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("permite cerrar la sesion desde el menu gerencial", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(() => Promise.resolve());
    renderPortal("JEFE_EMPRESA", "/gerencia", signOut);

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it("rechaza perfiles web fuera del alcance vigente", () => {
    renderPortal("ADMINISTRADOR", "/gerencia");

    expect(
      screen.getByRole("heading", { name: "Acceso restringido" }),
    ).toBeInTheDocument();
  });
});

function renderPortal(
  role: RoleCode,
  path: string,
  signOut = vi.fn(() => Promise.resolve()),
): AuthState {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: "30000000-0000-4000-8000-000000000001",
      role,
      permissions: role === "JEFE_EMPRESA" ? ["audit.read_redacted"] : [],
      expiresAt: "2026-10-09T01:00:00Z",
    },
    loading: false,
    error: null,
    signIn: vi.fn(),
    recover: vi.fn(),
    signOut,
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AuthContext.Provider value={auth}>
      <QueryProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </QueryProvider>
    </AuthContext.Provider>,
  );
  return auth;
}

function emptyPage(): Response {
  return new Response(
    JSON.stringify({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
