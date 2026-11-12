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

describe("gestion unificada de trabajadores", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("abre el formulario emergente y crea una jefatura pendiente", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    renderPage();

    expect(
      await screen.findByRole("dialog", { name: "Crear usuario de planta" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nombre completo"), "Ana Planta");
    await user.type(
      screen.getByLabelText("Correo de acceso"),
      "ana@example.invalid",
    );
    await user.type(
      screen.getByLabelText("Contraseña temporal"),
      "StrongPassword1!",
    );
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "StrongPassword1!",
    );
    await user.type(screen.getByLabelText("PIN de elevación"), "123456");
    await user.type(screen.getByLabelText("Confirmar PIN"), "123456");
    const createButton = screen.getByRole("button", {
      name: "CREAR CUENTA PENDIENTE",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    expect(api.creationBody).toEqual({
      displayName: "Ana Planta",
      email: "ana@example.invalid",
      password: "StrongPassword1!",
      pin: "123456",
      plantId: PLANT_ID,
      stationIds: [STATION_ID],
      preferredLocale: "es",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Crear usuario de planta" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Trabajadores" })).toBeVisible();
  });

  it("registra un proveedor solo con nombre, correo y teléfono", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    renderPage();

    await screen.findByRole("dialog", { name: "Crear usuario de planta" });
    await user.selectOptions(
      screen.getByLabelText("Rol de la persona"),
      "PROVEEDOR",
    );
    expect(screen.queryByLabelText("Contraseña temporal")).toBeNull();
    expect(screen.queryByLabelText("PIN de elevación")).toBeNull();
    await user.type(
      screen.getByLabelText("Nombre de la empresa"),
      "Minera El Roble",
    );
    await user.type(
      screen.getByLabelText("Correo de contacto (opcional)"),
      "contacto@roble.example",
    );
    await user.type(screen.getByLabelText("Teléfono (opcional)"), "8888-1234");
    await user.click(
      screen.getByRole("button", { name: "REGISTRAR PROVEEDOR" }),
    );

    await waitFor(() =>
      expect(api.supplierCreationBody).toEqual({
        name: "Minera El Roble",
        email: "contacto@roble.example",
        phone: "8888-1234",
      }),
    );
    expect(api.creationBody).toBeNull();
    expect(api.operatorCreationBody).toBeNull();
  });

  it("no envia credenciales cuando las confirmaciones no coinciden", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    renderPage();

    await user.type(
      await screen.findByLabelText("Nombre completo"),
      "Ana Planta",
    );
    await user.type(
      screen.getByLabelText("Correo de acceso"),
      "ana@example.invalid",
    );
    await user.type(
      screen.getByLabelText("Contraseña temporal"),
      "StrongPassword1!",
    );
    await user.type(
      screen.getByLabelText("Confirmar contraseña"),
      "DifferentPassword2!",
    );
    await user.type(screen.getByLabelText("PIN de elevación"), "123456");
    await user.type(screen.getByLabelText("Confirmar PIN"), "123456");
    await user.click(
      screen.getByRole("button", { name: "CREAR CUENTA PENDIENTE" }),
    );

    expect(
      await screen.findByText("Las contraseñas no coinciden."),
    ).toBeInTheDocument();
    expect(api.creationBody).toBeNull();
  });

  it("registra un operario desde el mismo formulario emergente", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    renderPage();

    await user.selectOptions(
      await screen.findByLabelText("Rol de la persona"),
      "OPERARIO",
    );
    await user.type(screen.getByLabelText("Nombre completo"), "Mario Planta");
    await user.type(
      screen.getByLabelText("Correo de contacto (opcional)"),
      "mario@example.invalid",
    );
    await user.type(screen.getByLabelText("Teléfono (opcional)"), "8888-0000");
    await user.click(
      screen.getByRole("button", { name: "REGISTRAR OPERARIO" }),
    );

    expect(api.operatorCreationBody).toEqual({
      name: "Mario Planta",
      plantId: PLANT_ID,
      email: "mario@example.invalid",
      phone: "8888-0000",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Crear usuario de planta" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("oculta por defecto la contraseña y el PIN, con un botón accesible por campo", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    renderPage();

    const fields = [
      ["Contraseña temporal", "contraseña temporal"],
      ["Confirmar contraseña", "confirmación de contraseña"],
      ["PIN de elevación", "PIN de elevación"],
      ["Confirmar PIN", "confirmación de PIN"],
    ] as const;
    await screen.findByLabelText("Contraseña temporal");

    for (const [label] of fields) {
      expect(screen.getByLabelText(label)).toHaveAttribute("type", "password");
    }

    for (const [label, buttonName] of fields) {
      const input = screen.getByLabelText(label);
      const show = screen.getByRole("button", {
        name: `Mostrar ${buttonName}`,
      });
      expect(show).toHaveAttribute("type", "button");
      expect(show).toHaveAttribute("aria-controls", input.id);

      await user.click(show);
      expect(input).toHaveAttribute("type", "text");
      // Solo cambia el campo de este botón.
      for (const [otherLabel] of fields) {
        if (otherLabel !== label) {
          expect(screen.getByLabelText(otherLabel)).toHaveAttribute(
            "type",
            "password",
          );
        }
      }

      const hide = screen.getByRole("button", {
        name: `Ocultar ${buttonName}`,
      });
      await user.click(hide);
      expect(input).toHaveAttribute("type", "password");
    }
    // Mostrar u ocultar no envía nada.
    expect(api.creationBody).toBeNull();
  });

  it("no guarda la contraseña ni el PIN en la URL ni en el almacenamiento del navegador", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderPage();

    await user.type(
      await screen.findByLabelText("Contraseña temporal"),
      "StrongPassword1!",
    );
    await user.type(screen.getByLabelText("PIN de elevación"), "987654");
    await user.click(
      screen.getByRole("button", { name: "Mostrar contraseña temporal" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Mostrar PIN de elevación" }),
    );

    const storedValues = setItem.mock.calls.map((call) => call.join("="));
    expect(storedValues.join("|")).not.toMatch(/StrongPassword1!|987654/u);
    expect(window.location.href).not.toMatch(/StrongPassword1|987654/u);
    setItem.mockRestore();
  });

  it("el operario no pide contraseña ni PIN y su correo es opcional", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    renderPage();

    await user.selectOptions(
      await screen.findByLabelText("Rol de la persona"),
      "OPERARIO",
    );

    expect(screen.queryByLabelText("Contraseña temporal")).toBeNull();
    expect(screen.queryByLabelText("PIN de elevación")).toBeNull();
    expect(screen.queryByRole("button", { name: /Mostrar/u })).toBeNull();
    expect(
      screen.getByLabelText("Correo de contacto (opcional)"),
    ).not.toBeRequired();
  });

  it("muestra primero las jefaturas y luego los operarios, sin prefijos en el nombre", async () => {
    const api = createAccountsApi({
      payrollWorkers: [operatorPayrollFixture(), managerPayrollFixture()],
    });
    vi.stubGlobal("fetch", api.fetch);
    renderPage("/gerencia/trabajadores");

    expect(await screen.findByText("Daniela Demo")).toBeInTheDocument();
    const rows = screen.getAllByRole("button", { name: /ABRIR/u });
    expect(rows).toHaveLength(2);
    const [managerRow, operatorRow] = rows as [HTMLElement, HTMLElement];
    expect(within(managerRow).getByText("Daniela Demo").tagName).toBe("STRONG");
    expect(managerRow).toHaveTextContent("Jefe de planta");
    expect(within(operatorRow).getByText("Mario Planta").tagName).toBe(
      "STRONG",
    );
    expect(operatorRow).toHaveTextContent("Operario");
    for (const row of rows) {
      expect(row.textContent).not.toMatch(/\b(JF|OP)\b/u);
    }
  });

  it("ordena por rol y alfabéticamente con reglas del español", async () => {
    const api = createAccountsApi({
      payrollWorkers: [
        payrollFixture({
          id: id(1),
          name: "Óscar Zamora",
          category: "OPERARIO",
          userProfileId: null,
        }),
        payrollFixture({
          id: id(2),
          name: "Zoila Mena",
          category: "JEFE_PLANTA",
          userProfileId: null,
        }),
        payrollFixture({
          id: id(3),
          name: "ana Brenes",
          category: "OPERARIO",
          userProfileId: null,
        }),
        payrollFixture({
          id: id(4),
          name: "Ñandú Rojas",
          category: "OPERARIO",
          userProfileId: null,
        }),
        payrollFixture({
          id: id(5),
          name: "Álvaro Solís",
          category: "JEFE_PLANTA",
          userProfileId: null,
        }),
        payrollFixture({
          id: id(6),
          name: "Nora Vega",
          category: "OPERARIO",
          userProfileId: null,
        }),
      ],
    });
    vi.stubGlobal("fetch", api.fetch);
    renderPage("/gerencia/trabajadores");

    await screen.findByText("Zoila Mena");
    const names = screen
      .getAllByRole("button", { name: /ABRIR/u })
      .map((row) => row.querySelector("strong")?.textContent);
    expect(names).toEqual([
      "Álvaro Solís",
      "Zoila Mena",
      "ana Brenes",
      "Nora Vega",
      "Ñandú Rojas",
      "Óscar Zamora",
    ]);
  });

  it("muestra el nombre una sola vez en el expediente, sin prefijo de rol", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi({
      payrollWorkers: [managerPayrollFixture()],
    });
    vi.stubGlobal("fetch", api.fetch);
    renderPage("/gerencia/trabajadores");

    await user.click(await screen.findByRole("button", { name: /ABRIR/u }));
    const dialog = await screen.findByRole("dialog", {
      name: "Expediente del trabajador",
    });
    expect(
      within(dialog).getByRole("heading", { name: "Daniela Demo" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Jefe de planta")).toBeInTheDocument();
    expect(within(dialog).queryByText(/^(JF|OP)$/u)).toBeNull();
  });
});

function id(value: number): string {
  return `c1000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function renderPage(path = "/gerencia/usuarios") {
  const auth: AuthState = {
    session: { access_token: "manager-token" } as Session,
    profile: {
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: [
        "plant_managers.manage",
        "organization_catalogs.read",
        "attendance.read",
        "payroll.read",
        "payroll.manage",
        "suppliers.manage",
      ],
      expiresAt: "2027-01-01T00:00:00.000Z",
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
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
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

function createAccountsApi(
  seed: { payrollWorkers?: Record<string, unknown>[] } = {},
): {
  fetch: typeof fetch;
  creationBody: Record<string, unknown> | null;
  operatorCreationBody: Record<string, unknown> | null;
  supplierCreationBody: Record<string, unknown> | null;
} {
  let creationBody: Record<string, unknown> | null = null;
  let operatorCreationBody: Record<string, unknown> | null = null;
  let supplierCreationBody: Record<string, unknown> | null = null;
  const payrollWorkers = seed.payrollWorkers ?? [];
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const url = new URL(requestUrl(input), "http://localhost");
    const method = init?.method ?? "GET";
    if (url.pathname.endsWith("/management/freshness"))
      return Promise.resolve(
        json({
          cursor: "fixture",
          hasChanges: false,
          effectiveAtUtc: null,
          serverTimeUtc: "2026-10-18T12:00:00.000Z",
          pollAfterSeconds: 30,
        }),
      );
    if (url.pathname.endsWith("/management/attendance/payroll/workers"))
      return Promise.resolve(json(payrollWorkers));
    if (url.pathname.endsWith("/plants") && method === "GET")
      return Promise.resolve(
        page([{ id: PLANT_ID, name: "Planta principal", isActive: true }]),
      );
    if (url.pathname.endsWith("/stations"))
      return Promise.resolve(
        page([
          {
            id: STATION_ID,
            plantId: PLANT_ID,
            name: "Estación central",
            isActive: true,
          },
        ]),
      );
    if (url.pathname.endsWith("/accounts") && method === "GET")
      return Promise.resolve(page([]));
    if (url.pathname.endsWith("/workers") && method === "GET")
      return Promise.resolve(page([]));
    if (url.pathname.endsWith("/suppliers") && method === "GET")
      return Promise.resolve(page([]));
    if (url.pathname.endsWith("/suppliers") && method === "POST") {
      if (typeof init?.body !== "string") throw new Error("Expected body");
      supplierCreationBody = JSON.parse(init.body) as Record<string, unknown>;
      return Promise.resolve(
        json(
          {
            id: "35000000-0000-4000-8000-000000000020",
            organizationId: ORGANIZATION_ID,
            ...supplierCreationBody,
            isActive: true,
            deactivatedAt: null,
            createdAt: "2026-11-11T12:00:00.000Z",
            updatedAt: "2026-11-11T12:00:00.000Z",
          },
          201,
        ),
      );
    }
    if (url.pathname.endsWith("/worker-requests") && method === "POST") {
      if (typeof init?.body !== "string") throw new Error("Expected body");
      operatorCreationBody = JSON.parse(init.body) as Record<string, unknown>;
      return Promise.resolve(json(operatorPayrollFixture(), 201));
    }
    if (
      url.pathname.endsWith("/accounts/plant-managers") &&
      method === "POST"
    ) {
      if (typeof init?.body !== "string") throw new Error("Expected body");
      creationBody = JSON.parse(init.body) as Record<string, unknown>;
      return Promise.resolve(json(plantManager(), 201));
    }
    return Promise.reject(new Error(`Unexpected request: ${method} ${url}`));
  });
  return {
    fetch,
    get creationBody() {
      return creationBody;
    },
    get operatorCreationBody() {
      return operatorCreationBody;
    },
    get supplierCreationBody() {
      return supplierCreationBody;
    },
  };
}

function plantManager() {
  return {
    id: ACCOUNT_ID,
    organizationId: ORGANIZATION_ID,
    displayName: "Ana Planta",
    preferredLocale: "es",
    accountStatus: "PENDING_APPROVAL",
    roleCode: "JEFE_PLANTA",
    provisioningMethod: "DIRECT",
    statusReason: null,
    isActive: true,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
  };
}

function managerPayrollFixture() {
  return payrollFixture({
    id: ACCOUNT_ID,
    name: "Daniela Demo",
    category: "JEFE_PLANTA",
    userProfileId: PROFILE_ID,
  });
}

function operatorPayrollFixture() {
  return payrollFixture({
    id: WORKER_ID,
    name: "Mario Planta",
    category: "OPERARIO",
    userProfileId: null,
  });
}

function payrollFixture(input: {
  id: string;
  name: string;
  category: string;
  userProfileId: string | null;
}) {
  return {
    ...input,
    organizationId: ORGANIZATION_ID,
    plantId: PLANT_ID,
    identityNumber: null,
    email: null,
    phone: null,
    status: "ACTIVO",
    isActive: true,
    currentRateId: null,
    currentHourlyRateCrc: null,
    nightMultiplier: null,
    rateEffectiveFromUtc: null,
  };
}

function page(items: Record<string, unknown>[]) {
  return json({
    items,
    page: 1,
    pageSize: 100,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
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

const PROFILE_ID = "a1000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const STATION_ID = "34000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "a1000000-0000-4000-8000-000000000099";
const WORKER_ID = "b1000000-0000-4000-8000-000000000099";
