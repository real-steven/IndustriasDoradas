import type { ConfigService } from "@nestjs/config";

import { SupabaseStationRepository } from "./supabase-station.repository";
import type { EnvironmentVariables } from "../config/environment";

describe("SupabaseStationRepository", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("continues the station sequence from the latest central receipt", async () => {
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        json([{ plant_id: "31000000-0000-4000-8000-000000000001" }]),
      )
      .mockResolvedValueOnce(
        json([
          {
            id: "34000000-0000-4000-8000-000000000001",
            plant_id: "31000000-0000-4000-8000-000000000001",
            name: "Estación ficticia",
            permission_version: 1,
          },
        ]),
      )
      .mockResolvedValueOnce(json([{ verifier: "verifier" }]))
      .mockResolvedValueOnce(json([{ station_sequence: 49 }]));
    const repository = new SupabaseStationRepository(createConfig());

    const snapshot = await repository.getSnapshot({
      organizationId: "30000000-0000-4000-8000-000000000001",
      stationId: "34000000-0000-4000-8000-000000000001",
      profileId: "a1000000-0000-4000-8000-000000000001",
      observedAt: "2026-09-23T07:00:00.000Z",
    });

    expect(snapshot?.nextStationSequence).toBe(50);
    const receiptRequest = fetchMock.mock.calls[3]?.[0];
    if (typeof receiptRequest !== "string") {
      throw new Error("Expected the receipt request to use a string URL");
    }
    expect(receiptRequest).toContain("sync_receipts?");
    expect(receiptRequest).toContain("order=station_sequence.desc");
  });

  it("lets PostgreSQL assign creation timestamps for a new PIN credential", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    const repository = new SupabaseStationRepository(createConfig());

    await repository.setPinVerifier({
      organizationId: "30000000-0000-4000-8000-000000000001",
      profileId: "a1000000-0000-4000-8000-000000000001",
      verifier: "pbkdf2-sha256$600000$fixture-salt$fixture-hash",
      observedAt: "2026-08-20T09:01:39.000Z",
    });

    expect(fetchMock.mock.calls).toHaveLength(2);
    const insert = fetchMock.mock.calls[1]?.[1];
    if (typeof insert?.body !== "string") {
      throw new Error("Expected the insert request to contain a JSON body");
    }
    const body = JSON.parse(insert.body) as Record<string, unknown>;
    expect(body.changed_at).toBe("2026-08-20T09:01:39.000Z");
    expect(body).not.toHaveProperty("created_at");
    expect(body).not.toHaveProperty("updated_at");
  });
});

function createConfig(): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) => {
      if (key === "SUPABASE_URL") return "https://example.invalid";
      if (key === "SUPABASE_SECRET_KEY") return "sb_secret_fixture";
      throw new Error(`Unexpected configuration key: ${key}`);
    }),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}
