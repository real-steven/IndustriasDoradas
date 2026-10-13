import type { ConfigService } from "@nestjs/config";

import { SupabaseAuditQueryRepository } from "./supabase-audit-query.repository";
import type { EnvironmentVariables } from "../config/environment";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";

describe("SupabaseAuditQueryRepository", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns occurrence and central confirmation as separate timestamps", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
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
    );
    const repository = new SupabaseAuditQueryRepository(createConfig());

    const page = await repository.list(ORGANIZATION_ID, {
      page: 1,
      pageSize: 20,
      search: "shipment",
    });

    expect(page.items[0]).toMatchObject({
      occurredAt: "2026-10-12T14:00:00.000Z",
      recordedAt: "2026-10-12T14:00:04.000Z",
    });
    const request = fetchMock.mock.calls[0]?.[0];
    if (typeof request !== "string") throw new Error("Expected string URL");
    const url = new URL(request);
    expect(url.searchParams.get("select")).toContain("recorded_at");
    expect(url.searchParams.get("order")).toBe("occurred_at.desc,id.asc");
  });
});

function createConfig(): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === "SUPABASE_URL" ? "https://example.supabase.co" : "secret-key",
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}
