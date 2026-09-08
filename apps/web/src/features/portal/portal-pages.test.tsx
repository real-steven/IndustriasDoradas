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

describe("portal role matrix", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("denies an administrator route to a company manager", () => {
    renderPortal("JEFE_EMPRESA", "/administracion");
    expect(
      screen.getByRole("heading", { name: "Acceso restringido" }),
    ).toBeInTheDocument();
  });

  it("shows report access only to management", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyPage()));
    renderPortal("JEFE_EMPRESA", "/gerencia");
    expect(
      screen.getByRole("heading", { name: "Reportes" }),
    ).toBeInTheDocument();
  });

  it("shows only assigned administration modules", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyPage()));
    renderPortal("ADMINISTRADOR", "/administracion");
    expect(
      screen.getByText("No tienes módulos administrativos asignados."),
    ).toBeInTheDocument();
  });

  it("presents administration as separate module links", () => {
    renderPortal("JEFE_EMPRESA", "/gerencia/administracion");

    expect(
      screen.getByRole("link", { name: /Usuarios administradores/u }),
    ).toHaveAttribute("href", "/gerencia/administracion/administradores");
    expect(
      screen.getByRole("link", { name: /Jefes de planta/u }),
    ).toHaveAttribute("href", "/gerencia/administracion/jefes-planta");
    expect(screen.getByRole("link", { name: /Operarios/u })).toHaveAttribute(
      "href",
      "/gerencia/administracion/operarios",
    );
    expect(screen.getByRole("link", { name: /Proveedores/u })).toHaveAttribute(
      "href",
      "/gerencia/administracion/proveedores",
    );
    expect(screen.getByRole("link", { name: /Plantas/u })).toHaveAttribute(
      "href",
      "/gerencia/administracion/plantas",
    );
    expect(
      screen.queryByRole("button", { name: "Crear e invitar" }),
    ).not.toBeInTheDocument();
  });

  it("selects administrator permissions by area and keeps advanced detail", async () => {
    const permissions = [
      {
        code: "administrators.create",
        description: "Crear cuentas administrativas.",
        assigned: false,
      },
      {
        code: "administrators.govern",
        description: "Suspender cuentas administrativas.",
        assigned: false,
      },
      {
        code: "workers.read",
        description: "Consultar trabajadores.",
        assigned: false,
      },
      {
        code: "inventory.manage",
        description: "Gestionar inventario.",
        assigned: false,
      },
    ];
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation((input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (init?.method === "POST") return Promise.resolve(accountResponse());
        if (url.includes("administrator-permissions")) {
          return Promise.resolve(permissionList(permissions));
        }
        return Promise.resolve(emptyPage());
      });
    vi.stubGlobal("fetch", transport);
    const user = userEvent.setup();
    renderPortal("JEFE_EMPRESA", "/gerencia/administracion/administradores");

    await user.click(
      await screen.findByRole("checkbox", { name: /Usuarios y personal/u }),
    );
    expect(screen.getByText("3 de 4 seleccionados")).toBeInTheDocument();

    await user.click(
      screen.getByText("Opciones avanzadas · configurar uno a uno"),
    );
    expect(screen.getByText("administrators.create")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre"), "Admin por área");
    await user.type(screen.getByLabelText("Correo"), "area@example.com");
    await user.click(screen.getByRole("button", { name: "Crear e invitar" }));

    await vi.waitFor(() => {
      const requestCall = transport.mock.calls.find(
        ([, options]) => options?.method === "POST",
      );
      expect(requestCall).toBeDefined();
      const requestBody = requestCall?.[1]?.body;
      if (typeof requestBody !== "string") {
        throw new Error("Expected a JSON request body");
      }
      expect(JSON.parse(requestBody)).toMatchObject({
        permissionCodes: [
          "administrators.create",
          "administrators.govern",
          "workers.read",
        ],
      });
    });
  });

  it("requires the manager to provide the real suspension reason", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation((input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (init?.method === "POST") return Promise.resolve(accountResponse());
        if (url.includes("permissions"))
          return Promise.resolve(permissionList());
        if (url.includes("roleCode=JEFE_PLANTA"))
          return Promise.resolve(accountPage());
        return Promise.resolve(emptyPage());
      });
    vi.stubGlobal("fetch", transport);
    const user = userEvent.setup();
    renderPortal("JEFE_EMPRESA", "/gerencia/administracion/jefes-planta");

    const reason = await screen.findByLabelText("Razón de suspensión");
    const suspend = screen.getByRole("button", { name: "Suspender" });
    expect(suspend).toBeDisabled();

    await user.type(reason, "Revisión gerencial ficticia");
    await user.click(suspend);

    await vi.waitFor(() =>
      expect(transport).toHaveBeenCalledWith(
        expect.stringContaining("/suspend"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "Revisión gerencial ficticia" }),
        }),
      ),
    );
  });

  it("explains when an administrator email is already registered", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation((input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (init?.method === "POST") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                code: "ACCOUNT_EMAIL_ALREADY_REGISTERED",
                message: "The email address is already registered",
              }),
              {
                status: 409,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        if (url.includes("permissions")) {
          return Promise.resolve(permissionList());
        }
        return Promise.resolve(emptyPage());
      });
    vi.stubGlobal("fetch", transport);
    const user = userEvent.setup();
    renderPortal("JEFE_EMPRESA", "/gerencia/administracion/administradores");

    const names = await screen.findAllByLabelText("Nombre");
    await user.type(names[0]!, "Administración duplicada");
    await user.type(screen.getByLabelText("Correo"), "existing@example.com");
    await user.click(screen.getByRole("button", { name: "Crear e invitar" }));

    expect(
      await screen.findByText(
        "Ese correo ya está registrado. Use otro correo para enviar una nueva invitación.",
      ),
    ).toBeInTheDocument();
  });
});

function renderPortal(role: RoleCode, path: string): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: "30000000-0000-4000-8000-000000000001",
      role,
      permissions:
        role === "JEFE_EMPRESA"
          ? [
              "reports.read",
              "audit.read_redacted",
              "audit.read_operational",
              "organization_catalogs.read",
              "organization_catalogs.manage",
              "suppliers.manage",
              "workers.resolve",
              "workers.read",
              "plant_managers.manage",
              "administrators.create",
              "administrators.govern",
              "administrators.permissions.manage",
            ]
          : [],
      expiresAt: "2026-08-19T01:00:00Z",
    },
    loading: false,
    error: null,
    signIn: vi.fn(),
    recover: vi.fn(),
    signOut: vi.fn(),
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
}

function permissionList(items: unknown[] = []): Response {
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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

function accountPage(): Response {
  return new Response(
    JSON.stringify({
      items: [
        {
          id: "a1000000-0000-4000-8000-000000000002",
          displayName: "Administración ficticia",
          preferredLocale: "es",
          accountStatus: "ACTIVE",
          roleCode: "ADMINISTRADOR",
          statusReason: null,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function accountResponse(): Response {
  return new Response(
    JSON.stringify({
      id: "a1000000-0000-4000-8000-000000000002",
      accountStatus: "SUSPENDED",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
