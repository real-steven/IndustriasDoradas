import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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
      page: 2,
    });
    expect(shipmentDateRange(filters)).toEqual({
      fromUtc: "2026-10-08T06:00:00.000Z",
      toUtc: "2026-10-09T06:00:00.000Z",
    });
  });

  it("conserva filtros y pagina en la URL y los envia a la API", async () => {
    const transport = vi.fn<typeof fetch>(() =>
      Promise.resolve(shipmentPage({ page: 2, totalPages: 3 })),
    );
    vi.stubGlobal("fetch", transport);

    renderPortal(
      `/gerencia/cargamentos?period=date&date=2026-10-08&line=${LINE_ID}&supplier=${SUPPLIER_ID}&responsible=${WORKER_ID}&page=2`,
    );

    expect(await screen.findByText("CARGAMENTO 42000000")).toBeInTheDocument();
    const pagedRequest = transport.mock.calls.find(([input]) => {
      const candidate = new URL(requestUrl(input), "http://localhost");
      return candidate.searchParams.get("page") === "2";
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

  it("agrupa la auditoria por cargamento y abre su ficha", async () => {
    const transport = vi.fn<typeof fetch>((input) => {
      const url = new URL(requestUrl(input), "http://localhost");
      if (url.pathname.endsWith("/audit-events"))
        return Promise.resolve(auditPage());
      if (url.pathname.endsWith("/management/shipments"))
        return Promise.resolve(shipmentPage());
      throw new Error(`Unexpected request ${url.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal("/gerencia/auditoria");

    expect(await screen.findByText("CARGAMENTO 42000000")).toBeInTheDocument();
    expect(screen.getByText("Línea 1")).toBeInTheDocument();
    expect(
      screen.getByText("Proveedor Norte · 280 cajuelas"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ABRIR CARGAMENTO/u }),
    ).toHaveAttribute("href", `/gerencia/cargamentos/${SHIPMENT_ID}`);
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

function auditPage(): Response {
  return json({
    items: [
      {
        id: "d1000000-0000-4000-8000-000000000001",
        actorDisplayName: "Responsable Uno",
        action: "sync.ingest",
        entityType: "shipment",
        entityId: SHIPMENT_ID,
        result: "SUCCEEDED",
        reasonCode: null,
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
