import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";
import {
  auditActivityServerFilters,
  auditFilterDefinitions,
  selectedAuditFilter,
  shipmentServerFilters,
  type AuditViewKey,
} from "./management-audit-filters";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const LINE_ID = "32000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000001";
const WORKER_ID = "52000000-0000-4000-8000-000000000001";

const params = (value: string) => new URLSearchParams(value);

describe("filtros de auditoría dependientes del área", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each<[AuditViewKey, string[]]>([
    ["all", []],
    ["shipments", ["date", "line", "supplier", "cajuelas", "gold"]],
    ["operation", ["action", "line"]],
    ["people", ["person", "action"]],
    ["security", ["action"]],
    ["administration", ["action"]],
  ])("ofrece los filtros propios del área %s", (view, keys) => {
    expect(auditFilterDefinitions(view).map((filter) => filter.key)).toEqual(
      keys,
    );
  });

  it.each<[AuditViewKey, string, string]>([
    ["operation", "line_started", "LINE_STARTED"],
    ["operation", "shipment_completed", "SHIPMENT_COMPLETED"],
    ["operation", "sweep", "SWEEP_RECORDED,MERCURY_RECORDED"],
    ["operation", "responsible", "RESPONSIBLE_CHANGED"],
    ["operation", "correction", "CAJUELA_REVERSED"],
    ["people", "check_in", "ATTENDANCE_CHECK_IN"],
    ["people", "check_out", "ATTENDANCE_CHECK_OUT"],
    ["people", "check_in_corrected", "ATTENDANCE_CHECK_IN_CORRECTED"],
    ["people", "check_out_corrected", "ATTENDANCE_CHECK_OUT_CORRECTED"],
    ["people", "user_created", "USER_CREATED"],
    [
      "people",
      "account_changed",
      "USER_SUSPENDED,USER_REACTIVATED,USER_UPDATED,WORKER_UPDATED",
    ],
    ["security", "session", "SESSION_SIGNED_IN"],
    ["security", "station", "STATION_OPENED,STATION_CLOSED"],
    ["security", "pin", "ELEVATION_PIN"],
    ["security", "biometric", "ELEVATION_BIOMETRIC"],
    [
      "security",
      "rejected",
      "SECURITY_REJECTED,SESSION_EXPIRED,ELEVATION_ENDED,PERMISSION_BLOCKED",
    ],
    ["administration", "gold", "GOLD_RESULT"],
    ["administration", "supplier", "SUPPLIER_CHANGED"],
    ["administration", "lines", "LINE_CONFIGURATION"],
    ["administration", "plant", "PLANT_CONFIGURATION"],
    ["administration", "permissions", "PERMISSIONS_UPDATED"],
    ["administration", "payroll", "PAYROLL_CHANGED"],
    ["administration", "settlement", "SETTLEMENT_CHANGED"],
    ["administration", "other", "ADMIN_CHANGE"],
  ])(
    "%s · acción %s se filtra en el servidor como %s",
    (view, value, kinds) => {
      const selected = selectedAuditFilter(
        view,
        params(`filter=action&value=${value}`),
      );

      expect(auditActivityServerFilters(selected)).toEqual({ kinds });
    },
  );

  it("filtra operación por línea y personal por persona", () => {
    expect(
      auditActivityServerFilters(
        selectedAuditFilter(
          "operation",
          params(`filter=line&value=${LINE_ID}`),
        ),
      ),
    ).toEqual({ productionLineId: LINE_ID });
    expect(
      auditActivityServerFilters(
        selectedAuditFilter(
          "people",
          params(`filter=person&value=${WORKER_ID}`),
        ),
      ),
    ).toEqual({ workerId: WORKER_ID });
  });

  it.each<[string, Record<string, string>]>([
    ["filter=date&value=recent", { sort: "recent" }],
    ["filter=date&value=oldest", { sort: "oldest" }],
    ["filter=cajuelas&value=cajuelas_desc", { sort: "cajuelas_desc" }],
    ["filter=cajuelas&value=cajuelas_asc", { sort: "cajuelas_asc" }],
    [`filter=line&value=${LINE_ID}`, { productionLineId: LINE_ID }],
    [`filter=supplier&value=${SUPPLIER_ID}`, { supplierId: SUPPLIER_ID }],
    ["filter=gold&value=recorded", { goldResult: "recorded" }],
    ["filter=gold&value=pending", { goldResult: "pending" }],
  ])("cargamentos finalizados: %s", (query, expected) => {
    expect(
      shipmentServerFilters(selectedAuditFilter("shipments", params(query))),
    ).toEqual(expected);
  });

  it("descarta filtros y valores que no corresponden al área", () => {
    expect(
      selectedAuditFilter(
        "security",
        params(`filter=person&value=${WORKER_ID}`),
      ),
    ).toEqual({});
    expect(
      auditActivityServerFilters(
        selectedAuditFilter("people", params("filter=action&value=pin")),
      ),
    ).toEqual({});
    expect(
      auditActivityServerFilters(
        selectedAuditFilter("operation", params("filter=line&value=Linea 1")),
      ),
    ).toEqual({});
    expect(
      shipmentServerFilters(
        selectedAuditFilter(
          "shipments",
          params("filter=cajuelas&value=recent"),
        ),
      ),
    ).toEqual({});
    expect(selectedAuditFilter("all", params("filter=action"))).toEqual({});
  });

  it("sin área elegida el filtro dependiente queda desactivado", async () => {
    stubApi();
    renderPortal("/gerencia/auditoria");

    const filterBy = await screen.findByRole("combobox", {
      name: "Filtrar por",
    });
    expect(filterBy).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
    ).toBeDisabled();
  });

  it("operación: Línea muestra las líneas y filtra en el servidor", async () => {
    const transport = stubApi();
    const user = userEvent.setup();
    renderPortal("/gerencia/auditoria?view=operation");

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Filtrar por" }),
      "line",
    );
    const value = screen.getByRole("combobox", { name: "Valor del filtro" });
    expect(
      await screen.findByRole("option", { name: "Línea 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Línea 4 (inactivo)" }),
    ).toBeInTheDocument();
    await user.selectOptions(value, LINE_ID);

    await waitFor(() =>
      expect(lastAuditQuery(transport)).toMatchObject({
        category: "operation",
        productionLineId: LINE_ID,
        routine: "exclude",
      }),
    );
  });

  it("personal: Persona muestra personas y la entrada se lee claramente", async () => {
    const transport = stubApi({
      auditItems: [
        auditItem({
          action: "attendance.record",
          entityType: "attendance_event",
          auditArea: "people",
          auditKind: "ATTENDANCE_CHECK_IN",
          subjectWorkerId: WORKER_ID,
          subjectName: "Ana Pérez",
          subjectOccurredAtUtc: "2026-11-03T12:05:00.000Z",
        }),
        auditItem({
          id: "d1000000-0000-4000-8000-000000000002",
          action: "attendance.record",
          entityType: "attendance_event",
          auditArea: "people",
          auditKind: "ATTENDANCE_CHECK_OUT",
          subjectName: "Ana Pérez",
          subjectOccurredAtUtc: "2026-11-03T23:30:00.000Z",
        }),
      ],
    });
    const user = userEvent.setup();
    renderPortal("/gerencia/auditoria?view=people");

    expect(
      await screen.findByText(/Ana Pérez registró entrada a las 6:05/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ana Pérez registró salida a las 5:30/u),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filtrar por" }),
      "person",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
      await screen.findByRole("option", { name: "Ana Pérez" }),
    );

    await waitFor(() =>
      expect(lastAuditQuery(transport)).toMatchObject({
        category: "people",
        workerId: WORKER_ID,
      }),
    );
  });

  it("seguridad: elevación biométrica se envía como tipo de acción", async () => {
    const transport = stubApi();
    const user = userEvent.setup();
    renderPortal("/gerencia/auditoria?view=security");

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Filtrar por" }),
      "action",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
      "biometric",
    );

    await waitFor(() =>
      expect(lastAuditQuery(transport)).toMatchObject({
        category: "security",
        kinds: "ELEVATION_BIOMETRIC",
      }),
    );
  });

  it("cargamentos: ordena por cajuelas y filtra por proveedor en el servidor", async () => {
    const transport = stubApi();
    const user = userEvent.setup();
    renderPortal("/gerencia/auditoria?view=shipments&period=all");

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Filtrar por" }),
      "cajuelas",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
      "cajuelas_desc",
    );
    await waitFor(() =>
      expect(lastShipmentQuery(transport)).toMatchObject({
        sort: "cajuelas_desc",
      }),
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filtrar por" }),
      "supplier",
    );
    expect(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
    ).toHaveValue("");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
      await screen.findByRole("option", { name: "Material propio" }),
    );
    await waitFor(() => {
      const query = lastShipmentQuery(transport);
      expect(query).toMatchObject({ supplierId: SUPPLIER_ID });
      expect(query.sort).toBeUndefined();
    });
  });

  it("cambiar de área reinicia el filtro y Limpiar conserva solo el área", async () => {
    const transport = stubApi();
    const user = userEvent.setup();
    renderPortal(
      "/gerencia/auditoria?view=security&filter=action&value=pin&search=jefe&from=2026-11-01",
    );

    const filterBy = await screen.findByRole("combobox", {
      name: "Filtrar por",
    });
    expect(filterBy).toHaveValue("action");
    expect(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
    ).toHaveValue("pin");

    await user.click(screen.getByRole("button", { name: "LIMPIAR" }));
    await waitFor(() => expect(filterBy).toHaveValue(""));
    expect(screen.getByRole("combobox", { name: "Área" })).toHaveValue(
      "security",
    );
    expect(
      screen.getByRole("searchbox", { name: "Buscar actividad" }),
    ).toHaveValue("");
    await waitFor(() => {
      const query = lastAuditQuery(transport);
      expect(query).toMatchObject({ category: "security" });
      expect(query.kinds).toBeUndefined();
      expect(query.search).toBeUndefined();
      expect(query.fromUtc).toBeUndefined();
    });

    await user.selectOptions(filterBy, "action");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Valor del filtro" }),
      "pin",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Área" }),
      "people",
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Filtrar por" })).toHaveValue(
        "",
      ),
    );
    await waitFor(() => {
      const query = lastAuditQuery(transport);
      expect(query).toMatchObject({ category: "people" });
      expect(query.kinds).toBeUndefined();
    });
  });

  it("envía el rango de fechas de Costa Rica en UTC", async () => {
    const transport = stubApi();
    renderPortal(
      "/gerencia/auditoria?view=people&from=2026-11-01&to=2026-11-07",
    );

    await waitFor(() =>
      expect(lastAuditQuery(transport)).toMatchObject({
        fromUtc: "2026-11-01T06:00:00.000Z",
        toUtc: "2026-11-08T06:00:00.000Z",
      }),
    );
  });
});

