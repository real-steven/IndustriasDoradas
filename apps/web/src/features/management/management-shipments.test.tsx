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
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import type { ManagementShipment } from "../../api/generated/api-client";
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";
import {
  parseShipmentFilters,
  shipmentDateRange,
} from "./management-shipments-data";

const SHIPMENT_ID = "42000000-0000-4000-8000-000000000001";
const LINE_ID = "32000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000001";
const WORKER_ID = "52000000-0000-4000-8000-000000000001";

describe("historial gerencial de cargamentos", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("convierte el dia de Costa Rica en un intervalo UTC exclusivo", () => {
    const filters = parseShipmentFilters(
      new URLSearchParams("period=date&date=2026-10-08&page=2"),
    );

    expect(filters).toMatchObject({
      period: "date",
      date: "2026-10-08",
      toDate: "2026-10-08",
      page: 2,
    });
    expect(shipmentDateRange(filters)).toEqual({
      fromUtc: "2026-10-08T06:00:00.000Z",
      toUtc: "2026-10-09T06:00:00.000Z",
    });
  });

  it("convierte un rango inclusivo y permite consultar todo el historial", () => {
    const rangeFilters = parseShipmentFilters(
      new URLSearchParams("period=date&date=2026-10-01&to=2026-10-08"),
    );

    expect(shipmentDateRange(rangeFilters)).toEqual({
      fromUtc: "2026-10-01T06:00:00.000Z",
      toUtc: "2026-10-09T06:00:00.000Z",
    });
    expect(
      shipmentDateRange(
        parseShipmentFilters(new URLSearchParams("period=all")),
      ),
    ).toEqual({});
  });

  it("conserva filtros y pagina en la URL y los envia a la API", async () => {
    const transport = vi.fn<typeof fetch>((input) =>
      Promise.resolve(
        requestUrl(input).includes("/gold-overview")
          ? json([])
          : shipmentPage({ page: 2, totalPages: 3 }),
      ),
    );
    vi.stubGlobal("fetch", transport);

    renderPortal(
      `/gerencia/cargamentos?period=date&date=2026-10-08&shipment=42000000&line=${LINE_ID}&supplier=${SUPPLIER_ID}&responsible=${WORKER_ID}&page=2`,
    );

    expect(
      await screen.findByText("42000000", { selector: "code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Buscar actividad" }),
    ).toHaveValue("42000000");
    expect(screen.getByRole("combobox", { name: "Área" })).toHaveValue(
      "shipments",
    );
    expect(screen.queryByText("Historial")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        transport.mock.calls.some(([input]) => {
          const candidate = new URL(requestUrl(input), "http://localhost");
          return candidate.searchParams.get("shipmentCode") === "42000000";
        }),
      ).toBe(true);
    });
    const pagedRequest = transport.mock.calls.find(([input]) => {
      const candidate = new URL(requestUrl(input), "http://localhost");
      return (
        candidate.searchParams.get("page") === "2" &&
        candidate.searchParams.get("shipmentCode") === "42000000"
      );
    });
    const request = new URL(requestUrl(pagedRequest?.[0]), "http://localhost");
    expect(request.searchParams.get("page")).toBe("2");
    expect(request.searchParams.get("pageSize")).toBe("10");
    expect(request.searchParams.get("fromUtc")).toBe(
      "2026-10-08T06:00:00.000Z",
    );
    expect(request.searchParams.get("toUtc")).toBe("2026-10-09T06:00:00.000Z");
    expect(request.searchParams.get("productionLineId")).toBe(LINE_ID);
    expect(request.searchParams.get("supplierId")).toBe(SUPPLIER_ID);
    expect(request.searchParams.get("responsibleWorkerId")).toBe(WORKER_ID);
    expect(request.searchParams.get("shipmentCode")).toBe("42000000");
    expect(request.searchParams.get("shipmentId")).toBeNull();
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ABRIR DETALLE/u }),
    ).toHaveAttribute("href", expect.stringContaining("period=date"));
  });

  it("abre un detalle trazable con barridas, mercurio y ambos momentos", async () => {
    const transport = vi.fn<typeof fetch>((input) => {
      const url = new URL(requestUrl(input), "http://localhost");
      if (url.pathname.endsWith(`/management/shipments/${SHIPMENT_ID}/sweeps`))
        return Promise.resolve(sweepPage());
      if (url.pathname.endsWith(`/management/shipments/${SHIPMENT_ID}`))
        return Promise.resolve(json(shipment()));
      if (url.pathname.endsWith("/audit-events"))
        return Promise.resolve(auditPage());
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal(
      `/gerencia/cargamentos/${SHIPMENT_ID}?period=previous&line=${LINE_ID}`,
    );

    expect(
      await screen.findByRole("heading", { name: "42000000" }),
    ).toBeInTheDocument();
    expect(screen.getByText("280")).toBeInTheDocument();
    expect(screen.getByText("Rastra 1")).toBeInTheDocument();
    expect(screen.getByText("Entrada: 12,5 g")).toBeInTheDocument();
    expect(screen.getByText("Remanente: Pendiente")).toBeInTheDocument();
    const audit = screen
      .getByRole("heading", { name: "Cambios auditados" })
      .closest("section");
    expect(audit).not.toBeNull();
    if (audit === null) throw new Error("Expected audit section");
    expect(within(audit).getByText("Ocurrió")).toBeInTheDocument();
    expect(within(audit).getByText("Confirmado en centro")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /VOLVER AL HISTORIAL/u }),
    ).toHaveAttribute("href", expect.stringContaining("period=previous"));
  });

  it("presenta la auditoria como actividad gerencial comprensible", async () => {
    const user = userEvent.setup();
    const transport = vi.fn<typeof fetch>((input) => {
      const url = new URL(requestUrl(input), "http://localhost");
      if (url.pathname.endsWith("/audit-events"))
        return Promise.resolve(auditPage());
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal("/gerencia/auditoria");

    const event = (
      await screen.findByText("La planta envió información de un cargamento")
    ).closest("article");
    expect(event).not.toBeNull();
    if (event === null) throw new Error("Expected an audit event");
    expect(within(event).getByText("Realizado por")).toBeInTheDocument();
    expect(within(event).getByText("Producción")).toBeInTheDocument();
    expect(
      within(event).getByRole("link", { name: "VER CARGAMENTO" }),
    ).toHaveAttribute("href", `/gerencia/cargamentos/${SHIPMENT_ID}`);
    expect(screen.queryByText("Cambios auditados")).not.toBeInTheDocument();

    await user.click(
      within(event).getByRole("button", { name: "ABRIR DETALLE" }),
    );

    const detail = screen.getByRole("dialog", {
      name: "Detalle de actividad",
    });
    expect(
      within(detail).getByText("Sincronización de planta"),
    ).toBeInTheDocument();
    expect(within(detail).getByText("Qué cambió")).toBeInTheDocument();
    expect(within(detail).getByText("Antes: Pendiente")).toBeInTheDocument();
    expect(within(detail).getByText("Después: Aprobado")).toBeInTheDocument();
    expect(
      within(detail).queryByText("Registrado en el sistema"),
    ).not.toBeInTheDocument();

    await user.click(
      within(detail).getByRole("button", { name: "Cerrar detalle" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("filtra la auditoria por el area seleccionada", async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        json({
          items: [],
          page: 1,
          pageSize: 12,
          total: 0,
          totalPages: 0,
        }),
      ),
    );
    vi.stubGlobal("fetch", transport);

    renderPortal("/gerencia/auditoria?view=people");

    expect(await screen.findByRole("combobox", { name: "Área" })).toHaveValue(
      "people",
    );
    await waitFor(() => {
      const request = transport.mock.calls.find(([input]) =>
        requestUrl(input).includes("/audit-events"),
      );
      expect(request).toBeDefined();
      expect(
        new URL(requestUrl(request?.[0]), "http://localhost").searchParams.get(
          "category",
        ),
      ).toBe("people");
    });
  });

  it("identifica un cargamento activo sin ofrecer un enlace de detalle", async () => {
    const transport = vi.fn<typeof fetch>((input) => {
      const url = new URL(requestUrl(input), "http://localhost");
      if (url.pathname.endsWith("/audit-events"))
        return Promise.resolve(auditPage("ACTIVE"));
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal("/gerencia/auditoria");

    expect(await screen.findByText("CARGAMENTO ACTIVO")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "VER CARGAMENTO" }),
    ).not.toBeInTheDocument();
  });
});

describe("identificador y busqueda del cargamento", () => {
  const CODE_ID = "5510b16a-0000-4000-8000-00000000000a";
  const ORGANIZATION = "30000000-0000-4000-8000-000000000001";

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function searchTransport(items: ManagementShipment[]) {
    return vi.fn<typeof fetch>((input) => {
      const url = new URL(requestUrl(input), "http://localhost");
      if (url.pathname.endsWith("/gold-overview"))
        return Promise.resolve(
          json(
            items.map((item) => ({
              shipmentId: item.shipmentId,
              mercury: {
                sweepCount: 2,
                completeSweepCount: 1,
                latestCompleteSweep: {
                  sweepId: "44000000-0000-4000-8000-000000000001",
                  sweptAtUtc: "2026-10-08T17:30:00.000Z",
                  inputGrams: 30,
                  remainderGrams: 4.5,
                },
              },
            })),
          ),
        );
      if (url.pathname.endsWith(`/management/shipments/${CODE_ID}/sweeps`))
        return Promise.resolve(sweepPage());
      if (url.pathname.endsWith(`/management/shipments/${CODE_ID}`))
        return Promise.resolve(json(items[0]));
      if (url.pathname.endsWith("/audit-events"))
        return Promise.resolve(
          json({ items: [], page: 1, pageSize: 12, total: 0, totalPages: 0 }),
        );
      if (url.pathname.endsWith("/management/shipments"))
        return Promise.resolve(
          json({
            items,
            page: 1,
            pageSize: 10,
            total: items.length,
            totalPages: items.length === 0 ? 0 : 1,
          }),
        );
      throw new Error(`Unexpected request ${url.pathname}`);
    });
  }

  function shipmentRequests(transport: ReturnType<typeof searchTransport>) {
    return transport.mock.calls
      .map(([input]) => new URL(requestUrl(input), "http://localhost"))
      .filter((url) => url.pathname.endsWith("/management/shipments"));
  }

  const coded = () =>
    shipment({
      shipmentId: CODE_ID,
      supplierName: "Material propio",
      goldResultId: "46000000-0000-4000-8000-000000000001",
      goldAmountGrams: 12.5,
      goldUnitCode: "g",
      goldKarat: 21.5,
      hasGoldResult: true,
    });

  it.each([
    ["  5510B16a  ", "5510b16a"],
    ["5510B16A-0000-4000-8000-00000000000A", CODE_ID],
  ])(
    "pega %s y lo busca en el servidor sin distinguir mayusculas",
    async (typed, expected) => {
      const user = userEvent.setup();
      const transport = searchTransport([coded()]);
      vi.stubGlobal("fetch", transport);

      renderPortal("/gerencia/auditoria?view=shipments&period=all");
      const box = await screen.findByRole("searchbox", {
        name: "Buscar actividad",
      });
      await user.clear(box);
      await user.type(box, typed);
      await user.click(screen.getByRole("button", { name: "BUSCAR" }));

      expect(
        await screen.findByText("5510B16A", { selector: "code" }),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(
          shipmentRequests(transport).some(
            (url) => url.searchParams.get("shipmentCode") === expected,
          ),
        ).toBe(true);
      });
      const request = shipmentRequests(transport).find(
        (url) => url.searchParams.get("shipmentCode") === expected,
      );
      // La consulta va a la organización de la sesión, paginada en el servidor.
      expect(request?.pathname).toContain(`/organizations/${ORGANIZATION}/`);
      expect(request?.searchParams.get("pageSize")).toBe("10");
      expect(request?.searchParams.get("shipmentId")).toBeNull();

      const row = screen
        .getByText("5510B16A", { selector: "code" })
        .closest("article");
      if (row === null) throw new Error("Expected a shipment row");
      expect(within(row).getByText("Línea 1")).toBeInTheDocument();
      expect(
        within(row).getAllByText(/Material propio/u).length,
      ).toBeGreaterThan(0);
      expect(within(row).getByText("Responsable Uno")).toBeInTheDocument();
      expect(within(row).getByText("280")).toBeInTheDocument();
      expect(within(row).getByText("12,5 g")).toBeInTheDocument();
      expect(within(row).getByText("21,5 k")).toBeInTheDocument();
      expect(
        await within(row).findByText(/Entrada 30 g · Final 4,5 g/u),
      ).toBeInTheDocument();
      expect(within(row).getByText("FINALIZADO")).toBeInTheDocument();
      expect(
        within(row).getByRole("link", { name: /ABRIR DETALLE/u }),
      ).toHaveAttribute(
        "href",
        expect.stringContaining(`/gerencia/cargamentos/${CODE_ID}`),
      );
    },
  );

  it("guarda el codigo en la URL y abre el detalle del resultado", async () => {
    const user = userEvent.setup();
    const transport = searchTransport([coded()]);
    vi.stubGlobal("fetch", transport);

    renderPortal(
      "/gerencia/auditoria?view=shipments&period=all&search=5510b16a&page=1",
    );

    expect(
      await screen.findByRole("searchbox", { name: "Buscar actividad" }),
    ).toHaveValue("5510b16a");
    await user.click(
      await screen.findByRole("link", { name: /ABRIR DETALLE/u }),
    );

    expect(
      await screen.findByRole("heading", { name: "5510B16A" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /VOLVER AL HISTORIAL/u }),
    ).toHaveAttribute("href", expect.stringContaining("search=5510b16a"));
  });

  it("avisa cuando no existe un cargamento con ese codigo", async () => {
    const transport = searchTransport([]);
    vi.stubGlobal("fetch", transport);

    renderPortal(
      "/gerencia/auditoria?view=shipments&period=all&search=ABCDEF12",
    );

    expect(
      await screen.findByText("No se encontró un cargamento con ese código."),
    ).toBeInTheDocument();
    expect(
      shipmentRequests(transport)[0]?.searchParams.get("shipmentCode"),
    ).toBe("abcdef12");
  });

  it("no consulta cargamentos con un texto que no es un codigo", async () => {
    const transport = searchTransport([coded()]);
    vi.stubGlobal("fetch", transport);

    renderPortal("/gerencia/auditoria?view=shipments&period=all&search=Lucia");

    expect(
      await screen.findByText("No se encontró un cargamento con ese código."),
    ).toBeInTheDocument();
    expect(shipmentRequests(transport)).toHaveLength(0);
  });

  it("copia solo el codigo sin abrir el cargamento", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("fetch", searchTransport([coded()]));

    renderPortal("/gerencia/auditoria?view=shipments&period=all");
    const button = await screen.findByRole("button", {
      name: "Copiar identificador del cargamento 5510B16A",
    });
    expect(button).toHaveAttribute("title", "Copiar identificador");
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith("5510B16A");
    expect(await screen.findByText("Código copiado")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Buscar actividad" }),
    ).toBeInTheDocument();

    button.focus();
    await user.keyboard("{Enter}");
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("deja seleccionar el codigo a mano si el portapapeles falla", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
    });
    vi.stubGlobal("fetch", searchTransport([coded()]));

    renderPortal("/gerencia/auditoria?view=shipments&period=all");
    await user.click(
      await screen.findByRole("button", {
        name: "Copiar identificador del cargamento 5510B16A",
      }),
    );

    expect(
      await screen.findByText(
        "No se pudo copiar. Seleccione el código y cópielo a mano.",
      ),
    ).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe("5510B16A");
  });

  it("ofrece buscar el cargamento desde toda la actividad", async () => {
    vi.stubGlobal("fetch", searchTransport([coded()]));

    renderPortal("/gerencia/auditoria?search=%205510B16A%20");

    expect(
      await screen.findByRole("link", {
        name: /BUSCAR EL CARGAMENTO 5510B16A/u,
      }),
    ).toHaveAttribute("href", expect.stringContaining("view=shipments"));
  });
});

