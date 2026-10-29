import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueryProvider } from "../app/query-provider";
import { apiRequestTimeoutMs, unauthorizedEventName } from "../api/http";
import { useAuth } from "./auth-context";
import { AuthProvider } from "./auth-provider";

describe("AuthProvider privacy", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops loading when Supabase cannot finish restoring the session", async () => {
    vi.useFakeTimers();
    const harness = createSupabaseHarness({ sessionNeverResolves: true });
    const queryClient = testQueryClient();

    renderAuth(harness.client, queryClient);
    expect(screen.getByText("loading")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(apiRequestTimeoutMs));

    expect(screen.getByText("signed-out")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No fue posible comprobar la sesión",
    );
  });

  it("keeps an initial stored session closed until the user confirms it", async () => {
    const harness = createSupabaseHarness();
    const queryClient = testQueryClient();
    const transport = sessionTransport();
    vi.stubGlobal("fetch", transport);

    renderAuth(harness.client, queryClient);

    expect(await screen.findByText(ACCOUNT_EMAIL)).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
    expect(screen.queryByText(PROFILE_ID)).not.toBeInTheDocument();

    await openFoundSession();

    expect(await screen.findByText(PROFILE_ID)).toBeInTheDocument();
    expect(transport).toHaveBeenCalledOnce();
  });

  it("stops loading when application session validation never finishes", async () => {
    vi.useFakeTimers();
    const harness = createSupabaseHarness();
    const queryClient = testQueryClient();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise(() => undefined)),
    );

    renderAuth(harness.client, queryClient);
    await act(() => Promise.resolve());
    expect(screen.getByText(ACCOUNT_EMAIL)).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Continuar prueba" }).click());
    expect(screen.getByText("loading")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(apiRequestTimeoutMs));

    expect(screen.getByText(ACCOUNT_EMAIL)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No fue posible comprobar la sesión",
    );
  });

  it("clears private query data when Supabase reports SIGNED_OUT", async () => {
    const harness = createSupabaseHarness();
    const queryClient = testQueryClient();
    queryClient.setQueryData(["management-shipments", "old-profile"], {
      private: true,
    });
    vi.stubGlobal("fetch", sessionTransport());

    renderAuth(harness.client, queryClient);
    await openFoundSession();
    expect(await screen.findByText(PROFILE_ID)).toBeInTheDocument();

    act(() => {
      harness.emit("SIGNED_OUT", null);
    });

    expect(screen.getByText("signed-out")).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("signs out only the current device and hides cached data immediately", async () => {
    const user = userEvent.setup();
    const harness = createSupabaseHarness();
    const queryClient = testQueryClient();
    queryClient.setQueryData(["gold-summary", "current-profile"], {
      private: true,
    });
    vi.stubGlobal("fetch", sessionTransport());

    renderAuth(harness.client, queryClient);
    await openFoundSession();
    expect(await screen.findByText(PROFILE_ID)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar prueba" }));

    await waitFor(() =>
      expect(harness.signOut).toHaveBeenCalledWith({ scope: "local" }),
    );
    expect(screen.getByText("signed-out")).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("ends the local session when a protected API reports 401", async () => {
    const harness = createSupabaseHarness();
    const queryClient = testQueryClient();
    queryClient.setQueryData(["shipment-audit", "current-profile"], {
      private: true,
    });
    vi.stubGlobal("fetch", sessionTransport());

    renderAuth(harness.client, queryClient);
    await openFoundSession();
    expect(await screen.findByText(PROFILE_ID)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event(unauthorizedEventName));
    });

    expect(screen.getByText("signed-out")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("La sesión venció");
    expect(harness.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("revalidates the application session after Supabase refreshes the token", async () => {
    const harness = createSupabaseHarness();
    const queryClient = testQueryClient();
    const transport = sessionTransport();
    vi.stubGlobal("fetch", transport);

    renderAuth(harness.client, queryClient);
    await openFoundSession();
    expect(await screen.findByText(PROFILE_ID)).toBeInTheDocument();

    act(() => harness.emit("TOKEN_REFRESHED", authSession("refreshed-token")));

    await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    const refreshedHeaders = new Headers(transport.mock.calls[1]?.[1]?.headers);
    expect(refreshedHeaders.get("Authorization")).toBe(
      "Bearer refreshed-token",
    );
    expect(screen.getByText(PROFILE_ID)).toBeInTheDocument();
  });
});

function AuthProbe() {
  const auth = useAuth();
  return (
    <div>
      <span>
        {auth.loading
          ? "loading"
          : (auth.profile?.profileId ??
            auth.foundSession?.email ??
            "signed-out")}
      </span>
      {auth.error !== null && <p role="alert">{auth.error}</p>}
      {auth.foundSession !== null && (
        <button type="button" onClick={() => void auth.continueFoundSession()}>
          Continuar prueba
        </button>
      )}
      <button type="button" onClick={() => void auth.signOut()}>
        Cerrar prueba
      </button>
    </div>
  );
}

async function openFoundSession(): Promise<void> {
  const user = userEvent.setup();
  expect(await screen.findByText(ACCOUNT_EMAIL)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continuar prueba" }));
}

function renderAuth(client: SupabaseClient, queryClient: QueryClient): void {
  render(
    <QueryProvider client={queryClient}>
      <AuthProvider client={client}>
        <AuthProbe />
      </AuthProvider>
    </QueryProvider>,
  );
}

function createSupabaseHarness(
  options: { sessionNeverResolves?: boolean } = {},
): {
  client: SupabaseClient;
  emit(this: void, event: AuthChangeEvent, session: Session | null): void;
  signOut: ReturnType<typeof vi.fn>;
} {
  let callback:
    ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  const signOut = vi.fn(() => Promise.resolve({ error: null }));
  const client = {
    auth: {
      onAuthStateChange: vi.fn(
        (
          nextCallback: (
            event: AuthChangeEvent,
            session: Session | null,
          ) => void,
        ) => {
          callback = nextCallback;
          if (!options.sessionNeverResolves)
            queueMicrotask(() => callback?.("INITIAL_SESSION", authSession()));
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
      ),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      signOut,
    },
  } as unknown as SupabaseClient;
  return {
    client,
    emit(event, session) {
      if (callback === undefined) throw new Error("Auth listener is missing");
      callback(event, session);
    },
    signOut,
  };
}

function authSession(accessToken = "fictitious-token"): Session {
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1_800_000_000,
    refresh_token: "fictitious-refresh-token",
    user: { id: USER_ID, email: ACCOUNT_EMAIL },
  } as Session;
}

function sessionTransport() {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          profileId: PROFILE_ID,
          organizationId: ORGANIZATION_ID,
          role: "JEFE_EMPRESA",
          permissions: ["management.read"],
          expiresAt: "2027-01-15T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const USER_ID = "90000000-0000-4000-8000-000000000001";
const PROFILE_ID = "a1000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const ACCOUNT_EMAIL = "lucia@example.com";
