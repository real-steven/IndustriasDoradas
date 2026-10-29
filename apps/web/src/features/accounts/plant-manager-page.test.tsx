import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";

describe("gestion de usuarios de planta", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("crea una cuenta pendiente y permite activarla por separado", async () => {
    const user = userEvent.setup();
    const api = createAccountsApi();
    vi.stubGlobal("fetch", api.fetch);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Usuarios de planta" }),
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
    expect(
      screen.queryByRole("combobox", { name: "Idioma inicial" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Planta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Estación central" }),
    ).not.toBeInTheDocument();
    const createButton = screen.getByRole("button", {
      name: "CREAR CUENTA PENDIENTE",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    expect(
      await screen.findByRole("status", { name: "Notificación de éxito" }),
    ).toHaveTextContent(/Cuenta creada pendiente de activación/u);
    expect(api.creationBody).toEqual({
      displayName: "Ana Planta",
      email: "ana@example.invalid",
      password: "StrongPassword1!",
      pin: "123456",
      plantId: PLANT_ID,
      stationIds: [STATION_ID],
      preferredLocale: "es",
    });

    await user.click(
      await screen.findByRole("button", { name: "ACTIVAR CUENTA" }),
    );
    expect(
      await screen.findByRole("status", { name: "Notificación de éxito" }),
    ).toHaveTextContent("Cuenta activada correctamente.");
    await waitFor(() => expect(screen.getByText("ACTIVA")).toBeInTheDocument());
    expect(api.approvalCount()).toBe(1);
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
    const createButton = screen.getByRole("button", {
      name: "CREAR CUENTA PENDIENTE",
    });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    expect(
      await screen.findByText("Las contraseñas no coinciden."),
    ).toBeInTheDocument();
    expect(api.creationBody).toBeNull();
  });

  it("registra un operario con el rol seleccionado y muestra el prefijo OP", async () => {
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

    expect(
      await screen.findByRole("status", { name: "Notificación de éxito" }),
    ).toHaveTextContent("Operario registrado con estado pendiente");
    expect(api.operatorCreationBody).toEqual({
      name: "Mario Planta",
      plantId: PLANT_ID,
      email: "mario@example.invalid",
      phone: "8888-0000",
    });
    expect(await screen.findByText("Mario Planta")).toBeInTheDocument();
  });
});

function renderPage() {
  const auth: AuthState = {
    session: { access_token: "manager-token" } as Session,
    profile: {
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: ["plant_managers.manage", "organization_catalogs.read"],
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
        <MemoryRouter initialEntries={["/gerencia/usuarios"]}>
          <App />
        </MemoryRouter>
      </QueryProvider>
    </AuthContext.Provider>,
  );
}

function createAccountsApi(): {
  fetch: typeof fetch;
  creationBody: Record<string, unknown> | null;
  operatorCreationBody: Record<string, unknown> | null;
  approvalCount: () => number;
} {
  let account: Record<string, unknown> | null = null;
  let creationBody: Record<string, unknown> | null = null;
  let operatorCreationBody: Record<string, unknown> | null = null;
  let operators: Record<string, unknown>[] = [];
  let approvals = 0;
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
    if (url.pathname.endsWith("/plants") && method === "GET")
      return Promise.resolve(
        page([{ id: PLANT_ID, name: "Planta principal", isActive: true }]),
      );
    if (url.pathname.endsWith(`/plants/${PLANT_ID}/stations`))
      return Promise.resolve(
        page([{ id: STATION_ID, name: "Estación central", isActive: true }]),
      );
    if (url.pathname.endsWith("/accounts") && method === "GET")
      return Promise.resolve(page(account === null ? [] : [account]));
    if (url.pathname.endsWith("/workers") && method === "GET")
      return Promise.resolve(page(operators));
    if (url.pathname.endsWith("/worker-requests") && method === "POST") {
      if (typeof init?.body !== "string") throw new Error("Expected body");
      operatorCreationBody = JSON.parse(init.body) as Record<string, unknown>;
      const operator = {
        id: WORKER_ID,
        organizationId: ORGANIZATION_ID,
        plantId: PLANT_ID,
        sourceRequestId: REQUEST_ID,
        userProfileId: null,
        category: "OPERARIO",
        name: "Mario Planta",
        email: "mario@example.invalid",
        phone: "8888-0000",
        status: "PROVISIONAL",
        statusChangedAt: "2026-10-28T12:00:00.000Z",
        isActive: true,
        deactivatedAt: null,
      };
      operators = [operator];
      return Promise.resolve(json(operator, 201));
    }
    if (
      url.pathname.endsWith("/accounts/plant-managers") &&
      method === "POST"
    ) {
      if (typeof init?.body !== "string") throw new Error("Expected body");
      creationBody = JSON.parse(init.body) as Record<string, unknown>;
      account = plantManager("PENDING_APPROVAL");
      return Promise.resolve(json(account, 201));
    }
    if (
      url.pathname.endsWith(`/accounts/${ACCOUNT_ID}/approve`) &&
      method === "POST"
    ) {
      approvals += 1;
      account = plantManager("ACTIVE");
      return Promise.resolve(json(account));
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
    approvalCount: () => approvals,
  };
}

function plantManager(status: "PENDING_APPROVAL" | "ACTIVE") {
  return {
    id: ACCOUNT_ID,
    organizationId: ORGANIZATION_ID,
    displayName: "Ana Planta",
    preferredLocale: "es",
    accountStatus: status,
    roleCode: "JEFE_PLANTA",
    provisioningMethod: "DIRECT",
    statusReason: null,
    isActive: true,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
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
const REQUEST_ID = "b0000000-0000-4000-8000-000000000099";
