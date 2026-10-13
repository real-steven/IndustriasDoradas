import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiConnectionError,
  ApiRequestError,
  apiRequest,
  apiRequestTimeoutMs,
  requestErrorMessage,
  unauthorizedEventName,
} from "./http";

describe("apiRequest", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not send a request while the browser reports offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);

    await expect(apiRequest("/private", "secret-token")).rejects.toMatchObject({
      code: "OFFLINE",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("turns network failures into a controlled user-facing error", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError("socket detail"))),
    );

    const request = apiRequest("/private", "secret-token");
    await expect(request).rejects.toBeInstanceOf(ApiConnectionError);
    await expect(requestError(request)).resolves.toBe(
      "No fue posible conectar con el servicio. Intente nuevamente.",
    );
  });

  it("stops a request that never answers instead of leaving the session loading", async () => {
    vi.useFakeTimers();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );

    const rejection = apiRequest("/auth/session", "secret-token").catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(apiRequestTimeoutMs);

    await expect(rejection).resolves.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
  });

  it("signals an expired session without exposing the server diagnostic", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              code: "TOKEN_INVALID",
              message: "internal jwt diagnostic with secret details",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
    const unauthorized = vi.fn();
    window.addEventListener(unauthorizedEventName, unauthorized);

    const request = apiRequest("/private", "secret-token");
    await expect(request).rejects.toMatchObject({
      status: 401,
      message: "La sesión no es válida o venció.",
    });
    expect(unauthorized).toHaveBeenCalledOnce();
    window.removeEventListener(unauthorizedEventName, unauthorized);
  });

  it("uses a safe message for forbidden responses", () => {
    const error = new ApiRequestError(403, "FORBIDDEN", "technical detail");
    expect(requestErrorMessage(error)).toBe(
      "La cuenta no tiene permiso para consultar esta información.",
    );
  });
});

async function requestError(request: Promise<unknown>): Promise<string> {
  try {
    await request;
    throw new Error("Expected request to fail");
  } catch (error) {
    return requestErrorMessage(error);
  }
}
