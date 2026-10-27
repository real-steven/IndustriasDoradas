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
const ITEM_TYPE_ID = "77000000-0000-4000-8000-000000000001";
const UNIT_ID = "77100000-0000-4000-8000-000000000001";
const LINE_ID = "32000000-0000-4000-8000-000000000001";
const NOVELTY_CATEGORY_ID = "77300000-0000-4000-8000-000000000002";

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

  it("crea un artículo por carga manual sin inventar existencia inicial", async () => {
    let created = false;
    const transport = vi.fn<typeof fetch>((input, init) => {
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
      if (request.pathname.endsWith("/inventory/item-types"))
        return Promise.resolve(
          catalogPage([
            catalogEntry(ITEM_TYPE_ID, "Herramienta", {
              code: "HERRAMIENTA",
            }),
          ]),
        );
      if (request.pathname.endsWith("/inventory/units"))
        return Promise.resolve(
          catalogPage([
            catalogEntry(UNIT_ID, "Unidad", {
              code: "UNIDAD",
              decimalPlaces: 0,
            }),
          ]),
        );
      if (request.pathname.endsWith(`/plants/${PLANT_ID}/items`)) {
        if (init?.method === "POST") {
          if (typeof init.body !== "string")
            throw new Error("Expected JSON request body");
          expect(JSON.parse(init.body)).toEqual({
            name: "Martillo",
            itemTypeId: ITEM_TYPE_ID,
            unitId: UNIT_ID,
          });
          created = true;
          return Promise.resolve(
            json(
              catalogEntry(ITEM_ID, "Martillo", {
                itemTypeId: ITEM_TYPE_ID,
                unitId: UNIT_ID,
                plantId: PLANT_ID,
              }),
            ),
          );
        }
        return Promise.resolve(
          catalogPage(
            created
              ? [
                  catalogEntry(ITEM_ID, "Martillo", {
                    itemTypeId: ITEM_TYPE_ID,
                    unitId: UNIT_ID,
                    plantId: PLANT_ID,
                  }),
                ]
              : [],
          ),
        );
      }
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal(`/gerencia/inventario?plant=${PLANT_ID}&view=catalog`);

    expect(
      await screen.findByRole("heading", { name: "Carga manual del catálogo" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre del artículo"), {
      target: { value: "Martillo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "CREAR ARTÍCULO" }));

    expect(
      await screen.findByText(
        "Artículo “Martillo” creado sin existencia inicial.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Martillo")).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalledWith(
      expect.stringContaining("/movements"),
      expect.anything(),
    );
  });

  it("registra una entrada excepcional desde web con la unidad del artículo", async () => {
    let savedBody: Record<string, unknown> | null = null;
    const transport = vi.fn<typeof fetch>((input, init) => {
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
      if (request.pathname.endsWith("/inventory/units"))
        return Promise.resolve(
          catalogPage([
            catalogEntry(UNIT_ID, "Unidad", {
              code: "UNIDAD",
              decimalPlaces: 0,
            }),
          ]),
        );
      if (request.pathname.endsWith(`/plants/${PLANT_ID}/items`))
        return Promise.resolve(
          catalogPage([
            catalogEntry(ITEM_ID, "Martillo", {
              itemTypeId: ITEM_TYPE_ID,
              unitId: UNIT_ID,
              plantId: PLANT_ID,
            }),
          ]),
        );
      if (request.pathname.endsWith("/stock")) return Promise.resolve(stock());
      if (request.pathname.endsWith("/movements")) {
        if (init?.method === "POST") {
          if (typeof init.body !== "string")
            throw new Error("Expected JSON request body");
          savedBody = JSON.parse(init.body) as Record<string, unknown>;
          return Promise.resolve(
            json({
              id: "77400000-0000-4000-8000-000000000001",
              ...savedBody,
              quantityDelta: 4,
              recordedAtUtc: "2026-10-27T18:00:01.000Z",
              reason: null,
              destination: null,
              notes: null,
              relatedMovementId: null,
              linkedSweepId: null,
            }),
          );
        }
        return Promise.resolve(
          json({
            items: [],
            page: 1,
            pageSize: 100,
            total: 0,
            totalPages: 0,
          }),
        );
      }
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal(`/gerencia/inventario?plant=${PLANT_ID}&view=actions`);

    expect(
      await screen.findByRole("heading", {
        name: "Registrar hecho de inventario",
      }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Cantidad/u), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "REGISTRAR HECHO" }));

    expect(
      await screen.findByText(
        "Hecho registrado; el kardex conserva el original y la auditoría.",
      ),
    ).toBeInTheDocument();
    const submitted = savedBody as Record<string, unknown> | null;
    expect(submitted).toMatchObject({
      inventoryItemId: ITEM_ID,
      unitId: UNIT_ID,
      movementType: "ENTRY",
      quantity: 4,
    });
    expect(submitted?.["occurredAtUtc"]).toEqual(expect.any(String));
  });

  it("abre una novedad de línea sin crear una orden de mantenimiento", async () => {
    let savedBody: Record<string, unknown> | null = null;
    const transport = vi.fn<typeof fetch>((input, init) => {
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
      if (request.pathname.endsWith(`/plants/${PLANT_ID}/lines`))
        return Promise.resolve(
          catalogPage([
            catalogEntry(LINE_ID, "Línea 1", { plantId: PLANT_ID }),
          ]),
        );
      if (request.pathname.endsWith("/inventory/novelty-categories"))
        return Promise.resolve(
          json([
            {
              id: NOVELTY_CATEGORY_ID,
              organizationId: ORGANIZATION_ID,
              code: "MANTENIMIENTO",
              name: "Mantenimiento",
              isActive: true,
            },
          ]),
        );
      if (request.pathname.endsWith(`/plants/${PLANT_ID}/novelties`)) {
        if (init?.method === "POST") {
          if (typeof init.body !== "string")
            throw new Error("Expected JSON request body");
          savedBody = JSON.parse(init.body) as Record<string, unknown>;
          return Promise.resolve(
            json({ id: crypto.randomUUID(), ...savedBody }),
          );
        }
        return Promise.resolve(catalogPage([]));
      }
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderPortal(`/gerencia/inventario?plant=${PLANT_ID}&view=novelties`);

    expect(
      await screen.findByRole("heading", { name: "Abrir novedad operativa" }),
    ).toBeInTheDocument();
    await screen.findByRole("option", { name: "Línea 1" });
    fireEvent.change(screen.getByLabelText("Alcance"), {
      target: { value: LINE_ID },
    });
    fireEvent.change(screen.getByLabelText("Descripción"), {
      target: { value: "Rastra detenida para cambio de componente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ABRIR NOVEDAD" }));

    expect(
      await screen.findByText("Novedad abierta y auditada."),
    ).toBeInTheDocument();
    expect(savedBody).toMatchObject({
      lineId: LINE_ID,
      categoryId: NOVELTY_CATEGORY_ID,
      description: "Rastra detenida para cambio de componente",
    });
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

function catalogPage(items: unknown[]): Response {
  return json({
    items,
    page: 1,
    pageSize: 100,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  });
}

function catalogEntry(
  id: string,
  name: string,
  extra: Record<string, unknown>,
) {
  return {
    id,
    organizationId: ORGANIZATION_ID,
    name,
    isActive: true,
    deactivatedAt: null,
    isCustom: false,
    createdAt: "2026-10-27T18:00:00.000Z",
    updatedAt: "2026-10-27T18:00:00.000Z",
    ...extra,
  };
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
