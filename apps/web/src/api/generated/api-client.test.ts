import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "./api-client";

describe("generated ApiClient", () => {
  it("consumes the session endpoint with the bearer token", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: "a0000000-0000-4000-8000-000000000001",
          sessionId: "a0000000-0000-4000-8000-000000000002",
          profileId: "a1000000-0000-4000-8000-000000000001",
          organizationId: "30000000-0000-4000-8000-000000000001",
          role: "JEFE_EMPRESA",
          issuedAt: "2026-08-19T00:00:00Z",
          expiresAt: "2026-08-19T01:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient(
      "https://api.example.invalid",
      () => "fictitious-token",
      transport,
    );

    await expect(client.getSession()).resolves.toMatchObject({
      role: "JEFE_EMPRESA",
    });
    expect(transport.mock.calls[0]?.[0]).toBe(
      "https://api.example.invalid/api/v1/auth/session",
    );
    expect(transport.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer fictitious-token",
    });
  });
});
