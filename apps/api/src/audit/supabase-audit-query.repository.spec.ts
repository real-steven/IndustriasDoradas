import type { ConfigService } from "@nestjs/config";

import { SupabaseAuditQueryRepository } from "./supabase-audit-query.repository";
import type { EnvironmentVariables } from "../config/environment";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";

describe("SupabaseAuditQueryRepository", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns occurrence and central confirmation as separate timestamps", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "d1000000-0000-4000-8000-000000000001",
              correlation_id: "d2000000-0000-4000-8000-000000000001",
              organization_id: ORGANIZATION_ID,
              station_id: "34000000-0000-4000-8000-000000000001",
              actor_display_name: "Operario ficticio",
              actor_role_code: "JEFE_PLANTA",
              origin: "SYNC",
              action: "sync.ingest",
              entity_type: "shipment",
              entity_id: "42000000-0000-4000-8000-000000000001",
              result: "SUCCEEDED",
              reason_code: null,
              evidence_state: "NOT_APPLICABLE",
              changed_fields: [],
              changes: {},
              occurred_at: "2026-10-12T14:00:00.000Z",
              recorded_at: "2026-10-12T14:00:04.000Z",
            },
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Range": "0-0/1",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              shipment_id: "42000000-0000-4000-8000-000000000001",
              status: "ACTIVE",
            },
          ]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    const repository = new SupabaseAuditQueryRepository(createConfig());

    const page = await repository.list(ORGANIZATION_ID, {
      page: 1,
      pageSize: 20,
      search: "shipment",
      action: "sync.ingest",
      entityType: "shipment",
      routine: "exclude",
    });

    expect(page.items[0]).toMatchObject({
      occurredAt: "2026-10-12T14:00:00.000Z",
      recordedAt: "2026-10-12T14:00:04.000Z",
      shipmentStatus: "ACTIVE",
    });
    const request = fetchMock.mock.calls[0]?.[0];
    if (typeof request !== "string") throw new Error("Expected string URL");
    const url = new URL(request);
    expect(url.pathname).toBe("/rest/v1/management_audit_entries");
    expect(url.searchParams.get("select")).toContain("recorded_at");
    expect(url.searchParams.get("select")).toContain("audit_kind");
    expect(url.searchParams.get("is_routine")).toBe("is.false");
    expect(url.searchParams.get("order")).toBe("occurred_at.desc,id.asc");
    expect(url.searchParams.get("action")).toBe("eq.sync.ingest");
    expect(url.searchParams.get("entity_type")).toBe("eq.shipment");
    const statusRequest = fetchMock.mock.calls[1]?.[0];
    if (typeof statusRequest !== "string")
      throw new Error("Expected string status URL");
    const statusUrl = new URL(statusRequest);
    expect(statusUrl.pathname).toBe("/rest/v1/management_shipment_facts");
    expect(statusUrl.searchParams.get("shipment_id")).toContain(
      "42000000-0000-4000-8000-000000000001",
    );
  });

  it.each([
    [
      " 5510B16a ",
      "and(entity_id.gte.5510b16a-0000-0000-0000-000000000000,entity_id.lte.5510b16a-ffff-ffff-ffff-ffffffffffff)",
    ],
    [
      "5510B16A-0000-4000-8000-00000000000A",
      "entity_id.eq.5510b16a-0000-4000-8000-00000000000a",
    ],
  ])(
    "finds shipment activity by code %s inside the organization",
    async (search, clause) => {
      const fetchMock = emptyPage();
      const repository = new SupabaseAuditQueryRepository(createConfig());

      await repository.list(ORGANIZATION_ID, { page: 1, pageSize: 12, search });

      const url = requestedUrl(fetchMock);
      expect(url.searchParams.get("organization_id")).toBe(
        `eq.${ORGANIZATION_ID}`,
      );
      expect(url.searchParams.get("or")).toContain(clause);
    },
  );

  it("does not treat ordinary text as a shipment code", async () => {
    const fetchMock = emptyPage();
    const repository = new SupabaseAuditQueryRepository(createConfig());

    await repository.list(ORGANIZATION_ID, {
      page: 1,
      pageSize: 12,
      search: "Lucía",
    });

    expect(requestedUrl(fetchMock).searchParams.get("or")).not.toContain(
      "entity_id",
    );
  });

  it.each(["operation", "people", "security", "administration"] as const)(
    "filters the %s area on the classified server view",
    async (category) => {
      const fetchMock = emptyPage();
      const repository = new SupabaseAuditQueryRepository(createConfig());

      await repository.list(ORGANIZATION_ID, {
        page: 1,
        pageSize: 20,
        category,
        routine: "exclude",
      });

      const url = requestedUrl(fetchMock);
      expect(url.pathname).toBe("/rest/v1/management_audit_entries");
      expect(url.searchParams.get("audit_area")).toBe(`eq.${category}`);
      expect(url.searchParams.get("is_routine")).toBe("is.false");
      expect(url.searchParams.get("action")).toBeNull();
    },
  );

  it("combines kind, person, line and date filters with server pagination", async () => {
    const fetchMock = emptyPage();
    const repository = new SupabaseAuditQueryRepository(createConfig());

    await repository.list(ORGANIZATION_ID, {
      page: 3,
      pageSize: 12,
      category: "people",
      kinds: "ATTENDANCE_CHECK_IN,ATTENDANCE_CHECK_IN_CORRECTED",
      workerId: WORKER_ID,
      productionLineId: LINE_ID,
      fromUtc: "2026-11-01T06:00:00.000Z",
      toUtc: "2026-11-08T06:00:00.000Z",
    });

    const url = requestedUrl(fetchMock);
    expect(url.searchParams.get("audit_kind")).toBe(
      "in.(ATTENDANCE_CHECK_IN,ATTENDANCE_CHECK_IN_CORRECTED)",
    );
    expect(url.searchParams.get("subject_worker_id")).toBe(`eq.${WORKER_ID}`);
    expect(url.searchParams.get("production_line_id")).toBe(`eq.${LINE_ID}`);
    expect(url.searchParams.getAll("occurred_at")).toEqual([
      "gte.2026-11-01T06:00:00.000Z",
      "lt.2026-11-08T06:00:00.000Z",
    ]);
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("offset")).toBe("24");
    expect(url.searchParams.get("is_routine")).toBeNull();
  });

  it("maps the person and time of an attendance entry", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            ...auditRow(),
            action: "attendance.record",
            entity_type: "attendance_event",
            audit_area: "people",
            audit_kind: "ATTENDANCE_CHECK_IN",
            subject_worker_id: WORKER_ID,
            subject_name: "Persona ficticia",
            subject_occurred_at_utc: "2026-11-03T12:05:00+00:00",
          },
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/1",
          },
        },
      ),
    );
    const repository = new SupabaseAuditQueryRepository(createConfig());

    const page = await repository.list(ORGANIZATION_ID, {
      page: 1,
      pageSize: 20,
      category: "people",
    });

    expect(page.items[0]).toMatchObject({
      auditArea: "people",
      auditKind: "ATTENDANCE_CHECK_IN",
      subjectWorkerId: WORKER_ID,
      subjectName: "Persona ficticia",
      subjectOccurredAtUtc: "2026-11-03T12:05:00+00:00",
      productionLineId: null,
    });
  });

  it("searches the person a fact refers to", async () => {
    const fetchMock = emptyPage();
    const repository = new SupabaseAuditQueryRepository(createConfig());

    await repository.list(ORGANIZATION_ID, {
      page: 1,
      pageSize: 20,
      search: "Ana",
    });

    expect(requestedUrl(fetchMock).searchParams.get("or")).toContain(
      "subject_name.ilike.*Ana*",
    );
  });
});

