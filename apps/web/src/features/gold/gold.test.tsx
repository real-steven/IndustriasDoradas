import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";

describe("oro por cargamento", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows supplier coverage and keeps a recorded zero distinct from pending", async () => {
    vi.stubGlobal("fetch", transport({ amount: 0, hasGold: true }));
    renderGold();

    expect(await screen.findByText("50 %")).toBeInTheDocument();
    expect(screen.getByText("1 excluidos sin registro")).toBeInTheDocument();
    expect(screen.getAllByText("0 g").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "CORREGIR RESULTADO" }),
    ).toBeInTheDocument();
  });

  it("leaves an empty value unregistered and accepts zero explicitly", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: null, hasGold: false });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "REGISTRAR ORO" }),
    );
    await user.click(
      screen.getByRole("button", { name: "REGISTRAR RESULTADO" }),
    );
    expect(
      screen.getByText(/Vacío conserva el cargamento como no registrado/u),
    ).toBeInTheDocument();
    expect(postBodies(fetchMock)).toHaveLength(0);

    await user.type(screen.getByPlaceholderText("Ej. 12,50"), "0");
    expect(screen.getAllByText(/0 palos equivalentes/u).length).toBeGreaterThan(
      0,
    );
    await user.click(
      screen.getByRole("button", { name: "REGISTRAR RESULTADO" }),
    );

    expect(
      await screen.findByText("Resultado registrado correctamente."),
    ).toBeInTheDocument();
    expect(postBodies(fetchMock)).toContainEqual({ amountGrams: 0 });
  });

  it("requires and sends a reason for a correction", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: 2.5, hasGold: true });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "CORREGIR RESULTADO" }),
    );
    const amount = screen.getByPlaceholderText("Ej. 12,50");
    await user.clear(amount);
    await user.type(amount, "3,25");
    await user.click(
      screen.getByRole("button", { name: "GUARDAR CORRECCIÓN" }),
    );
    expect(
      screen.getByText("Indique el motivo de la corrección."),
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Motivo de la corrección" }),
      "Corrección de pesada",
    );
    await user.click(
      screen.getByRole("button", { name: "GUARDAR CORRECCIÓN" }),
    );

    expect(
      await screen.findByText("Corrección registrada como una nueva entrada."),
    ).toBeInTheDocument();
    expect(postBodies(fetchMock)).toContainEqual({
      amountGrams: 3.25,
      correctionReason: "Corrección de pesada",
    });
  });
});

function renderGold(): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: ["gold.read", "gold.results.manage"],
      expiresAt: "2026-10-13T01:00:00Z",
    },
    loading: false,
    error: null,
    signIn: vi.fn(),
    recover: vi.fn(),
    signOut: vi.fn(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <AuthContext.Provider value={auth}>
      <QueryProvider client={client}>
        <MemoryRouter initialEntries={["/gerencia/oro"]}>
          <App />
        </MemoryRouter>
      </QueryProvider>
    </AuthContext.Provider>,
  );
}

function transport({
  amount,
  hasGold,
}: {
  amount: number | null;
  hasGold: boolean;
}) {
  return vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    if (init?.method === "POST") {
      const body = JSON.parse(requestBody(init)) as {
        amountGrams: number;
        correctionReason?: string;
      };
      return Promise.resolve(
        json({
          id: RESULT_ID,
          organizationId: ORGANIZATION_ID,
          shipmentId: SHIPMENT_ID,
          amountGrams: body.amountGrams,
          unitCode: "g",
          recordedAtUtc: "2026-10-12T18:00:00.000Z",
          recordedByProfileId: PROFILE_ID,
          recordedByDisplayName: "Lucía ficticia",
          supersedesResultId: hasGold ? PREVIOUS_RESULT_ID : null,
          correctionReason: body.correctionReason ?? null,
        }),
      );
    }
    if (url.includes("/gold-summary"))
      return Promise.resolve(
        json({
          totalShipments: 2,
          registeredShipments: 1,
          excludedShipments: 1,
          coveragePercentage: 50,
          totalGoldGrams: amount ?? 0,
          includedCajuelas: hasGold ? 100 : 0,
          gramsPerCajuela: hasGold ? (amount ?? 0) / 100 : null,
          suppliers: [
            {
              supplierId: SUPPLIER_ID,
              supplierName: "Proveedor Norte",
              totalShipments: 2,
              registeredShipments: 1,
              excludedShipments: 1,
              coveragePercentage: 50,
              totalGoldGrams: amount ?? 0,
              includedCajuelas: hasGold ? 100 : 0,
              gramsPerCajuela: hasGold ? (amount ?? 0) / 100 : null,
            },
          ],
        }),
      );
    if (url.includes("/gold-results"))
      return Promise.resolve(
        json(
          hasGold
            ? [
                {
                  id: PREVIOUS_RESULT_ID,
                  organizationId: ORGANIZATION_ID,
                  shipmentId: SHIPMENT_ID,
                  amountGrams: amount,
                  unitCode: "g",
                  recordedAtUtc: "2026-10-12T17:00:00.000Z",
                  recordedByProfileId: PROFILE_ID,
                  recordedByDisplayName: "Lucía ficticia",
                  supersedesResultId: null,
                  correctionReason: null,
                },
              ]
            : [],
        ),
      );
    if (url.includes("/management/shipments"))
      return Promise.resolve(json(shipmentPage(amount, hasGold)));
    throw new Error(`Unexpected request: ${url}`);
  });
}

function shipmentPage(amount: number | null, hasGold: boolean) {
  return {
    items: [
      {
        organizationId: ORGANIZATION_ID,
        plantId: "31000000-0000-4000-8000-000000000001",
        stationId: "34000000-0000-4000-8000-000000000001",
        stationName: "Estación Central",
        shipmentId: SHIPMENT_ID,
        feedCycleId: "41000000-0000-4000-8000-000000000001",
        productionLineId: "32000000-0000-4000-8000-000000000001",
        productionLineName: "Línea 1",
        productionLineOrder: 1,
        supplierId: SUPPLIER_ID,
        supplierName: "Proveedor Norte",
        responsibleWorkerId: null,
        responsibleWorkerName: null,
        startedAtUtc: "2026-10-12T12:00:00.000Z",
        cajuelaTotal: 100,
        sweepCount: 1,
        sweptCajuelas: 100,
        cajuelasSinceLastSweep: 0,
        nextSweepAt: 350,
        sweepPending: false,
        lastActivityAtUtc: "2026-10-12T18:00:00.000Z",
        status: "COMPLETED",
        completedAtUtc: "2026-10-12T18:00:00.000Z",
        goldResultId: hasGold ? PREVIOUS_RESULT_ID : null,
        goldAmountGrams: amount,
        goldUnitCode: hasGold ? "g" : null,
        goldRecordedAtUtc: hasGold ? "2026-10-12T18:00:00.000Z" : null,
        goldRecordedByProfileId: hasGold ? PROFILE_ID : null,
        goldRevisionCount: hasGold ? 1 : null,
        hasGoldResult: hasGold,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  };
}

function postBodies(fetchMock: ReturnType<typeof transport>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(requestBody(init)) as unknown);
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string")
    throw new Error("Expected a JSON request body");
  return init.body;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PROFILE_ID = "a1000000-0000-4000-8000-000000000001";
const SHIPMENT_ID = "42000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000001";
const RESULT_ID = "46000000-0000-4000-8000-000000000002";
const PREVIOUS_RESULT_ID = "46000000-0000-4000-8000-000000000001";
