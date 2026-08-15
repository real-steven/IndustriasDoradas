import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/app";
import { QueryProvider } from "../../app/query-provider";

describe("StatusPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an accessible loading state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderStatusPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Comprobando conexión",
    );
  });

  it("shows the API response when health succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createHealthResponse()));

    renderStatusPage();

    expect(await screen.findByText("API disponible")).toBeInTheDocument();
    expect(screen.getByText("industrias-doradas-api")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Actualizar estado" }),
    ).toBeEnabled();
  });

  it("shows an error and recovers when the user retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(createHealthResponse());
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderStatusPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "API no disponible",
    );

    await user.click(
      screen.getByRole("button", { name: "Reintentar conexión" }),
    );

    expect(await screen.findByText("API disponible")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function renderStatusPage(): void {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  });

  render(
    <QueryProvider client={client}>
      <MemoryRouter initialEntries={["/estado"]}>
        <App />
      </MemoryRouter>
    </QueryProvider>,
  );
}

function createHealthResponse(): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "industrias-doradas-api",
      timestamp: "2026-08-13T12:00:00.000Z",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
