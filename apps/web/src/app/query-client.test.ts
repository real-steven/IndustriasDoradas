import { describe, expect, it } from "vitest";

import { ApiConnectionError, ApiRequestError } from "../api/http";
import { shouldRetryQuery } from "./query-client";

describe("shouldRetryQuery", () => {
  it("does not retry offline, authentication, authorization or validation failures", () => {
    expect(
      shouldRetryQuery(0, new ApiConnectionError("OFFLINE", "offline")),
    ).toBe(false);
    expect(shouldRetryQuery(0, new ApiRequestError(401, "AUTH", "auth"))).toBe(
      false,
    );
    expect(
      shouldRetryQuery(0, new ApiRequestError(403, "FORBIDDEN", "forbidden")),
    ).toBe(false);
    expect(
      shouldRetryQuery(0, new ApiRequestError(422, "INVALID", "invalid")),
    ).toBe(false);
  });

  it("retries a transient failure only once", () => {
    expect(
      shouldRetryQuery(
        0,
        new ApiConnectionError("NETWORK_UNAVAILABLE", "network"),
      ),
    ).toBe(true);
    expect(
      shouldRetryQuery(0, new ApiRequestError(503, "UNAVAILABLE", "down")),
    ).toBe(true);
    expect(
      shouldRetryQuery(1, new ApiRequestError(503, "UNAVAILABLE", "down")),
    ).toBe(false);
  });
});
