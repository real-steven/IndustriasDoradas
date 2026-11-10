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
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";

let downloadClicks = 0;

describe("reportes gerenciales", () => {
  beforeEach(() => {
    downloadClicks = 0;
    localStorage.clear();
    const NativeUrl = URL;
    class TestUrl extends NativeUrl {
      static createObjectURL = vi.fn(() => "blob:report");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", TestUrl);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      downloadClicks += 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("previews one concise shipment table with the recommended fields", async () => {
    const user = userEvent.setup();
    const transport = vi.fn<typeof fetch>((input) =>
      Promise.resolve(responseFor(input)),
    );
    vi.stubGlobal("fetch", transport);

    renderReports();

    expect(
      await screen.findByRole("heading", { name: "Crear reporte operativo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Ingresos y gastos de oro"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "REVISAR VISTA PREVIA" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Vista previa del reporte" }),
    ).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", {
      name: "Vista previa del reporte",
    });
    expect(within(dialog).getByText("42000001")).toBeInTheDocument();
    expect(within(dialog).getByText("13,42")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Proveedor Norte")).toHaveLength(2);
    expect(within(dialog).queryByText("Cobertura")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Cajuelas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GENERAR EXCEL" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "GENERAR PDF" })).toBeEnabled();
  });

  it("sends the report filters to the API and downloads the PDF filename from the server", async () => {
    const user = userEvent.setup();
    const transport = vi.fn<typeof fetch>((input, init) =>
      Promise.resolve(responseFor(input, init)),
    );
    vi.stubGlobal("fetch", transport);

    renderReports();
    await screen.findByRole("heading", { name: "Crear reporte operativo" });
    await screen.findByRole("option", { name: "Línea Norte" });
    await screen.findByRole("option", { name: "Proveedor Norte" });
    await user.selectOptions(screen.getByLabelText("LÍNEA"), "line-id");
    await user.selectOptions(screen.getByLabelText("PROVEEDOR"), "supplier-id");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "REVISAR VISTA PREVIA" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "REVISAR VISTA PREVIA" }),
    );
    await user.click(screen.getByRole("button", { name: "GENERAR PDF" }));

    await waitFor(() => {
      expect(
        transport.mock.calls.some(([input, init]) => {
          const url = new URL(requestUrl(input), "http://localhost");
          return (
            url.pathname.endsWith("/reports/production.pdf") &&
            url.searchParams.get("productionLineId") === "line-id" &&
            url.searchParams.get("supplierId") === "supplier-id" &&
            url.searchParams.get("sections") === "shipments,financial" &&
            url.searchParams.get("fields") ===
              "date,shipment,supplier,gold,karat" &&
            new Headers(init?.headers).get("Authorization") ===
              "Bearer fictitious-token"
          );
        }),
      ).toBe(true);
    });
    expect(downloadClicks).toBe(1);
  });

  it("saves the selected fields for future reports on the same device", async () => {
    const user = userEvent.setup();
    const transport = vi.fn<typeof fetch>((input, init) =>
      Promise.resolve(responseFor(input, init)),
    );
    vi.stubGlobal("fetch", transport);

    renderReports();
    await screen.findByRole("heading", { name: "Crear reporte operativo" });
    await user.click(screen.getByRole("checkbox", { name: /Cajuelas/u }));
    await user.click(screen.getByRole("button", { name: "GUARDAR SELECCIÓN" }));
    expect(
      screen.getByText("Selección guardada en este equipo."),
    ).toBeInTheDocument();
    expect(
      JSON.parse(
        localStorage.getItem(
          "industrias-doradas:reports:production-fields:v1",
        ) ?? "[]",
      ),
    ).toContain("cajuelas");

    cleanup();
    renderReports();
    expect(
      await screen.findByRole("checkbox", { name: /Cajuelas/u }),
    ).toBeChecked();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "REVISAR VISTA PREVIA" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "REVISAR VISTA PREVIA" }),
    );
    await user.click(screen.getByRole("button", { name: "GENERAR PDF" }));

    await waitFor(() =>
      expect(
        transport.mock.calls.some(([input]) => {
          const url = new URL(requestUrl(input), "http://localhost");
          return (
            url.pathname.endsWith("/reports/production.pdf") &&
            url.searchParams.get("fields") ===
              "date,shipment,supplier,gold,karat,cajuelas"
          );
        }),
      ).toBe(true),
    );
  });
});