function stubApi(
  options: { auditItems?: unknown[] } = {},
): ReturnType<typeof vi.fn<typeof fetch>> {
  const transport = vi.fn<typeof fetch>((input) => {
    const url = new URL(requestUrl(input), "http://localhost");
    const path = url.pathname;
    if (path.endsWith("/audit-events"))
      return Promise.resolve(page(options.auditItems ?? []));
    if (path.endsWith("/management/shipments"))
      return Promise.resolve(page([]));
    if (path.endsWith("/plants"))
      return Promise.resolve(
        page([catalog(PLANT_ID, "Planta Abangares", true)]),
      );
    if (path.endsWith(`/plants/${PLANT_ID}/lines`))
      return Promise.resolve(
        page([
          catalog("32000000-0000-4000-8000-000000000004", "Línea 4", false),
          catalog(LINE_ID, "Línea 1", true),
        ]),
      );
    if (path.endsWith("/suppliers"))
      return Promise.resolve(
        page([catalog(SUPPLIER_ID, "Material propio", true)]),
      );
    if (path.endsWith("/workers"))
      return Promise.resolve(
        page([{ ...catalog(WORKER_ID, "Ana Pérez", true), plantId: PLANT_ID }]),
      );
    return Promise.resolve(page([]));
  });
  vi.stubGlobal("fetch", transport);
  return transport;
}

