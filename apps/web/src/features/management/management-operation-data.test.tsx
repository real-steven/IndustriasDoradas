import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/auth-context";
import { useManagementFreshness } from "./management-operation-data";

describe("frescura gerencial", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("establishes a baseline cursor and invalidates data only after it advances", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          cursor: "djE6MTA=",
          hasChanges: false,
          effectiveAtUtc: "2026-10-13T06:00:00.000Z",
          serverTimeUtc: "2026-10-13T06:00:01.000Z",
          pollAfterSeconds: 30,
        }),
      )
      .mockResolvedValueOnce(
        json({
          cursor: "djE6MTE=",
          hasChanges: true,
          effectiveAtUtc: "2026-10-13T06:01:00.000Z",
          serverTimeUtc: "2026-10-13T06:01:01.000Z",
          pollAfterSeconds: 30,
        }),
      );
    vi.stubGlobal("fetch", transport);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["management-operation"], { preserved: true });

    const { result } = renderHook(() => useManagementFreshness(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryState(["management-operation"])?.isInvalidated).toBe(
      false,
    );

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() =>
      expect(
        client.getQueryState(["management-operation"])?.isInvalidated,
      ).toBe(true),
    );
    const secondUrl = new URL(
      requestUrl(transport.mock.calls[1]?.[0]),
      "http://localhost",
    );
    expect(secondUrl.searchParams.get("cursor")).toBe("djE6MTA=");
  });
});

function wrapper(client: QueryClient) {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: "30000000-0000-4000-8000-000000000001",
      role: "JEFE_EMPRESA",
      permissions: [],
      expiresAt: "2026-10-13T12:00:00.000Z",
    },
    foundSession: null,
    loading: false,
    error: null,
    continueFoundSession: vi.fn(),
    signIn: vi.fn(),
    recover: vi.fn(),
    signOut: vi.fn(),
  };
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <AuthContext.Provider value={auth}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </AuthContext.Provider>
    );
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
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}
