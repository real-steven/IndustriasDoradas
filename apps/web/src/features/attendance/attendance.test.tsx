import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";
import { AttendanceFeature } from "./attendance";
import { attendanceDateRange, parseAttendanceFilters } from "./attendance-data";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const WORKER_ID = "52000000-0000-4000-8000-000000000001";

describe("consulta gerencial de asistencia", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("calcula semanas de lunes a domingo en el calendario de Costa Rica", () => {
    const current = parseAttendanceFilters(
      new URLSearchParams("period=current"),
    );
    const previous = parseAttendanceFilters(
      new URLSearchParams("period=previous"),
    );
    const now = new Date("2026-10-20T18:00:00.000Z");

    expect(attendanceDateRange(current, now)).toEqual({
      fromDate: "2026-10-19",
      toDate: "2026-10-25",
    });
    expect(attendanceDateRange(previous, now)).toEqual({
      fromDate: "2026-10-12",
      toDate: "2026-10-18",
    });
  });

  it("conserva fecha y trabajador en la URL y muestra horas, pendientes y ajustes", async () => {
    const transport = vi.fn<typeof fetch>((input) => {
      const request = new URL(requestUrl(input), "http://localhost");
      if (request.pathname.endsWith("/workers"))
        return Promise.resolve(workerPage());
      if (request.pathname.endsWith("/management/attendance/hours"))
        return Promise.resolve(attendanceHours());
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderAttendance(
      `/gerencia/trabajadores?period=date&date=2026-10-20&worker=${WORKER_ID}`,
    );

    const summary = await screen.findByLabelText("Resumen de asistencia");
    expect(within(summary).getByText("8 h")).toBeInTheDocument();
    expect(screen.getByText(/Jornada abierta desde/u)).toBeInTheDocument();
    expect(screen.getByText("Salida olvidada al terminar")).toBeInTheDocument();
    expect(
      screen.getByText(/Realizado por Jefa de planta 1/u),
    ).toBeInTheDocument();
    expect(screen.getByText("No suman horas confirmadas")).toBeInTheDocument();

    const hoursCall = transport.mock.calls.find(([input]) =>
      requestUrl(input).includes("/management/attendance/hours"),
    );
    const request = new URL(requestUrl(hoursCall?.[0]), "http://localhost");
    expect(request.searchParams.get("fromDate")).toBe("2026-10-20");
    expect(request.searchParams.get("toDate")).toBe("2026-10-20");
    expect(request.searchParams.get("workerId")).toBe(WORKER_ID);
  });
});

function renderAttendance(path: string): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: ["attendance.read"],
      expiresAt: "2026-10-21T01:00:00Z",
    },
    foundSession: null,
    loading: false,
    error: null,
    continueFoundSession: vi.fn(),
    signIn: vi.fn(),
    recover: vi.fn(),
    signOut: vi.fn(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <AuthContext.Provider value={auth}>
      <QueryProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <AttendanceFeature />
        </MemoryRouter>
      </QueryProvider>
    </AuthContext.Provider>,
  );
}

function workerPage(): Response {
  return json({
    items: [
      {
        id: WORKER_ID,
        organizationId: ORGANIZATION_ID,
        plantId: "31000000-0000-4000-8000-000000000001",
        sourceRequestId: "request-1",
        userProfileId: null,
        category: "OPERARIO",
        name: "Operario Uno",
        email: null,
        phone: null,
        status: "ACTIVO",
        statusChangedAt: "2026-10-01T12:00:00.000Z",
        isActive: true,
        deactivatedAt: null,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  });
}

function attendanceHours(): Response {
  return json({
    version: "attendance-hours-v1",
    timezone: "America/Costa_Rica",
    period: {
      fromDate: "2026-10-20",
      toDate: "2026-10-20",
      fromUtc: "2026-10-20T06:00:00.000Z",
      toUtc: "2026-10-21T06:00:00.000Z",
    },
    summary: {
      workerCount: 1,
      confirmedShiftCount: 1,
      openShiftCount: 1,
      incidentCount: 1,
      adjustmentCount: 1,
      totalConfirmedMinutes: 480,
    },
    workers: [
      {
        workerId: WORKER_ID,
        workerName: "Operario Uno",
        confirmedMinutes: 480,
        completedShiftCount: 1,
        openShiftCount: 1,
        incidentCount: 1,
      },
    ],
    shifts: [
      {
        workerId: WORKER_ID,
        workerName: "Operario Uno",
        plantId: "31000000-0000-4000-8000-000000000001",
        status: "OPEN",
        startedOn: "2026-10-20",
        checkInEventId: "event-open",
        checkInAtUtc: "2026-10-20T13:00:00.000Z",
        checkOutEventId: null,
        checkOutAtUtc: null,
        durationMinutes: null,
        minutesInPeriod: null,
      },
      {
        workerId: WORKER_ID,
        workerName: "Operario Uno",
        plantId: "31000000-0000-4000-8000-000000000001",
        status: "COMPLETED",
        startedOn: "2026-10-20",
        checkInEventId: "event-in",
        checkInAtUtc: "2026-10-20T13:00:00.000Z",
        checkOutEventId: "event-out",
        checkOutAtUtc: "2026-10-20T21:00:00.000Z",
        durationMinutes: 480,
        minutesInPeriod: 480,
      },
    ],
    incidents: [
      {
        type: "OPEN_SHIFT_EXCEEDED",
        workerId: WORKER_ID,
        workerName: "Operario Uno",
        eventId: "event-open",
        detectedAtUtc: "2026-10-20T22:00:00.000Z",
        description: "La jornada supera ocho horas y continúa abierta.",
      },
    ],
    adjustments: [
      {
        eventId: "event-adjusted",
        eventType: "ADJUSTED_CHECK_OUT",
        workerId: WORKER_ID,
        workerName: "Operario Uno",
        plantId: "31000000-0000-4000-8000-000000000001",
        occurredAtUtc: "2026-10-20T21:00:00.000Z",
        recordedAtUtc: "2026-10-20T22:10:00.000Z",
        confirmedAtUtc: "2026-10-20T22:10:02.000Z",
        correctedByProfileId: "a1000000-0000-4000-8000-000000000002",
        correctedByDisplayName: "Jefa de planta 1",
        correctionReason: "Salida olvidada al terminar",
        relatedEventId: "event-out",
      },
    ],
    coverage: {
      status: "COMPLETE",
      eventsRead: 4,
      confirmedEventsUsed: 4,
      excludedEvents: 1,
      eventsInPeriod: 4,
      firstEventAtUtc: "2026-10-20T13:00:00.000Z",
      lastEventAtUtc: "2026-10-20T22:10:00.000Z",
    },
    freshness: {
      generatedAtUtc: "2026-10-20T22:11:00.000Z",
      lastConfirmedAtUtc: "2026-10-20T22:10:02.000Z",
      lagSeconds: 58,
    },
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (input === undefined) throw new Error("Expected a request");
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