function renderReports(): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: "30000000-0000-4000-8000-000000000001",
      displayName: "Lucía",
      role: "JEFE_EMPRESA",
      permissions: ["reports.read", "reports.manage"],
      expiresAt: "2026-11-05T01:00:00Z",
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
        <MemoryRouter initialEntries={["/gerencia/reportes"]}>
          <App />
        </MemoryRouter>
      </QueryProvider>
    </AuthContext.Provider>,
  );
}

function responseFor(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(requestUrl(input), "http://localhost");
  if (url.pathname.endsWith("/reports/production.pdf")) {
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer fictitious-token",
    );
    return new Response(new Uint8Array([37, 80, 68, 70]), {
      status: 200,
      headers: {
        "Content-Disposition":
          'attachment; filename="reporte-produccion-oro_2026-11.pdf"',
        "Content-Type": "application/pdf",
      },
    });
  }
  if (url.pathname.endsWith("/management/statistics"))
    return json(statistics());
  if (url.pathname.endsWith("/reports/settlements")) return json([]);
  if (url.pathname.endsWith("/reports/production")) return json(report());
  throw new Error(`Unexpected request ${url.pathname}`);
}

function statistics() {
  const metrics = {
    completedShipments: 2,
    totalCajuelas: 300,
    sweepCount: 3,
    goldShipments: 1,
    totalGoldGrams: 0,
    includedCajuelas: 150,
    gramsPerCajuela: 0,
    goldCoveragePercentage: 50,
    averageShipmentHours: 6,
  };
  return {
    generatedAtUtc: "2026-11-04T18:00:00.000Z",
    sections: ["summary", "shipments"],
    fields: ["date", "shipment", "supplier", "gold", "karat"],
    period: {
      fromUtc: "2026-11-01T06:00:00.000Z",
      toUtc: "2026-11-05T06:00:00.000Z",
      bucket: "day",
    },
    summary: metrics,
    previousSummary: null,
    timeline: [],
    previousTimeline: [],
    productionLines: [{ id: "line-id", name: "Línea Norte", ...metrics }],
    suppliers: [{ id: "supplier-id", name: "Proveedor Norte", ...metrics }],
  };
}

function report() {
  const metrics = {
    completedShipments: 2,
    totalCajuelas: 300,
    sweepCount: 3,
    goldShipments: 1,
    pendingGoldShipments: 1,
    totalGoldGrams: 0,
    includedCajuelas: 150,
    gramsPerCajuela: 0,
    palosPerCajuela: 0,
    goldCoveragePercentage: 50,
  };
  return {
    version: "production-gold-v1",
    language: "es",
    timezone: "America/Costa_Rica",
    generatedAtUtc: "2026-11-04T18:00:00.000Z",
    period: {
      fromUtc: "2026-11-01T06:00:00.000Z",
      toUtc: "2026-11-05T06:00:00.000Z",
    },
    summary: metrics,
    suppliers: [
      {
        supplierId: "supplier-id",
        supplierName: "Proveedor Norte",
        ...metrics,
      },
    ],
    shipments: [
      reportShipment({ goldAmountGrams: 0, palosPerCajuela: 0 }),
      reportShipment({
        shipmentId: "42000000-0000-4000-8000-000000000002",
        shipmentCode: "42000002",
        goldStatus: "PENDING",
        goldAmountGrams: null,
        gramsPerCajuela: null,
        palosPerCajuela: null,
      }),
    ],
    financialSettlements: [
      {
        id: "settlement-id",
        supplierId: "supplier-id",
        lines: [
          {
            shipmentId: "42000000-0000-4000-8000-000000000001",
            karat: 13.42,
            displayOrder: 1,
          },
        ],
      },
    ],
  };
}

function reportShipment(overrides: Record<string, unknown> = {}) {
  return {
    shipmentId: "42000000-0000-4000-8000-000000000001",
    shipmentCode: "42000001",
    productionLineName: "Línea Norte",
    supplierId: "supplier-id",
    supplierName: "Proveedor Norte",
    responsibleWorkerName: "Responsable Uno",
    completedAtUtc: "2026-11-03T18:00:00.000Z",
    durationHours: 6,
    cajuelaTotal: 150,
    sweepCount: 2,
    goldStatus: "REGISTERED",
    goldAmountGrams: 75,
    gramsPerCajuela: 0.5,
    palosPerCajuela: 5,
    ...overrides,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}
