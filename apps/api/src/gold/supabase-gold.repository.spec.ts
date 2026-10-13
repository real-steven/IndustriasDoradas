import type { ConfigService } from "@nestjs/config";

import { SupabaseGoldRepository } from "./supabase-gold.repository";
import type { EnvironmentVariables } from "../config/environment";

describe("SupabaseGoldRepository", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reads only the canonical shipment projection with combined filters", async () => {
    const requests: CapturedRequest[] = [];
    global.fetch = jest.fn((input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      return Promise.resolve(
        response([
          {
            shipment_id: SHIPMENT_ID,
            supplier_id: SUPPLIER_ID,
            supplier_name: "Proveedor ficticio",
            cajuela_total: 100,
            has_gold_result: true,
            gold_amount_grams: "0.00",
          },
        ]),
      );
    });

    const repository = new SupabaseGoldRepository(config());
    const facts = await repository.listShipmentFacts(ORGANIZATION_ID, {
      fromUtc: "2026-10-01T06:00:00.000Z",
      toUtc: "2026-10-02T06:00:00.000Z",
      supplierId: SUPPLIER_ID,
    });

    expect(facts[0]).toMatchObject({
      hasGoldResult: true,
      goldAmountGrams: 0,
    });
    const url = requestUrl(requests[0]?.input);
    expect(url).toContain("management_shipment_facts?");
    expect(url).toContain("completed_at_utc=gte.");
    expect(url).toContain(`supplier_id=eq.${SUPPLIER_ID}`);
    expect(url).not.toContain("gold_result_entries");
  });

  it("resolves author snapshots when reading append-only history", async () => {
    const requests: CapturedRequest[] = [];
    const responses = [
      response([
        {
          id: RESULT_ID,
          organization_id: ORGANIZATION_ID,
          shipment_id: SHIPMENT_ID,
          amount_grams: "2.50",
          unit_code: "g",
          recorded_at_utc: "2026-10-12T12:00:00.000Z",
          recorded_by_profile_id: PROFILE_ID,
          supersedes_result_id: null,
          correction_reason: null,
        },
      ]),
      response([{ id: PROFILE_ID, display_name: "Lucía ficticia" }]),
    ];
    let responseIndex = 0;
    global.fetch = jest.fn((input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      const current = responses[responseIndex];
      responseIndex += 1;
      if (current === undefined) throw new Error("Unexpected request");
      return Promise.resolve(current);
    });

    const history = await new SupabaseGoldRepository(config()).listResults(
      ORGANIZATION_ID,
      SHIPMENT_ID,
    );

    expect(history).toEqual([
      expect.objectContaining({
        amountGrams: 2.5,
        recordedByDisplayName: "Lucía ficticia",
      }),
    ]);
    expect(requestUrl(requests[0]?.input)).toContain(
      "shipment_gold_result_entries?",
    );
    expect(requestUrl(requests[1]?.input)).toContain("user_profiles?");
  });

  it("inserts a new immutable entry instead of updating a prior result", async () => {
    const requests: CapturedRequest[] = [];
    global.fetch = jest.fn((input, init) => {
      requests.push({ input, ...(init === undefined ? {} : { init }) });
      return Promise.resolve(
        response([
          {
            id: RESULT_ID,
            organization_id: ORGANIZATION_ID,
            shipment_id: SHIPMENT_ID,
            amount_grams: "3.25",
            unit_code: "g",
            recorded_at_utc: "2026-10-12T12:00:00.000Z",
            recorded_by_profile_id: PROFILE_ID,
            supersedes_result_id: PREVIOUS_RESULT_ID,
            correction_reason: "Corrección de pesada",
          },
        ]),
      );
    });

    await new SupabaseGoldRepository(config()).createResult({
      id: RESULT_ID,
      organizationId: ORGANIZATION_ID,
      shipmentId: SHIPMENT_ID,
      amountGrams: 3.25,
      recordedAtUtc: "2026-10-12T12:00:00.000Z",
      recordedByProfileId: PROFILE_ID,
      recordedByDisplayName: "Lucía ficticia",
      supersedesResultId: PREVIOUS_RESULT_ID,
      correctionReason: "Corrección de pesada",
    });

    const init = requests[0]?.init;
    expect(init?.method).toBe("POST");
    expect(requestBody(init)).toContain(
      `"supersedes_result_id":"${PREVIOUS_RESULT_ID}"`,
    );
  });
});

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const SHIPMENT_ID = "42000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "35000000-0000-4000-8000-000000000001";
const PROFILE_ID = "a1000000-0000-4000-8000-000000000001";
const RESULT_ID = "46000000-0000-4000-8000-000000000002";
const PREVIOUS_RESULT_ID = "46000000-0000-4000-8000-000000000001";

function config(): ConfigService<EnvironmentVariables, true> {
  return {
    get: jest.fn((key: keyof EnvironmentVariables) =>
      key === "SUPABASE_URL" ? "https://example.supabase.co" : "secret",
    ),
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

function response(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as Response;
}

interface CapturedRequest {
  input: RequestInfo | URL;
  init?: RequestInit;
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (input === undefined) throw new Error("Expected a request");
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string")
    throw new Error("Expected a JSON request body");
  return init.body;
}