function lastQuery(
  transport: ReturnType<typeof vi.fn<typeof fetch>>,
  suffix: string,
): Record<string, string> {
  const calls = transport.mock.calls.filter(([input]) =>
    new URL(requestUrl(input), "http://localhost").pathname.endsWith(suffix),
  );
  const last = calls.at(-1);
  if (last === undefined) throw new Error(`No request to ${suffix}`);
  return Object.fromEntries(
    new URL(requestUrl(last[0]), "http://localhost").searchParams,
  );
}

function lastAuditQuery(transport: ReturnType<typeof vi.fn<typeof fetch>>) {
  return lastQuery(transport, "/audit-events");
}

function lastShipmentQuery(transport: ReturnType<typeof vi.fn<typeof fetch>>) {
  return lastQuery(transport, "/management/shipments");
}

function catalog(id: string, name: string, isActive: boolean) {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    name,
    isActive,
    deactivatedAt: isActive ? null : "2026-10-01T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function auditItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1000000-0000-4000-8000-000000000001",
    actorDisplayName: "Jefe de planta",
    origin: "SYNC",
    action: "sync.ingest",
    entityType: "shipment",
    entityId: null,
    result: "SUCCEEDED",
    reasonCode: null,
    changedFields: [],
    changes: {},
    occurredAt: "2026-11-03T12:05:02.000Z",
    recordedAt: "2026-11-03T12:05:03.000Z",
    ...overrides,
  };
}

function page(items: unknown[]): Response {
  return new Response(
    JSON.stringify({
      items,
      page: 1,
      pageSize: 100,
      total: items.length,
      totalPages: items.length === 0 ? 0 : 1,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function renderPortal(path: string): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: ORGANIZATION_ID,
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

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (input === undefined) throw new Error("Expected request");
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