function renderPortal(path: string): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: "30000000-0000-4000-8000-000000000001",
      role: "JEFE_EMPRESA",
      permissions: ["audit.read_redacted"],
      expiresAt: "2026-10-13T01:00:00Z",
    },
    foundSession: null,
    loading: false,
    error: null,
    continueFoundSession: vi.fn(),
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

function shipment(
  overrides: Partial<ManagementShipment> = {},
): ManagementShipment {
  return {
    organizationId: "30000000-0000-4000-8000-000000000001",
    plantId: "31000000-0000-4000-8000-000000000001",
    stationId: "34000000-0000-4000-8000-000000000001",
    stationName: "Estación Central",
    shipmentId: SHIPMENT_ID,
    feedCycleId: "43000000-0000-4000-8000-000000000001",
    productionLineId: LINE_ID,
    productionLineName: "Línea 1",
    productionLineOrder: 1,
    supplierId: SUPPLIER_ID,
    supplierName: "Proveedor Norte",
    responsibleWorkerId: WORKER_ID,
    responsibleWorkerName: "Responsable Uno",
    startedAtUtc: "2026-10-08T12:00:00.000Z",
    completedAtUtc: "2026-10-08T18:00:00.000Z",
    cajuelaTotal: 280,
    sweepCount: 1,
    sweptCajuelas: 280,
    cajuelasSinceLastSweep: 0,
    nextSweepAt: 530,
    sweepPending: false,
    lastActivityAtUtc: "2026-10-08T18:00:05.000Z",
    status: "COMPLETED",
    goldResultId: null,
    goldAmountGrams: null,
    goldUnitCode: null,
    goldRecordedAtUtc: null,
    goldRecordedByProfileId: null,
    goldRevisionCount: null,
    goldKarat: null,
    hasGoldResult: false,
    ...overrides,
  };
}

