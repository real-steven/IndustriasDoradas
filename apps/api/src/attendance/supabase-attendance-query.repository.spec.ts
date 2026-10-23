import type { ConfigService } from "@nestjs/config";

import { SupabaseAttendanceQueryRepository } from "./supabase-attendance-query.repository";
import type { EnvironmentVariables } from "../config/environment";

describe("SupabaseAttendanceQueryRepository", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loads deterministic history and resolves worker names server-side", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(json([eventRow()]))
      .mockResolvedValueOnce(
        json([{ id: WORKER_ID, name: "Operario ficticio" }]),
      );
    const repository = new SupabaseAttendanceQueryRepository(createConfig());

    const events = await repository.listHistory(ORGANIZATION_ID, {
      plantId: PLANT_ID,
      workerId: WORKER_ID,
    });

    expect(events[0]).toMatchObject({
      workerId: WORKER_ID,
      workerName: "Operario ficticio",
      clientSequence: "9007199254740993",
      eventType: "CHECK_IN",
    });
    const eventUrl = requestedUrl(fetchMock, 0);
    expect(eventUrl.pathname).toBe("/rest/v1/attendance_events");
    expect(eventUrl.searchParams.has("occurred_at_utc")).toBe(false);
    expect(eventUrl.searchParams.get("plant_id")).toBe(`eq.${PLANT_ID}`);
    expect(eventUrl.searchParams.get("worker_id")).toBe(`eq.${WORKER_ID}`);
    expect(eventUrl.searchParams.get("order")).toBe(
      "occurred_at_utc.asc,client_sequence.asc,id.asc",
    );

    const workerUrl = requestedUrl(fetchMock, 1);
    expect(workerUrl.pathname).toBe("/rest/v1/workers");
    expect(workerUrl.searchParams.get("id")).toBe(`in.(${WORKER_ID})`);
  });

  it("resolves the display name of the profile that recorded an adjustment", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        json([
          eventRow({
            event_type: "ADJUSTED_CHECK_OUT",
            corrected_by_profile_id: PROFILE_ID,
            correction_reason: "Salida olvidada",
            related_event_id: "61000000-0000-4000-8000-000000000099",
          }),
        ]),
      )
      .mockResolvedValueOnce(
        json([{ id: WORKER_ID, name: "Operario ficticio" }]),
      )
      .mockResolvedValueOnce(
        json([{ id: PROFILE_ID, display_name: "Jefa de planta" }]),
      );
    const repository = new SupabaseAttendanceQueryRepository(createConfig());

    const events = await repository.listHistory(ORGANIZATION_ID, {});

    expect(events[0]).toMatchObject({
      eventType: "ADJUSTED_CHECK_OUT",
      correctedByProfileId: PROFILE_ID,
      correctedByDisplayName: "Jefa de planta",
      correctionReason: "Salida olvidada",
    });
    const profileUrl = requestedUrl(fetchMock, 2);
    expect(profileUrl.pathname).toBe("/rest/v1/user_profiles");
    expect(profileUrl.searchParams.get("id")).toBe(`in.(${PROFILE_ID})`);
  });
});

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const STATION_ID = "34000000-0000-4000-8000-000000000001";
const WORKER_ID = "b1000000-0000-4000-8000-000000000001";
const PROFILE_ID = "a1000000-0000-4000-8000-000000000001";

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "61000000-0000-4000-8000-000000000001",
    organization_id: ORGANIZATION_ID,
    plant_id: PLANT_ID,
    station_id: STATION_ID,
    worker_id: WORKER_ID,
    client_sequence: "9007199254740993",
    event_type: "CHECK_IN",
    occurred_at_utc: "2026-10-20T12:00:00.000Z",
    recorded_at_utc: "2026-10-20T12:00:00.000Z",
    confirmed_at_utc: "2026-10-20T12:00:01.000Z",
    sync_status: "SYNCHRONIZED",
    corrected_by_profile_id: null,
    correction_reason: null,
    related_event_id: null,
    ...overrides,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createConfig(): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === "SUPABASE_URL" ? "https://example.supabase.co" : "secret-key",
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function requestedUrl(
  fetchMock: jest.SpiedFunction<typeof fetch>,
  index: number,
): URL {
  const request = fetchMock.mock.calls[index]?.[0];
  if (typeof request !== "string") throw new Error("Expected a string URL");
  return new URL(request);
}
