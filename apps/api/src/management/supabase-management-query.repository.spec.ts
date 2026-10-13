import type { ConfigService } from "@nestjs/config";

import { SupabaseManagementQueryRepository } from "./supabase-management-query.repository";
import type { EnvironmentVariables } from "../config/environment";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const LINE_ID = "32000000-0000-4000-8000-000000000001";
const STATION_ID = "34000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000001";
const SHIPMENT_ID = "42000000-0000-4000-8000-000000000001";
const CYCLE_ID = "43000000-0000-4000-8000-000000000001";
const WORKER_ID = "b1000000-0000-4000-8000-000000000001";

describe("SupabaseManagementQueryRepository", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reads only the latest organization change through the pull index", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      json([
        {
          server_sequence: "9007199254740993",
          changed_at_utc: "2026-10-13T06:00:00.000Z",
        },
      ]),
    );
    const repository = new SupabaseManagementQueryRepository(createConfig());

    await expect(repository.findLatestChange(ORGANIZATION_ID)).resolves.toEqual(
      {
        serverSequence: "9007199254740993",
        changedAtUtc: "2026-10-13T06:00:00.000Z",
      },
    );
    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/rest/v1/sync_changes");
    expect(url.searchParams.get("organization_id")).toBe(
      `eq.${ORGANIZATION_ID}`,
    );
    expect(url.searchParams.get("order")).toBe("server_sequence.desc");
    expect(url.searchParams.get("limit")).toBe("1");
  });

  it("combines filters, bounds the page and keeps a deterministic shipment order", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      json([shipmentRow()], {
        "Content-Range": "0-0/2",
      }),
    );
    const repository = new SupabaseManagementQueryRepository(createConfig());

    const page = await repository.listShipments(ORGANIZATION_ID, {
      page: 2,
      pageSize: 1,
      fromUtc: "2026-10-01T00:00:00.000Z",
      toUtc: "2026-10-08T00:00:00.000Z",
      plantId: PLANT_ID,
      productionLineId: LINE_ID,
      supplierId: SUPPLIER_ID,
      responsibleWorkerId: WORKER_ID,
      shipmentId: SHIPMENT_ID,
    });

    expect(page).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(page.items[0]).toMatchObject({
      shipmentId: SHIPMENT_ID,
      status: "COMPLETED",
      cajuelaTotal: 500,
      goldAmountGrams: 12.5,
    });
    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/rest/v1/management_shipment_facts");
    expect(url.searchParams.get("organization_id")).toBe(
      `eq.${ORGANIZATION_ID}`,
    );
    expect(url.searchParams.get("status")).toBe("eq.COMPLETED");
    expect(url.searchParams.get("plant_id")).toBe(`eq.${PLANT_ID}`);
    expect(url.searchParams.get("production_line_id")).toBe(`eq.${LINE_ID}`);
    expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    expect(url.searchParams.get("responsible_worker_id")).toBe(
      `eq.${WORKER_ID}`,
    );
    expect(url.searchParams.get("shipment_id")).toBe(`eq.${SHIPMENT_ID}`);
    expect(url.searchParams.getAll("completed_at_utc")).toEqual([
      "gte.2026-10-01T00:00:00.000Z",
      "lt.2026-10-08T00:00:00.000Z",
    ]);
    expect(url.searchParams.get("order")).toBe(
      "completed_at_utc.desc,shipment_id.asc",
    );
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("offset")).toBe("1");
  });

  it("normalizes absent mercury readings to stable false and null values", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      json(
        [
          {
            organization_id: ORGANIZATION_ID,
            shipment_id: SHIPMENT_ID,
            sweep_id: "44000000-0000-4000-8000-000000000001",
            swept_at_utc: "2026-10-02T12:00:00.000Z",
            cajuela_count: 250,
            line_component_id: "45000000-0000-4000-8000-000000000001",
            line_component_name: "Rastra ficticia",
            line_component_order: 1,
            input_grams: null,
            remainder_grams: null,
            has_input_record: null,
            has_remainder_record: null,
          },
        ],
        { "Content-Range": "0-0/1" },
      ),
    );
    const repository = new SupabaseManagementQueryRepository(createConfig());

    const page = await repository.listShipmentSweeps(
      ORGANIZATION_ID,
      SHIPMENT_ID,
      { page: 1, pageSize: 20 },
    );

    expect(page.items[0]).toMatchObject({
      inputGrams: null,
      remainderGrams: null,
      hasInputRecord: false,
      hasRemainderRecord: false,
    });
  });
});

function shipmentRow() {
  return {
    organization_id: ORGANIZATION_ID,
    plant_id: PLANT_ID,
    station_id: STATION_ID,
    station_name: "Estación ficticia",
    shipment_id: SHIPMENT_ID,
    feed_cycle_id: CYCLE_ID,
    status: "COMPLETED",
    started_at_utc: "2026-10-01T08:00:00.000Z",
    completed_at_utc: "2026-10-02T18:00:00.000Z",
    production_line_id: LINE_ID,
    production_line_name: "Línea ficticia",
    production_line_order: 1,
    supplier_id: SUPPLIER_ID,
    supplier_name: "Proveedor ficticio",
    responsible_worker_id: WORKER_ID,
    responsible_worker_name: "Responsable ficticio",
    cajuela_total: 500,
    sweep_count: 2,
    swept_cajuelas: 500,
    cajuelas_since_last_sweep: 0,
    next_sweep_at: 750,
    sweep_pending: false,
    gold_result_id: "46000000-0000-4000-8000-000000000001",
    gold_amount_grams: "12.50",
    gold_unit_code: "g",
    gold_recorded_at_utc: "2026-10-03T12:00:00.000Z",
    gold_recorded_by_profile_id: "a1000000-0000-4000-8000-000000000001",
    gold_revision_count: 1,
    has_gold_result: true,
    last_activity_at_utc: "2026-10-03T12:00:00.000Z",
  };
}

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createConfig(): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === "SUPABASE_URL" ? "https://example.supabase.co" : "secret-key",
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function requestedUrl(fetchMock: jest.SpiedFunction<typeof fetch>): URL {
  const request = fetchMock.mock.calls[0]?.[0];
  if (typeof request !== "string") throw new Error("Expected a string URL");
  return new URL(request);
}
