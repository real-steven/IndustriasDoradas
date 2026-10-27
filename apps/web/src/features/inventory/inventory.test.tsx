import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";
import { parseInventoryFilters, reminderDue } from "./inventory-data";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const ITEM_ID = "77200000-0000-4000-8000-000000000001";

describe("inventario gerencial", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("valida filtros y recordatorios configurables sin bloquear", () => {
    const filters = parseInventoryFilters(
      new URLSearchParams(
        `view=components&plant=${PLANT_ID}&reviewDays=45&replacementDays=60&page=2`,
      ),
    );
    expect(filters).toMatchObject({
      view: "components",
      plantId: PLANT_ID,
      reviewReminderDays: 45,
      replacementReminderDays: 60,
      page: 2,
    });
    expect(
      reminderDue(
        null,
        "2026-08-01T12:00:00.000Z",
        30,
        new Date("2026-10-01T12:00:00.000Z"),
      ),
    ).toBe(true);
    expect(reminderDue(null, null, 30)).toBe(false);
  });

  it("muestra corte, existencia y reconstruye el kardex desde el primer evento", async () => {
    const transport = vi.fn<typeof fetch>((input) => {
      const request = new URL(requestUrl(input), "http://localhost");
      if (request.pathname.endsWith("/management/freshness"))
        return Promise.resolve(
          json({
            cursor: "42",
            hasChanges: false,
            effectiveAtUtc: "2026-10-27T18:00:00.000Z",
            serverTimeUtc: "2026-10-27T18:00:01.000Z",
            pollAfterSeconds: 300,
          }),
        );
      if (request.pathname.endsWith("/plants"))
        return Promise.resolve(plants());
      if (request.pathname.endsWith("/stock")) {
        expect(request.searchParams.get("search")).toBe("cadena");
        expect(request.searchParams.get("page")).toBe("1");
        return Promise.resolve(stock());
      }
      if (request.pathname.endsWith("/movements")) {
        expect(request.searchParams.get("inventoryItemId")).toBe(ITEM_ID);
        expect(request.searchParams.get("direction")).toBe("asc");
        return Promise.resolve(movements());
      }
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal(`/gerencia/inventario?plant=${PLANT_ID}&search=cadena`);

    expect(await screen.findByText("Cadena de rastra")).toBeInTheDocument();
    expect(screen.getByText("UNIDAD")).toBeInTheDocument();
    expect(screen.getByText("REVISIÓN SUGERIDA")).toBeInTheDocument();
    expect(screen.getByText(/Fecha de corte:/u)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "RECONSTRUIR KARDEX →" }),
    );
    expect(await screen.findByText("Entrada inicial")).toBeInTheDocument();
    expect(screen.getByText("Entrada")).toBeInTheDocument();
  });
});

function renderPortal(path: string): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: ["inventory.manage", "organization_catalogs.read"],
      expiresAt: "2026-10-28T01:00:00Z",
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

function plants(): Response {
  return json({
    items: [
      {
        id: PLANT_ID,
        organizationId: ORGANIZATION_ID,
        code: "PLANTA_1",
        name: "Planta principal",
        isActive: true,
        deactivatedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  });
}

function stock(): Response {
  return json({
    items: [
      {
        organizationId: ORGANIZATION_ID,
        plantId: PLANT_ID,
        inventoryItemId: ITEM_ID,
        inventoryItemName: "Cadena de rastra",
        isActive: true,
        itemTypeId: "77000000-0000-4000-8000-000000000001",
        itemTypeName: "Repuesto",
        unitId: "77100000-0000-4000-8000-000000000001",
        unitCode: "UNIDAD",
        unitName: "Unidad",
        decimalPlaces: 0,
        balance: 8,
        firstMovementAtUtc: "2026-08-01T12:00:00.000Z",
        lastMovementAtUtc: "2026-10-21T18:04:00.000Z",
        movementCount: 5,
        latestReviewId: null,
        latestReviewStatus: null,
        latestReviewedAtUtc: null,
        latestExpectedQuantity: null,
        latestCountedQuantity: null,
        latestDifferenceQuantity: null,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  });
}

function movements(): Response {
  return json({
    items: [
      {
        id: "77400000-0000-4000-8000-000000000001",
        inventoryItemId: ITEM_ID,
        movementType: "ENTRY",
        quantityDelta: 10,
        occurredAtUtc: "2026-08-01T12:00:00.000Z",
        recordedAtUtc: "2026-08-01T12:00:01.000Z",
        reason: null,
        destination: null,
        notes: "Entrada inicial",
        relatedMovementId: null,
      },
    ],
    page: 1,
    pageSize: 10,
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
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}
