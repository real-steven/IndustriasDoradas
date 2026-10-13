import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import type { ManagementOperationLine } from "../../api/generated/api-client";
import { QueryProvider } from "../../app/query-provider";
import {
  AuthContext,
  type AuthState,
  type RoleCode,
} from "../../auth/auth-context";

describe("portal gerencial", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(managementPage())),
    );
  });

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

  it("moves focus to the main content when the gerencial route changes", async () => {
    const user = userEvent.setup();
    renderPortal("JEFE_EMPRESA", "/gerencia");

    const main = document.getElementById("contenido-gerencial");
    expect(main).not.toBeNull();
    await user.click(screen.getByRole("link", { name: "Operación" }));

    expect(
      await screen.findByRole("heading", { name: "Operación" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(main).toHaveFocus());
  });

  it("presenta el resumen con los valores entregados por la API gerencial", async () => {
    const transport = vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      expect(url).toContain("/management/operation-lines?page=1&pageSize=100");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer fictitious-token",
      );
      return Promise.resolve(managementPage());
    });
    vi.stubGlobal("fetch", transport);

    renderPortal("JEFE_EMPRESA", "/gerencia");

    expect(
      screen.getByRole("heading", { name: "Buenos días, Lucía." }),
    ).toBeInTheDocument();
    expect(await screen.findByText("1 línea activa")).toBeInTheDocument();
    const card = screen
      .getByRole("heading", { name: "Línea 1" })
      .closest("article");
    expect(card).not.toBeNull();
    if (card === null) throw new Error("Expected operation line card");
    expect(within(card).getByText("260")).toBeInTheDocument();
    expect(within(card).getByText("Proveedor Norte")).toBeInTheDocument();
    expect(within(card).getByText("Responsable Uno")).toBeInTheDocument();
    expect(within(card).getByText("Barridas")).toBeInTheDocument();
    expect(within(card).getByText("1")).toBeInTheDocument();
    expect(within(card).getByText("Cargamento")).toBeInTheDocument();
    expect(within(card).getByText("510 cajuelas")).toBeInTheDocument();
    expect(within(card).getByText("ACTIVA")).toBeInTheDocument();
    expect(transport).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("link", { name: /Administración/u }),
    ).not.toBeInTheDocument();
  });

  it("distingue una operacion vacia de una falla de conexion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(emptyPage())),
    );

    renderPortal("JEFE_EMPRESA", "/gerencia/operacion");

    expect(
      await screen.findByRole("heading", { name: "No hay líneas activas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/La consulta central respondió correctamente/u),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No se pudo consultar la operación/u),
    ).not.toBeInTheDocument();
  });

  it("presenta una barrida pendiente con la referencia entregada por la API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          managementPage({ sweepPending: true, nextSweepAt: 500 }),
        ),
      ),
    );

    renderPortal("JEFE_EMPRESA", "/gerencia/operacion");

    expect(
      await screen.findByText("Barrida pendiente desde"),
    ).toBeInTheDocument();
    expect(screen.getByText("500 cajuelas")).toBeInTheDocument();
  });

  it("conserva la ultima respuesta y marca las estaciones como desactualizadas", async () => {
    const user = userEvent.setup();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(managementPage())
      .mockResolvedValueOnce(errorResponse());
    vi.stubGlobal("fetch", transport);

    renderPortal("JEFE_EMPRESA", "/gerencia/operacion");
    expect(
      await screen.findByRole("heading", { name: "Línea 1" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actualizar datos" }));

    expect(
      await screen.findByText("Datos desactualizados."),
    ).toBeInTheDocument();
    expect(screen.getByText("DATO DESACTUALIZADO")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Línea 1" }),
    ).toBeInTheDocument();
  });

  it("permite reintentar una consulta inicial fallida", async () => {
    const user = userEvent.setup();
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse())
      .mockResolvedValueOnce(managementPage());
    vi.stubGlobal("fetch", transport);

    renderPortal("JEFE_EMPRESA", "/gerencia/operacion");
    expect(
      await screen.findByText(/No se pudo consultar la operación/u),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actualizar datos" }));

    expect(
      await screen.findByRole("heading", { name: "Línea 1" }),
    ).toBeInTheDocument();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("no agrega controles fisicos de produccion al portal", async () => {
    renderPortal("JEFE_EMPRESA", "/gerencia/operacion");

    expect(
      await screen.findByRole("heading", { name: "Línea 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Registrar cajuela/u }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Registrar barrida/u }),
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
    expect(screen.getByRole("link", { name: /Trabajadores/u })).toHaveAttribute(
      "href",
      "/gerencia/trabajadores",
    );
    expect(screen.getAllByText("PRÓXIMAMENTE").length).toBeGreaterThan(0);
  });

  it.each([
    ["/gerencia/operacion", "Operación"],
    ["/gerencia/oro", "Oro por cargamento"],
    ["/gerencia/cargamentos", "Cargamentos"],
  ])("expone la ruta gerencial %s", (path, heading) => {
    renderPortal("JEFE_EMPRESA", path);

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("explica que el oro es opcional y no representa custodia", () => {
    renderPortal("JEFE_EMPRESA", "/gerencia/oro");

    expect(
      screen.getByRole("heading", { name: "Oro por cargamento" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Vacío significa no registrado/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sin custodia ni existencia acumulada/u),
    ).toBeInTheDocument();
  });

  it("conserva la consulta real de auditoria en la nueva estructura", async () => {
    const transport = vi.fn<typeof fetch>((input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(
        url.includes("/audit-events") ||
          url.includes("/management/shipments?page=1&pageSize=100"),
      ).toBe(true);
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer fictitious-token",
      );
      return Promise.resolve(emptyPage());
    });
    vi.stubGlobal("fetch", transport);

    renderPortal("JEFE_EMPRESA", "/gerencia/auditoria");

    expect(
      await screen.findByText("Aún no hay movimientos de cargamentos"),
    ).toBeInTheDocument();
    expect(transport).toHaveBeenCalledTimes(2);
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
      pageSize: 100,
      total: 0,
      totalPages: 0,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function managementPage(
  overrides: Partial<ManagementOperationLine> = {},
): Response {
  return new Response(
    JSON.stringify({
      items: [
        {
          organizationId: "30000000-0000-4000-8000-000000000001",
          plantId: "40000000-0000-4000-8000-000000000001",
          stationId: "50000000-0000-4000-8000-000000000001",
          stationName: "Estación Central",
          shipmentId: "60000000-0000-4000-8000-000000000001",
          feedCycleId: "70000000-0000-4000-8000-000000000001",
          productionLineId: "80000000-0000-4000-8000-000000000001",
          productionLineName: "Línea 1",
          productionLineOrder: 1,
          supplierId: "90000000-0000-4000-8000-000000000001",
          supplierName: "Proveedor Norte",
          responsibleWorkerId: "a0000000-0000-4000-8000-000000000001",
          responsibleWorkerName: "Responsable Uno",
          startedAtUtc: "2026-10-12T14:00:00.000Z",
          cajuelaTotal: 260,
          sweepCount: 1,
          sweptCajuelas: 250,
          cajuelasSinceLastSweep: 10,
          nextSweepAt: 510,
          sweepPending: false,
          lastActivityAtUtc: "2026-10-12T15:30:00.000Z",
          ...overrides,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function errorResponse(): Response {
  return new Response(
    JSON.stringify({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message: "Servicio temporalmente no disponible.",
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
