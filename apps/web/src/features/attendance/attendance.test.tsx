import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";
import { AttendanceFeature } from "./attendance";
import { currentPayrollWeek } from "./payroll-data";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const WORKER_ID = "52000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000010";
const DEFAULT_SUPPLIER_ID = "35000000-0000-4000-8000-000000000001";
const SUSPENDED_SUPPLIER_ID = "35000000-0000-4000-8000-000000000011";

describe("expediente y pre-nómina por trabajador", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("calcula la semana de lunes a domingo en Costa Rica", () => {
    expect(currentPayrollWeek(new Date("2026-10-20T18:00:00.000Z"))).toEqual({
      fromDate: "2026-10-19",
      toDate: "2026-10-25",
    });
  });

  it("abre el empleado en un modal y muestra bruto, autorizado y comentarios", async () => {
    const transport = vi.fn<typeof fetch>((input) => {
      const request = new URL(requestUrl(input), "http://localhost");
      if (request.pathname.endsWith("/suppliers"))
        return Promise.resolve(json(supplierPage([])));
      if (request.pathname.endsWith("/payroll/workers"))
        return Promise.resolve(json([workerProfile()]));
      if (request.pathname.endsWith("/management/attendance/payroll"))
        return Promise.resolve(json(payrollReport()));
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderAttendance("/gerencia/trabajadores");

    await screen.findByText("Operario Uno");
    fireEvent.click(screen.getByRole("button", { name: /Operario Uno/u }));

    expect(await screen.findByText("8 h")).toBeInTheDocument();
    expect(
      screen.getByText(
        (content) => content.includes("16") && content.includes("500"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notas" }));
    expect(
      await screen.findByText("Presentó comprobante del hospital."),
    ).toBeInTheDocument();

    const payrollCall = transport.mock.calls.find(([input]) =>
      requestUrl(input).endsWith("/management/attendance/payroll")
        ? true
        : requestUrl(input).includes("/management/attendance/payroll?"),
    );
    const request = new URL(requestUrl(payrollCall?.[0]), "http://localhost");
    expect(request.searchParams.get("workerId")).toBe(WORKER_ID);
    expect(request.searchParams.get("fromDate")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/u,
    );
    expect(request.searchParams.get("toDate")).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it("edita el expediente y suspende al trabajador con motivo", async () => {
    const user = userEvent.setup();
    const profileBodies: unknown[] = [];
    const stateBodies: unknown[] = [];
    const transport = vi.fn<typeof fetch>((input, init) => {
      const request = new URL(requestUrl(input), "http://localhost");
      const method = init?.method ?? "GET";
      if (
        request.pathname.endsWith(`/payroll/workers/${WORKER_ID}/profile`) &&
        method === "PATCH"
      ) {
        if (typeof init?.body !== "string")
          throw new Error("Expected a JSON profile body");
        profileBodies.push(JSON.parse(init.body));
        return Promise.resolve(json(workerProfile()));
      }
      if (
        request.pathname.endsWith(`/workers/${WORKER_ID}/state`) &&
        method === "PATCH"
      ) {
        if (typeof init?.body !== "string")
          throw new Error("Expected a JSON state body");
        stateBodies.push(JSON.parse(init.body));
        return Promise.resolve(json({ ...workerProfile(), isActive: false }));
      }
      if (request.pathname.endsWith("/suppliers"))
        return Promise.resolve(json(supplierPage([])));
      if (request.pathname.endsWith("/payroll/workers"))
        return Promise.resolve(json([workerProfile()]));
      if (request.pathname.endsWith("/management/attendance/payroll"))
        return Promise.resolve(json(payrollReport()));
      throw new Error(`Unexpected request ${method} ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);
    renderAttendance("/gerencia/trabajadores");

    await user.click(
      await screen.findByRole("button", { name: /Operario Uno/u }),
    );
    await user.click(
      await screen.findByRole("button", { name: /EDITAR DATOS/u }),
    );
    const name = screen.getByLabelText("Nombre completo");
    await user.clear(name);
    await user.type(name, "Operario Actualizado");
    const phone = screen.getByLabelText("Teléfono");
    await user.clear(phone);
    await user.type(phone, "8888-9999");
    await user.click(screen.getByRole("button", { name: "GUARDAR CAMBIOS" }));

    await screen.findByRole("button", { name: /EDITAR DATOS/u });
    expect(profileBodies).toEqual([
      {
        name: "Operario Actualizado",
        identityNumber: "1-1111-1111",
        email: "operario@example.invalid",
        phone: "8888-9999",
      },
    ]);

    await user.click(
      screen.getByRole("button", { name: "SUSPENDER TRABAJADOR" }),
    );
    await user.type(
      screen.getByLabelText("Motivo de suspensión"),
      "Permiso temporal",
    );
    await user.click(
      screen.getByRole("button", { name: "CONFIRMAR SUSPENSIÓN" }),
    );
    expect(stateBodies).toEqual([
      { active: false, reason: "Permiso temporal" },
    ]);
  });
});

describe("directorio de Personal con proveedores", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("separa proveedores, jefes de planta y operarios en ese orden", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) => {
        const request = new URL(requestUrl(input), "http://localhost");
        if (request.pathname.endsWith("/suppliers"))
          return Promise.resolve(
            json(
              supplierPage([
                supplier({
                  id: SUSPENDED_SUPPLIER_ID,
                  name: "Tajo San Juan",
                  isActive: false,
                }),
                supplier({
                  name: "Minera El Roble",
                  email: "contacto@roble.example",
                  phone: "8888-1234",
                }),
                supplier({ id: DEFAULT_SUPPLIER_ID, name: "Material propio" }),
              ]),
            ),
          );
        if (request.pathname.endsWith("/payroll/workers"))
          return Promise.resolve(
            json([
              workerProfile(),
              {
                ...workerProfile(),
                id: "52000000-0000-4000-8000-000000000002",
                name: "Jefa Planta",
                category: "JEFE_PLANTA",
              },
            ]),
          );
        throw new Error(`Unexpected request ${request.pathname}`);
      }),
    );

    renderAttendance("/gerencia/trabajadores");

    const sections = await screen.findAllByRole("region");
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("region")
          .map((section) => section.getAttribute("aria-label")),
      ).toEqual(["PROVEEDORES", "JEFES DE PLANTA", "OPERARIOS"]),
    );
    expect(sections.length).toBeGreaterThan(0);
    const supplierSection = screen.getByRole("region", { name: "PROVEEDORES" });
    const supplierRows = within(supplierSection).getAllByRole("button");
    expect(supplierRows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Material propioPredeterminado"),
      expect.stringContaining("Minera El Roble"),
      expect.stringContaining("Tajo San JuanSuspendido"),
    ]);
    expect(supplierRows[1]).toHaveTextContent(
      "contacto@roble.example · 8888-1234",
    );
    expect(supplierRows[1]).toHaveTextContent("PagoAparte");
    expect(
      within(screen.getByRole("region", { name: "JEFES DE PLANTA" })).getByText(
        "Jefa Planta",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "OPERARIOS" })).getByText(
        "Operario Uno",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 empleados · 3 proveedores/u)).toBeVisible();
  });

  it("edita y suspende un proveedor con motivo, sin planilla", async () => {
    const user = userEvent.setup();
    const updateBodies: unknown[] = [];
    const stateBodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) => {
        const request = new URL(requestUrl(input), "http://localhost");
        const method = init?.method ?? "GET";
        if (
          request.pathname.endsWith(`/suppliers/${SUPPLIER_ID}/state`) &&
          method === "PATCH"
        ) {
          stateBodies.push(JSON.parse(bodyText(init)));
          return Promise.resolve(json(supplier({ isActive: false })));
        }
        if (
          request.pathname.endsWith(`/suppliers/${SUPPLIER_ID}`) &&
          method === "PATCH"
        ) {
          updateBodies.push(JSON.parse(bodyText(init)));
          return Promise.resolve(json(supplier({ phone: "2222-0000" })));
        }
        if (request.pathname.endsWith("/suppliers"))
          return Promise.resolve(json(supplierPage([supplier()])));
        if (request.pathname.endsWith("/payroll/workers"))
          return Promise.resolve(json([]));
        throw new Error(`Unexpected request ${method} ${request.pathname}`);
      }),
    );
    renderAttendance("/gerencia/trabajadores", ["suppliers.manage"]);

    await user.click(
      await screen.findByRole("button", { name: /Minera El Roble/u }),
    );
    const dialog = screen.getByRole("dialog", { name: "Ficha del proveedor" });
    expect(within(dialog).queryByText(/Tarifa/u)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /EDITAR/u }));
    const phone = within(dialog).getByLabelText("Teléfono");
    await user.clear(phone);
    await user.type(phone, "2222-0000");
    await user.click(
      within(dialog).getByRole("button", { name: "GUARDAR CAMBIOS" }),
    );
    await waitFor(() =>
      expect(updateBodies).toEqual([
        { name: "Minera El Roble", email: null, phone: "2222-0000" },
      ]),
    );

    await user.click(
      await screen.findByRole("button", { name: "SUSPENDER PROVEEDOR" }),
    );
    const confirm = screen.getByRole("button", {
      name: "CONFIRMAR SUSPENSIÓN",
    });
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByLabelText("Motivo de suspensión"),
      "Dejó de entregar material",
    );
    await user.click(confirm);
    await waitFor(() =>
      expect(stateBodies).toEqual([
        { active: false, reason: "Dejó de entregar material" },
      ]),
    );
  });

  it("no permite suspender ni renombrar Material propio", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) => {
        const request = new URL(requestUrl(input), "http://localhost");
        if (request.pathname.endsWith("/suppliers"))
          return Promise.resolve(
            json(
              supplierPage([
                supplier({ id: DEFAULT_SUPPLIER_ID, name: "Material propio" }),
              ]),
            ),
          );
        if (request.pathname.endsWith("/payroll/workers"))
          return Promise.resolve(json([]));
        throw new Error(`Unexpected request ${request.pathname}`);
      }),
    );
    renderAttendance("/gerencia/trabajadores", ["suppliers.manage"]);

    await user.click(
      await screen.findByRole("button", { name: /Material propio/u }),
    );
    const dialog = screen.getByRole("dialog", { name: "Ficha del proveedor" });
    expect(
      within(dialog).queryByRole("button", { name: /SUSPENDER/u }),
    ).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /EDITAR/u }));
    expect(
      within(dialog).getByLabelText("Nombre de la empresa"),
    ).toBeDisabled();
  });

  it("muestra la ficha sin acciones a quien no administra proveedores", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) => {
        const request = new URL(requestUrl(input), "http://localhost");
        if (request.pathname.endsWith("/suppliers"))
          return Promise.resolve(json(supplierPage([supplier()])));
        if (request.pathname.endsWith("/payroll/workers"))
          return Promise.resolve(json([]));
        throw new Error(`Unexpected request ${request.pathname}`);
      }),
    );
    renderAttendance("/gerencia/trabajadores");

    await user.click(
      await screen.findByRole("button", { name: /Minera El Roble/u }),
    );
    const dialog = screen.getByRole("dialog", { name: "Ficha del proveedor" });
    expect(
      within(dialog).queryByRole("button", { name: /EDITAR/u }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: /SUSPENDER/u }),
    ).toBeNull();
  });
});

describe("períodos rápidos del expediente", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function periodTransport() {
    const periods: Array<{ fromDate: string; toDate: string }> = [];
    const transport = vi.fn<typeof fetch>((input) => {
      const request = new URL(requestUrl(input), "http://localhost");
      if (request.pathname.endsWith("/suppliers"))
        return Promise.resolve(json(supplierPage([])));
      if (request.pathname.endsWith("/payroll/workers"))
        return Promise.resolve(json([workerProfile()]));
      if (request.pathname.endsWith("/management/attendance/payroll")) {
        const fromDate = request.searchParams.get("fromDate") ?? "";
        const toDate = request.searchParams.get("toDate") ?? "";
        periods.push({ fromDate, toDate });
        return Promise.resolve(
          json(periodReport(fromDate, toDate, fromDate === "2026-02-01")),
        );
      }
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    return { transport, periods };
  }

  async function openRecord() {
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Operario Uno/u }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Expediente del trabajador",
    });
    return { user, dialog };
  }

  it("aplica cada acceso con la fecha de Costa Rica y recalcula el resumen", async () => {
    // 03:00 UTC del 1 de marzo = sábado 28 de febrero, 21:00 en Costa Rica.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T03:00:00.000Z"));
    const { transport, periods } = periodTransport();
    vi.stubGlobal("fetch", transport);
    renderAttendance("/gerencia/trabajadores");
    const { user, dialog } = await openRecord();
    const view = within(dialog);
    const from = view.getByLabelText("DESDE");
    const to = view.getByLabelText("HASTA");

    // Por defecto: esta semana, que cruza de febrero a marzo.
    expect(view.getByRole("button", { name: "Esta semana" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(from).toHaveValue("2026-02-23");
    expect(to).toHaveValue("2026-03-01");
    expect(await view.findByText("8 h")).toBeInTheDocument();

    const expectations = [
      ["Semana anterior", "2026-02-16", "2026-02-22"],
      ["Quincena actual", "2026-02-16", "2026-02-28"],
      ["Mes actual", "2026-02-01", "2026-02-28"],
      ["Esta semana", "2026-02-23", "2026-03-01"],
    ] as const;
    for (const [label, fromDate, toDate] of expectations) {
      await user.click(view.getByRole("button", { name: label }));
      expect(view.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(from).toHaveValue(fromDate);
      expect(to).toHaveValue(toDate);
      // Un período ya consultado puede salir de la caché sin pedirlo otra vez.
      await waitFor(() => expect(periods).toContainEqual({ fromDate, toDate }));
      if (label === "Mes actual") {
        // El mes trae otras cifras desde la API; la web no las recalcula.
        expect(await view.findByText("20 h")).toBeInTheDocument();
        expect(view.getByText(/3 jornadas/u)).toBeInTheDocument();
        expect(
          view.getByText(
            "2 jornadas abiertas y 1 incidencias no se incluyen en el pago.",
          ),
        ).toBeInTheDocument();
      }
    }
    // De vuelta en esta semana se muestran sus cifras, no las del mes.
    expect(await view.findByText("8 h")).toBeInTheDocument();
    expect(periods).not.toContainEqual(
      expect.objectContaining({ toDate: "2026-02-29" }),
    );
  });

  it("pasa a Personalizado al cambiar fechas a mano y conserva el período", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T18:00:00.000Z"));
    const { transport, periods } = periodTransport();
    vi.stubGlobal("fetch", transport);
    renderAttendance("/gerencia/trabajadores");
    const { user, dialog } = await openRecord();
    const view = within(dialog);

    await user.click(view.getByRole("button", { name: "Quincena actual" }));
    expect(view.getByLabelText("DESDE")).toHaveValue("2026-11-01");
    expect(view.getByLabelText("HASTA")).toHaveValue("2026-11-15");

    fireEvent.change(view.getByLabelText("HASTA"), {
      target: { value: "2026-11-12" },
    });
    for (const preset of [
      "Esta semana",
      "Semana anterior",
      "Quincena actual",
      "Mes actual",
    ]) {
      expect(view.getByRole("button", { name: preset })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    expect(view.getByText("Personalizado")).toHaveClass("active");
    await waitFor(() =>
      expect(periods.at(-1)).toEqual({
        fromDate: "2026-11-01",
        toDate: "2026-11-12",
      }),
    );

    // Cambiar de pestaña no reinicia el período.
    await user.click(view.getByRole("button", { name: "Notas" }));
    await user.click(view.getByRole("button", { name: "Resumen y pago" }));
    expect(view.getByLabelText("DESDE")).toHaveValue("2026-11-01");
    expect(view.getByLabelText("HASTA")).toHaveValue("2026-11-12");
    expect(view.getByText("Personalizado")).toHaveClass("active");
  });

  it("no consulta un rango invertido y avisa al usuario", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T18:00:00.000Z"));
    const { transport, periods } = periodTransport();
    vi.stubGlobal("fetch", transport);
    renderAttendance("/gerencia/trabajadores");
    const { dialog } = await openRecord();
    const view = within(dialog);
    await view.findByText("8 h");
    const requestsBefore = periods.length;

    fireEvent.change(view.getByLabelText("DESDE"), {
      target: { value: "2026-11-30" },
    });

    expect(view.getByRole("alert")).toHaveTextContent(
      "«Desde» debe ser igual o anterior a «Hasta»",
    );
    expect(periods).toHaveLength(requestsBefore);
    // Se sigue mostrando el último resumen válido.
    expect(view.getByText("8 h")).toBeInTheDocument();
  });
});

function periodReport(fromDate: string, toDate: string, month: boolean) {
  const report = payrollReport();
  const [result] = report.workers;
  if (result === undefined) throw new Error("Expected a worker result");
  return {
    ...report,
    period: { fromDate, toDate },
    workers: [
      {
        ...result,
        confirmedMinutes: month ? 1200 : 480,
        completedShiftCount: month ? 3 : 1,
        openShiftCount: month ? 2 : 0,
        incidentCount: month ? 1 : 0,
        grossAuthorization: null,
        grossAuthorizations: [],
      },
    ],
  };
}

function renderAttendance(
  path: string,
  extraPermissions: readonly string[] = [],
): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: [
        "attendance.read",
        "payroll.read",
        "payroll.manage",
        ...extraPermissions,
      ],
      expiresAt: "2026-10-21T01:00:00Z",
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
          <AttendanceFeature />
        </MemoryRouter>
      </QueryProvider>
    </AuthContext.Provider>,
  );
}

function workerProfile() {
  return {
    id: WORKER_ID,
    organizationId: ORGANIZATION_ID,
    plantId: "31000000-0000-4000-8000-000000000001",
    name: "Operario Uno",
    userProfileId: null,
    email: "operario@example.invalid",
    phone: "8888-1111",
    identityNumber: "1-1111-1111",
    category: "OPERARIO",
    status: "ACTIVO",
    isActive: true,
    currentRateId: "rate-1",
    currentHourlyRateCrc: 2000,
    nightMultiplier: 1.5,
    rateEffectiveFromUtc: "2026-10-01T06:00:00.000Z",
  };
}

function payrollReport() {
  const worker = workerProfile();
  return {
    version: "payroll-preparation-v1",
    timezone: "America/Costa_Rica",
    currencyCode: "CRC",
    legalScope: "GROSS_ESTIMATE_WITHOUT_LEGAL_DEDUCTIONS",
    period: { fromDate: "2026-10-19", toDate: "2026-10-25" },
    generatedAtUtc: "2026-10-25T18:00:00.000Z",
    workers: [
      {
        worker,
        confirmedMinutes: 480,
        completedShiftCount: 1,
        openShiftCount: 0,
        incidentCount: 0,
        baseAmountCrc: 16000,
        adjustmentAmountCrc: 0,
        calculatedGrossAmountCrc: 16000,
        authorizedGrossAmountCrc: 16500,
        grossDifferenceCrc: 500,
        estimatedGrossAmountCrc: 16500,
        missingRateMinutes: 0,
        grossAuthorization: {
          id: "authorization-1",
          fromDate: "2026-10-19",
          toDate: "2026-10-25",
          authorizedAmountCrc: 16500,
          reason: "Monto aprobado por gerencia",
          recordedByName: "Lucía",
          recordedAtUtc: "2026-10-25T18:00:00.000Z",
        },
        grossAuthorizations: [
          {
            id: "authorization-1",
            fromDate: "2026-10-19",
            toDate: "2026-10-25",
            authorizedAmountCrc: 16500,
            reason: "Monto aprobado por gerencia",
            recordedByName: "Lucía",
            recordedAtUtc: "2026-10-25T18:00:00.000Z",
          },
        ],
        adjustments: [
          {
            id: "adjustment-1",
            adjustmentDate: "2026-10-20",
            adjustmentType: "OVERTIME_HOURS",
            minutes: 60,
            amountCrc: null,
            note: "Presentó comprobante del hospital.",
            recordedAtUtc: "2026-10-20T20:00:00.000Z",
            calculatedAmountCrc: 0,
          },
        ],
        rates: [
          {
            id: "rate-1",
            regularHourlyRateCrc: 2000,
            nightMultiplier: 1.5,
            effectiveFromUtc: "2026-10-01T06:00:00.000Z",
            reason: "Tarifa inicial",
            createdAtUtc: "2026-10-01T06:00:00.000Z",
          },
        ],
        shifts: [],
      },
    ],
    summary: {
      workerCount: 1,
      workersReady: 1,
      workersMissingRate: 0,
      confirmedMinutes: 480,
      estimatedGrossAmountCrc: 16500,
    },
  };
}

function supplier(overrides: Record<string, unknown> = {}) {
  return {
    id: SUPPLIER_ID,
    organizationId: ORGANIZATION_ID,
    name: "Minera El Roble",
    isActive: true,
    deactivatedAt: null,
    email: null,
    phone: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function supplierPage(items: readonly unknown[]) {
  return {
    items,
    page: 1,
    pageSize: 100,
    total: items.length,
    totalPages: 1,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (input === undefined) throw new Error("Expected a request");
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function bodyText(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new Error("Expected a JSON body");
  return init.body;
}
