import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
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
import type {
  GoldResultEntry,
  ManagementShipment,
} from "../../api/generated/api-client";
import { AuthProvider } from "../../auth/auth-provider";

describe("recorrido gerencial de aceptación", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("completa login, consulta, oro, auditoría y cierre de sesión", async () => {
    const user = userEvent.setup();
    const auth = createSupabaseHarness();
    const api = createManagementApi();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.stubGlobal("fetch", api.fetch);

    render(
      <QueryProvider client={queryClient}>
        <AuthProvider client={auth.client}>
          <MemoryRouter initialEntries={["/login"]}>
            <App />
          </MemoryRouter>
        </AuthProvider>
      </QueryProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Bienvenido" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: /^correo$/iu }),
      "lucia@example.test",
    );
    await user.type(screen.getByLabelText(/^contraseña$/iu), "clave-ficticia");
    await user.click(
      screen.getByRole("button", { name: "INGRESAR AL PORTAL →" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Buenos días, Lucía." }),
    ).toBeInTheDocument();
    expect(await screen.findByText("1 línea activa")).toBeInTheDocument();
    const summaryLine = screen
      .getByRole("heading", { name: "Línea 1" })
      .closest("article");
    expect(summaryLine).not.toBeNull();
    if (summaryLine === null) throw new Error("Expected summary line");
    expect(within(summaryLine).getByText("260")).toBeInTheDocument();
    expect(
      within(summaryLine).getByText("Proveedor Norte"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Operación" }));
    expect(
      await screen.findByRole("heading", { name: "Operación" }),
    ).toBeInTheDocument();
    expect(screen.getByText("510 cajuelas")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Cargamentos" }));
    expect(await screen.findByText("CARGAMENTO 42000000")).toBeInTheDocument();
    await screen.findByRole("option", { name: "Proveedor Norte" });
    await user.selectOptions(screen.getByLabelText("Proveedor"), SUPPLIER_ID);
    await waitFor(() =>
      expect(
        api.requestedUrls.some((value) => {
          const url = new URL(value, "http://localhost");
          return url.searchParams.get("supplierId") === SUPPLIER_ID;
        }),
      ).toBe(true),
    );

    await user.click(screen.getByRole("link", { name: /ABRIR DETALLE/u }));
    expect(
      await screen.findByRole("heading", { name: "42000000" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Rastra 1")).toBeInTheDocument();
    expect(screen.getByText("Entrada: 12,5 g")).toBeInTheDocument();
    expect(
      await screen.findByText("Cambio operativo recibido"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Oro" }));
    expect(await screen.findByText("Pendiente")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "REGISTRAR ORO" }));
    const amount = screen.getByRole("textbox", {
      name: "Oro total en gramos",
    });
    await user.type(amount, "0");
    await user.click(
      screen.getByRole("button", { name: "REGISTRAR RESULTADO" }),
    );
    expect(
      await screen.findByText("Resultado registrado correctamente."),
    ).toBeInTheDocument();
    expect(api.postBodies[0]).toEqual({ amountGrams: 0 });

    await user.clear(amount);
    await user.type(amount, "1,25");
    await user.type(
      screen.getByRole("textbox", { name: "Motivo de la corrección" }),
      "Ajuste de pesada final",
    );
    await user.click(
      screen.getByRole("button", { name: "GUARDAR CORRECCIÓN" }),
    );
    expect(
      await screen.findByText("Corrección registrada como una nueva entrada."),
    ).toBeInTheDocument();
    expect(api.postBodies[1]).toEqual({
      amountGrams: 1.25,
      correctionReason: "Ajuste de pesada final",
    });

    await user.click(
      screen.getByRole("button", { name: "Cerrar registro de oro" }),
    );
    expect(screen.getAllByText("1,25 g").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("link", { name: "Auditoría" }));
    expect(await screen.findByText("CARGAMENTO 42000000")).toBeInTheDocument();
    expect(screen.getAllByText("business.mutation")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: /ABRIR CARGAMENTO/u }),
    ).toHaveAttribute("href", `/gerencia/cargamentos/${SHIPMENT_ID}`);

    await user.click(screen.getByRole("link", { name: /Estadísticas/u }));
    expect(
      await screen.findByRole("heading", { name: "Módulo reservado" }),
    ).toBeInTheDocument();
    const main = document.getElementById("contenido-gerencial");
    expect(main).not.toBeNull();
    if (main === null) throw new Error("Expected manager content");
    expect(within(main).getAllByText("PRÓXIMAMENTE").length).toBeGreaterThan(0);
    expect(within(main).queryByRole("button")).not.toBeInTheDocument();
    expect(within(main).queryByRole("link")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(
      await screen.findByRole("heading", { name: "Bienvenido" }),
    ).toBeInTheDocument();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  }, 15_000);
});

function createSupabaseHarness(): {
  client: SupabaseClient;
  signOut: ReturnType<typeof vi.fn>;
} {
  let callback:
    ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  const signOut = vi.fn(() => Promise.resolve({ error: null }));
  const signInWithPassword = vi.fn(
    ({ email, password }: { email: string; password: string }) => {
      const session = authSession();
      queueMicrotask(() => callback?.("SIGNED_IN", session));
      return Promise.resolve({
        data: { user: session.user, session },
        error: email.length > 0 && password.length > 0 ? null : new Error(),
      });
    },
  );
  const client = {
    auth: {
      onAuthStateChange: vi.fn(
        (
          nextCallback: (
            event: AuthChangeEvent,
            session: Session | null,
          ) => void,
        ) => {
          callback = nextCallback;
          queueMicrotask(() => callback?.("INITIAL_SESSION", null));
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
      ),
      signInWithPassword,
      resetPasswordForEmail: vi.fn(() =>
        Promise.resolve({ data: {}, error: null }),
      ),
      signOut,
    },
  } as unknown as SupabaseClient;
  return { client, signOut };
}

function authSession(): Session {
  return {
    access_token: "fictitious-manager-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1_800_000_000,
    refresh_token: "fictitious-refresh-token",
    user: { id: USER_ID },
  } as Session;
}

function createManagementApi(): {
  fetch: typeof globalThis.fetch;
  requestedUrls: string[];
  postBodies: Record<string, unknown>[];
} {
  const requestedUrls: string[] = [];
  const postBodies: Record<string, unknown>[] = [];
  const goldEntries: GoldResultEntry[] = [];
  const auditEvents = [auditEvent("sync-event", "sync.ingest")];

  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const rawUrl = requestUrl(input);
    const url = new URL(rawUrl, "http://localhost");
    const method = init?.method ?? "GET";
    requestedUrls.push(rawUrl);

    if (url.pathname.endsWith("/auth/session"))
      return Promise.resolve(
        json({
          profileId: PROFILE_ID,
          organizationId: ORGANIZATION_ID,
          role: "JEFE_EMPRESA",
          permissions: [
            "management.read",
            "gold.read",
            "gold.results.manage",
            "audit.read_redacted",
          ],
          expiresAt: "2027-01-15T00:00:00.000Z",
        }),
      );

    if (url.pathname.endsWith("/management/freshness"))
      return Promise.resolve(
        json({
          cursor: "djE6NDI=",
          hasChanges: false,
          effectiveAtUtc: "2026-10-13T15:30:00.000Z",
          serverTimeUtc: "2026-10-13T15:30:01.000Z",
          pollAfterSeconds: 30,
        }),
      );

    if (url.pathname.endsWith("/management/operation-lines"))
      return Promise.resolve(page([operationLine()], 100));

    if (
      url.pathname.endsWith(`/management/shipments/${SHIPMENT_ID}/gold-results`)
    ) {
      if (method === "POST") {
        const body = parseBody(init);
        postBodies.push(body);
        const previous = goldEntries[0];
        const entry: GoldResultEntry = {
          id: `46000000-0000-4000-8000-00000000000${goldEntries.length + 1}`,
          organizationId: ORGANIZATION_ID,
          shipmentId: SHIPMENT_ID,
          amountGrams: numberField(body, "amountGrams"),
          unitCode: "g",
          recordedAtUtc: `2026-10-13T18:0${goldEntries.length}:00.000Z`,
          recordedByProfileId: PROFILE_ID,
          recordedByDisplayName: "Lucía",
          supersedesResultId: previous?.id ?? null,
          correctionReason: optionalStringField(body, "correctionReason"),
        };
        goldEntries.unshift(entry);
        auditEvents.unshift(
          auditEvent(`gold-event-${goldEntries.length}`, "business.mutation"),
        );
        return Promise.resolve(json(entry));
      }
      return Promise.resolve(json(goldEntries));
    }

    if (url.pathname.endsWith(`/management/shipments/${SHIPMENT_ID}/sweeps`))
      return Promise.resolve(page([sweep()], 100));

    if (url.pathname.endsWith(`/management/shipments/${SHIPMENT_ID}`))
      return Promise.resolve(json(shipment(goldEntries)));

    if (url.pathname.endsWith("/management/gold-summary"))
      return Promise.resolve(json(goldSummary(goldEntries)));

    if (url.pathname.endsWith("/management/shipments")) {
      const pageSize = Number(url.searchParams.get("pageSize") ?? "10");
      return Promise.resolve(page([shipment(goldEntries)], pageSize));
    }

    if (url.pathname.endsWith("/audit-events"))
      return Promise.resolve(page(auditEvents, 100));

    return Promise.reject(new Error(`Unexpected request: ${method} ${rawUrl}`));
  });

  return { fetch, requestedUrls, postBodies };
}

function operationLine() {
  return {
    organizationId: ORGANIZATION_ID,
    plantId: PLANT_ID,
    stationId: STATION_ID,
    stationName: "Estación Central",
    shipmentId: SHIPMENT_ID,
    feedCycleId: FEED_CYCLE_ID,
    productionLineId: LINE_ID,
    productionLineName: "Línea 1",
    productionLineOrder: 1,
    supplierId: SUPPLIER_ID,
    supplierName: "Proveedor Norte",
    responsibleWorkerId: WORKER_ID,
    responsibleWorkerName: "Responsable Uno",
    startedAtUtc: "2026-10-13T14:00:00.000Z",
    cajuelaTotal: 260,
    sweepCount: 1,
    sweptCajuelas: 250,
    cajuelasSinceLastSweep: 10,
    nextSweepAt: 510,
    sweepPending: false,
    lastActivityAtUtc: "2026-10-13T15:30:00.000Z",
  };
}

function shipment(entries: GoldResultEntry[]): ManagementShipment {
  const current = entries[0];
  return {
    ...operationLine(),
    status: "COMPLETED",
    completedAtUtc: "2026-10-13T18:00:00.000Z",
    goldResultId: current?.id ?? null,
    goldAmountGrams: current?.amountGrams ?? null,
    goldUnitCode: current === undefined ? null : "g",
    goldRecordedAtUtc: current?.recordedAtUtc ?? null,
    goldRecordedByProfileId: current?.recordedByProfileId ?? null,
    goldRevisionCount: entries.length === 0 ? null : entries.length,
    hasGoldResult: current !== undefined,
  };
}

function sweep() {
  return {
    organizationId: ORGANIZATION_ID,
    shipmentId: SHIPMENT_ID,
    sweepId: SWEEP_ID,
    sweptAtUtc: "2026-10-13T17:30:00.000Z",
    cajuelaCount: 260,
    lineComponentId: COMPONENT_ID,
    lineComponentName: "Rastra 1",
    lineComponentOrder: 1,
    inputGrams: 12.5,
    remainderGrams: null,
    hasInputRecord: true,
    hasRemainderRecord: false,
  };
}

function goldSummary(entries: GoldResultEntry[]) {
  const current = entries[0];
  const registered = current === undefined ? 0 : 1;
  const amount = current?.amountGrams ?? 0;
  return {
    totalShipments: 1,
    registeredShipments: registered,
    excludedShipments: 1 - registered,
    coveragePercentage: registered * 100,
    totalGoldGrams: amount,
    includedCajuelas: registered * 260,
    gramsPerCajuela: current === undefined ? null : amount / 260,
    suppliers: [
      {
        supplierId: SUPPLIER_ID,
        supplierName: "Proveedor Norte",
        totalShipments: 1,
        registeredShipments: registered,
        excludedShipments: 1 - registered,
        coveragePercentage: registered * 100,
        totalGoldGrams: amount,
        includedCajuelas: registered * 260,
        gramsPerCajuela: current === undefined ? null : amount / 260,
      },
    ],
  };
}

function auditEvent(id: string, action: string) {
  return {
    id,
    actorDisplayName: action === "sync.ingest" ? "Responsable Uno" : "Lucía",
    action,
    entityType: "shipment",
    entityId: SHIPMENT_ID,
    result: "SUCCEEDED",
    reasonCode: null,
    occurredAt: "2026-10-13T18:00:00.000Z",
    recordedAt: "2026-10-13T18:00:05.000Z",
  } as const;
}

function page<T>(items: T[], pageSize: number) {
  return json({
    items,
    page: 1,
    pageSize,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  });
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string")
    throw new Error("Expected a JSON request body");
  return JSON.parse(init.body) as Record<string, unknown>;
}

function numberField(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== "number") throw new Error(`Expected ${field}`);
  return value;
}

function optionalStringField(
  body: Record<string, unknown>,
  field: string,
): string | null {
  const value = body[field];
  if (value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Expected ${field}`);
  return value;
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
      ? input.href
      : input.url;
}

const USER_ID = "90000000-0000-4000-8000-000000000001";
const PROFILE_ID = "a1000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const LINE_ID = "32000000-0000-4000-8000-000000000001";
const STATION_ID = "34000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000001";
const FEED_CYCLE_ID = "41000000-0000-4000-8000-000000000001";
const SHIPMENT_ID = "42000000-0000-4000-8000-000000000001";
const SWEEP_ID = "44000000-0000-4000-8000-000000000001";
const COMPONENT_ID = "45000000-0000-4000-8000-000000000001";
const WORKER_ID = "52000000-0000-4000-8000-000000000001";
