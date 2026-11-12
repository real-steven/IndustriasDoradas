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
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";

describe("oro por cargamento", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps a recorded zero distinct from pending without duplicating supplier statistics", async () => {
    vi.stubGlobal("fetch", transport({ amount: 0, hasGold: true }));
    renderGold();

    expect(
      await screen.findByRole("button", { name: "CORREGIR RESULTADO" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Total registrado")).toBeInTheDocument();
    expect(screen.getByText("Pendientes")).toBeInTheDocument();
    expect(screen.getByText("Revisados sin dato")).toBeInTheDocument();
    expect(screen.queryByText("Resultados")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Excluidos" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("0 g").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "CORREGIR RESULTADO" }),
    ).toBeInTheDocument();
  });

  it("consulta un rango de fechas y permite mostrar todo", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: 2.5, hasGold: true });
    vi.stubGlobal("fetch", fetchMock);
    renderGold("/gerencia/oro?period=date&date=2026-10-01&to=2026-10-08");

    expect(await screen.findByLabelText("Desde")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-08");
    await waitFor(() => {
      const request = latestRequest(fetchMock, "/gold-summary");
      expect(request.searchParams.get("fromUtc")).toBe(
        "2026-10-01T06:00:00.000Z",
      );
      expect(request.searchParams.get("toUtc")).toBe(
        "2026-10-09T06:00:00.000Z",
      );
    });

    await user.selectOptions(screen.getByLabelText("Período"), "all");
    await waitFor(() => {
      const request = latestRequest(fetchMock, "/gold-summary");
      expect(request.searchParams.has("fromUtc")).toBe(false);
      expect(request.searchParams.has("toUtc")).toBe(false);
    });
    expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hasta")).not.toBeInTheDocument();
  });

  it("leaves an empty value unregistered and accepts zero explicitly", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: null, hasGold: false });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "REGISTRAR DATOS" }),
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
    expect(postBodies(fetchMock)).toContainEqual({
      amountGrams: 0,
      karat: null,
    });
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
      karat: null,
      correctionReason: "Corrección de pesada",
    });
  });

  it("exposes the gold editor as a modal and returns focus on Escape", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", transport({ amount: null, hasGold: false }));
    renderGold();

    const trigger = await screen.findByRole("button", {
      name: "REGISTRAR DATOS",
    });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: /Cargamento 42000000/u,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByRole("textbox", { name: "Oro total en gramos" }),
    ).toHaveFocus();

    const closeButton = screen.getByRole("button", {
      name: "Cerrar registro del cargamento",
    });
    closeButton.focus();
    await user.tab({ shift: true });
    expect(
      screen.getByRole("button", { name: "GUARDAR MERCURIO" }),
    ).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("combines gold and mercury without duplicating supplier statistics", async () => {
    vi.stubGlobal("fetch", transport({ amount: 2.5, hasGold: true }));
    renderGold();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Oro y mercurio" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Comparación por proveedor"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "CORREGIR RESULTADO" }),
    );
    expect(await screen.findByText("Mercurio por barrida")).toBeInTheDocument();
    expect(screen.getByLabelText("Barrida")).toBeInTheDocument();
  });

  it("marks a shipment reviewed without turning missing gold into zero", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: null, hasGold: false });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "REVISADO SIN DATO" }),
    );

    await user.type(
      screen.getByRole("textbox", { name: "Motivo breve" }),
      "No se conservó la pesada",
    );
    await user.click(
      screen.getByRole("button", { name: "CONFIRMAR SIN DATO" }),
    );

    expect(
      await screen.findByText("Cargamento revisado sin dato."),
    ).toBeInTheDocument();
    expect(postBodyFor(fetchMock, "/gold-reviews")).toEqual({
      disposition: "OMITTED",
      reason: "No se conservó la pesada",
    });
  });

  it("marks a shipment as read without hiding the option to register data", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: null, hasGold: false });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "MARCAR LEÍDO" }),
    );

    expect(
      await screen.findByText("Cargamento marcado como leído."),
    ).toBeInTheDocument();
    expect(postBodyFor(fetchMock, "/gold-reviews")).toEqual({
      disposition: "ACKNOWLEDGED",
    });
    expect(
      screen.getByRole("button", { name: "REGISTRAR DATOS" }),
    ).toBeInTheDocument();
  });

  it("shows gold, karat, mercury, cajuelas, revisions and status in the row", async () => {
    const fetchMock = transport({
      amount: 2.5,
      hasGold: true,
      karat: 21.125,
      overview: [
        {
          shipmentId: SHIPMENT_ID,
          mercury: {
            sweepCount: 3,
            completeSweepCount: 2,
            latestCompleteSweep: {
              sweepId: SWEEP_ID,
              sweptAtUtc: "2026-10-12T17:00:00.000Z",
              inputGrams: 240.6,
              remainderGrams: 30.9,
            },
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    const row = (await screen.findByText("Oro registrado")).closest("article");
    if (row === null) throw new Error("Expected shipment row");
    const facts = within(row);
    expect(facts.getByText("2,5 g")).toBeInTheDocument();
    expect(facts.getByText("21,125 k")).toBeInTheDocument();
    expect(
      await facts.findByText(/Entrada 240,6 g · Final 30,9 g/u),
    ).toBeInTheDocument();
    expect(
      facts.getByText(/Última barrida completa · 2 de 3 barridas completas/u),
    ).toBeInTheDocument();
    expect(facts.getByText("100")).toBeInTheDocument();
    expect(facts.getByText("Registrado")).toBeInTheDocument();
    expect(
      facts.getByRole("button", { name: "CORREGIR RESULTADO" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        latestRequest(fetchMock, "/gold-overview").searchParams.get(
          "shipmentIds",
        ),
      ).toBe(SHIPMENT_ID),
    );
  });

  it("shows Sin registrar for missing karat and mercury and pending status", async () => {
    vi.stubGlobal("fetch", transport({ amount: null, hasGold: false }));
    renderGold();

    const row = (await screen.findByText("Quilataje")).closest("article");
    if (row === null) throw new Error("Expected shipment row");
    expect(await within(row).findByText("Sin barridas")).toBeInTheDocument();
    expect(within(row).getAllByText("Sin registrar")).toHaveLength(2);
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
  });

  it("keeps current gold and karat visible and hides a history that only repeats them", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      transport({ amount: 2.5, hasGold: true, karat: 18 }),
    );
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "CORREGIR RESULTADO" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Oro vigente")).toBeInTheDocument();
    expect(await within(dialog).findByText("2,5 g")).toBeInTheDocument();
    expect(within(dialog).getByText("Quilataje vigente")).toBeInTheDocument();
    expect(within(dialog).getByText("18 k")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "Quilataje (opcional)" }),
    ).toHaveValue("18");
    expect(within(dialog).queryByText(/append-only/iu)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("VIGENTE")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Correcciones anteriores"),
    ).not.toBeInTheDocument();
  });

  it("records karat with the gold and corrects only the karat with a reason", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: null, hasGold: false });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "REGISTRAR DATOS" }),
    );
    await user.type(screen.getByPlaceholderText("Ej. 12,50"), "2,5");
    const karat = screen.getByRole("textbox", { name: "Quilataje (opcional)" });
    await user.type(karat, "25");
    await user.click(
      screen.getByRole("button", { name: "REGISTRAR RESULTADO" }),
    );
    expect(
      screen.getByText(/El quilataje debe estar entre 0 y 24/u),
    ).toBeInTheDocument();
    expect(postBodies(fetchMock)).toHaveLength(0);

    await user.clear(karat);
    await user.type(karat, "18,5");
    await user.click(
      screen.getByRole("button", { name: "REGISTRAR RESULTADO" }),
    );
    expect(
      await screen.findByText("Resultado registrado correctamente."),
    ).toBeInTheDocument();
    expect(postBodies(fetchMock)).toContainEqual({
      amountGrams: 2.5,
      karat: 18.5,
    });

    await user.clear(karat);
    await user.type(karat, "21");
    await user.type(
      screen.getByRole("textbox", { name: "Motivo de la corrección" }),
      "Ensayo de laboratorio",
    );
    await user.click(
      screen.getByRole("button", { name: "GUARDAR CORRECCIÓN" }),
    );
    expect(
      await screen.findByText("Corrección registrada como una nueva entrada."),
    ).toBeInTheDocument();
    expect(postBodies(fetchMock)).toContainEqual({
      amountGrams: 2.5,
      karat: 21,
      correctionReason: "Ensayo de laboratorio",
    });
  });

  it("lists only previous corrections when the result was corrected", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      transport({
        amount: 3.25,
        hasGold: true,
        history: [
          resultEntry(
            RESULT_ID,
            3.25,
            "2026-10-12T19:00:00.000Z",
            "Corrección de pesada",
          ),
          resultEntry(
            PREVIOUS_RESULT_ID,
            2.5,
            "2026-10-12T17:00:00.000Z",
            null,
          ),
        ],
      }),
    );
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "CORREGIR RESULTADO" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      await within(dialog).findByText("Correcciones anteriores"),
    ).toBeInTheDocument();
    const previous = within(dialog).getByRole("list", { name: "" });
    expect(within(previous).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(previous).getByText("2,5 g · Sin registrar"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /Motivo del valor vigente: Corrección de pesada/u,
      ),
    ).toBeInTheDocument();
  });

  it("requires a reason before correcting mercury received from desktop", async () => {
    const user = userEvent.setup();
    const fetchMock = transport({ amount: 2.5, hasGold: true });
    vi.stubGlobal("fetch", fetchMock);
    renderGold();

    await user.click(
      await screen.findByRole("button", { name: "CORREGIR RESULTADO" }),
    );
    const input = await screen.findByRole("textbox", {
      name: "Mercurio de entrada (g)",
    });
    await user.clear(input);
    await user.type(input, "14,25");
    await user.click(screen.getByRole("button", { name: "GUARDAR MERCURIO" }));
    expect(
      screen.getByText(/Indique el motivo para corregir/u),
    ).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(
        "Solo es obligatorio al cambiar un dato existente",
      ),
      "Corrección de pesada",
    );
    await user.click(screen.getByRole("button", { name: "GUARDAR MERCURIO" }));

    expect(
      await screen.findByText("Mercurio guardado correctamente."),
    ).toBeInTheDocument();
    expect(postBodyFor(fetchMock, `/sweeps/${SWEEP_ID}/mercury`)).toEqual({
      measurements: [
        {
          lineComponentId: COMPONENT_ID,
          inputGrams: 14.25,
          remainderGrams: 8.25,
        },
      ],
      correctionReason: "Corrección de pesada",
    });
  });
});