function shipmentPage(
  overrides: Partial<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> = {},
): Response {
  return json({
    items: [shipment()],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
    ...overrides,
  });
}

function sweepPage(): Response {
  const base = {
    organizationId: "30000000-0000-4000-8000-000000000001",
    shipmentId: SHIPMENT_ID,
    sweepId: "44000000-0000-4000-8000-000000000001",
    sweptAtUtc: "2026-10-08T17:30:00.000Z",
    cajuelaCount: 280,
    lineComponentOrder: 1,
    hasInputRecord: true,
    hasRemainderRecord: false,
  };
  return json({
    items: [
      {
        ...base,
        lineComponentId: "45000000-0000-4000-8000-000000000001",
        lineComponentName: "Rastra 1",
        inputGrams: 12.5,
        remainderGrams: null,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  });
}

function auditPage(
  shipmentStatus: "ACTIVE" | "COMPLETED" = "COMPLETED",
): Response {
  return json({
    items: [
      {
        id: "d1000000-0000-4000-8000-000000000001",
        actorDisplayName: "Responsable Uno",
        origin: "SYNC",
        action: "sync.ingest",
        entityType: "shipment",
        entityId: SHIPMENT_ID,
        shipmentStatus,
        result: "SUCCEEDED",
        reasonCode: null,
        changedFields: ["status"],
        changes: { status: { before: "PENDING", after: "APPROVED" } },
        occurredAt: "2026-10-08T18:00:00.000Z",
        recordedAt: "2026-10-08T18:00:05.000Z",
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (input === undefined) throw new Error("Expected request");
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