const WORKER_ID = "45000000-0000-4000-8000-000000000001";
const LINE_ID = "43000000-0000-4000-8000-000000000001";

function emptyPage(): jest.SpyInstance<
  Promise<Response>,
  Parameters<typeof fetch>
> {
  return jest.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response("[]", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Range": "*/0",
      },
    }),
  );
}

function requestedUrl(
  fetchMock: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>,
): URL {
  const request: unknown = fetchMock.mock.calls[0]?.[0];
  if (typeof request !== "string") throw new Error("Expected string URL");
  return new URL(request);
}

function auditRow(): Record<string, unknown> {
  return {
    id: "d1000000-0000-4000-8000-000000000002",
    correlation_id: "d2000000-0000-4000-8000-000000000002",
    organization_id: ORGANIZATION_ID,
    station_id: null,
    actor_display_name: "Jefe ficticio",
    actor_role_code: "JEFE_PLANTA",
    origin: "SYNC",
    action: "sync.ingest",
    entity_type: "shipment",
    entity_id: "42000000-0000-4000-8000-000000000002",
    result: "SUCCEEDED",
    reason_code: null,
    evidence_state: "NOT_APPLICABLE",
    changed_fields: [],
    changes: {},
    occurred_at: "2026-11-03T12:05:01.000Z",
    recorded_at: "2026-11-03T12:05:02.000Z",
    audit_area: "operation",
    audit_kind: "LINE_STARTED",
    subject_worker_id: null,
    subject_name: null,
    subject_occurred_at_utc: null,
    production_line_id: null,
  };
}

function createConfig(): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === "SUPABASE_URL" ? "https://example.supabase.co" : "secret-key",
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}