function renderGold(path = "/gerencia/oro"): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: ["gold.read", "gold.results.manage"],
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

function latestRequest(
  fetchMock: ReturnType<typeof transport>,
  pathname: string,
): URL {
  const matching = fetchMock.mock.calls
    .map(([input]) => new URL(requestUrl(input), "http://localhost"))
    .filter((request) => request.pathname.endsWith(pathname));
  const request = matching.at(-1);
  if (request === undefined) throw new Error(`Expected request ${pathname}`);
  return request;
}

function transport({
  amount,
  hasGold,
  karat = null,
  overview = defaultOverview(),
  history,
}: {
  amount: number | null;
  hasGold: boolean;
  karat?: number | null;
  overview?: unknown;
  history?: unknown[];
}) {
  return vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    if (url.includes("/gold-overview")) return Promise.resolve(json(overview));
    if (init?.method === "POST") {
      if (url.includes("/gold-reviews")) {
        const body = JSON.parse(requestBody(init)) as {
          disposition: "PENDING" | "ACKNOWLEDGED" | "OMITTED";
          reason?: string;
        };
        return Promise.resolve(
          json({
            id: REVIEW_ID,
            organizationId: ORGANIZATION_ID,
            shipmentId: SHIPMENT_ID,
            disposition: body.disposition,
            recordedAtUtc: "2026-10-12T18:05:00.000Z",
            recordedByProfileId: PROFILE_ID,
            recordedByDisplayName: "Lucía ficticia",
            supersedesEntryId: null,
            reason: body.reason ?? null,
          }),
        );
      }
      if (url.includes(`/sweeps/${SWEEP_ID}/mercury`))
        return Promise.resolve(
          json({
            items: [],
            page: 1,
            pageSize: 100,
            total: 0,
            totalPages: 0,
          }),
        );
      const body = JSON.parse(requestBody(init)) as {
        amountGrams: number;
        karat?: number | null;
        correctionReason?: string;
      };
      return Promise.resolve(
        json({
          id: RESULT_ID,
          organizationId: ORGANIZATION_ID,
          shipmentId: SHIPMENT_ID,
          amountGrams: body.amountGrams,
          karat: body.karat ?? null,
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
          pendingShipments: hasGold ? 1 : 2,
          acknowledgedShipments: 0,
          acknowledgedShipmentIds: [],
          omittedShipments: 0,
          omittedShipmentIds: [],
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
          history ??
            (hasGold
              ? [
                  {
                    id: PREVIOUS_RESULT_ID,
                    organizationId: ORGANIZATION_ID,
                    shipmentId: SHIPMENT_ID,
                    amountGrams: amount,
                    karat,
                    unitCode: "g",
                    recordedAtUtc: "2026-10-12T17:00:00.000Z",
                    recordedByProfileId: PROFILE_ID,
                    recordedByDisplayName: "Lucía ficticia",
                    supersedesResultId: null,
                    correctionReason: null,
                  },
                ]
              : []),
        ),
      );
    if (url.includes("/gold-reviews")) return Promise.resolve(json([]));
    if (url.includes("/sweeps"))
      return Promise.resolve(
        json({
          items: [
            {
              organizationId: ORGANIZATION_ID,
              shipmentId: SHIPMENT_ID,
              sweepId: SWEEP_ID,
              sweptAtUtc: "2026-10-12T17:00:00.000Z",
              cajuelaCount: 100,
              lineComponentId: COMPONENT_ID,
              lineComponentName: "Rastra 1",
              lineComponentOrder: 1,
              inputGrams: 12.5,
              remainderGrams: 8.25,
              hasInputRecord: true,
              hasRemainderRecord: true,
              inputMovementId: MOVEMENT_INPUT_ID,
              remainderMovementId: MOVEMENT_REMAINDER_ID,
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
          totalPages: 1,
        }),
      );
    if (url.includes("/management/shipments"))
      return Promise.resolve(json(shipmentPage(amount, hasGold, karat)));
    throw new Error(`Unexpected request: ${url}`);
  });
}

function defaultOverview() {
  return [
    {
      shipmentId: SHIPMENT_ID,
      mercury: {
        sweepCount: 0,
        completeSweepCount: 0,
        latestCompleteSweep: null,
      },
    },
  ];
}

function resultEntry(
  id: string,
  amountGrams: number,
  recordedAtUtc: string,
  correctionReason: string | null,
) {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    shipmentId: SHIPMENT_ID,
    amountGrams,
    karat: null,
    unitCode: "g",
    recordedAtUtc,
    recordedByProfileId: PROFILE_ID,
    recordedByDisplayName: "Lucía ficticia",
    supersedesResultId: null,
    correctionReason,
  };
}

function shipmentPage(
  amount: number | null,
  hasGold: boolean,
  karat: number | null = null,
) {
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
        goldKarat: hasGold ? karat : null,
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

function postBodyFor(
  fetchMock: ReturnType<typeof transport>,
  pathname: string,
): unknown {
  const call = fetchMock.mock.calls.find(
    ([input, init]) =>
      init?.method === "POST" && requestUrl(input).includes(pathname),
  );
  if (call === undefined) throw new Error(`Expected POST ${pathname}`);
  return JSON.parse(requestBody(call[1])) as unknown;
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
const SWEEP_ID = "43000000-0000-4000-8000-000000000001";
const COMPONENT_ID = "33000000-0000-4000-8000-000000000001";
const MOVEMENT_INPUT_ID = "45000000-0000-4000-8000-000000000001";
const MOVEMENT_REMAINDER_ID = "45000000-0000-4000-8000-000000000002";
const REVIEW_ID = "47000000-0000-4000-8000-000000000001";
