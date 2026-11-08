import type { Session } from "@supabase/supabase-js";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QueryProvider } from "../../app/query-provider";
import { AuthContext, type AuthState } from "../../auth/auth-context";
import { AttendanceFeature } from "./attendance";
import { currentPayrollWeek } from "./payroll-data";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const WORKER_ID = "52000000-0000-4000-8000-000000000001";

describe("expediente y pre-nómina por trabajador", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("calcula la semana de lunes a domingo en Costa Rica", () => {
    expect(currentPayrollWeek(new Date("2026-10-20T18:00:00.000Z"))).toEqual({
      fromDate: "2026-10-19",
      toDate: "2026-10-25",
    });
  });

  it("abre el empleado en un modal y muestra bruto, autorizado y comentarios", async () => {
    const transport = vi.fn<typeof fetch>((input) => {
      const request = new URL(requestUrl(input), "http://localhost");
      if (request.pathname.endsWith("/payroll/workers"))
        return Promise.resolve(json([workerProfile()]));
      if (request.pathname.endsWith("/management/attendance/payroll"))
        return Promise.resolve(json(payrollReport()));
      throw new Error(`Unexpected request ${request.pathname}`);
    });
    vi.stubGlobal("fetch", transport);

    renderAttendance("/gerencia/trabajadores");

    await screen.findByText("Operario Uno");
    fireEvent.click(screen.getByRole("button", { name: /Operario Uno/u }));

    expect(await screen.findByText("8 h")).toBeInTheDocument();
    expect(
      screen.getByText(
        (content) => content.includes("16") && content.includes("500"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Notas" }));
    expect(
      await screen.findByText("Presentó comprobante del hospital."),
    ).toBeInTheDocument();

    const payrollCall = transport.mock.calls.find(([input]) =>
      requestUrl(input).endsWith("/management/attendance/payroll")
        ? true
        : requestUrl(input).includes("/management/attendance/payroll?"),
    );
    const request = new URL(requestUrl(payrollCall?.[0]), "http://localhost");
    expect(request.searchParams.get("workerId")).toBe(WORKER_ID);
    expect(request.searchParams.get("fromDate")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/u,
    );
    expect(request.searchParams.get("toDate")).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});

function renderAttendance(path: string): void {
  const auth: AuthState = {
    session: { access_token: "fictitious-token" } as Session,
    profile: {
      profileId: "a1000000-0000-4000-8000-000000000001",
      organizationId: ORGANIZATION_ID,
      role: "JEFE_EMPRESA",
      permissions: ["attendance.read", "payroll.read", "payroll.manage"],
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

function workerProfile() {
  return {
    id: WORKER_ID,
    organizationId: ORGANIZATION_ID,
    plantId: "31000000-0000-4000-8000-000000000001",
    name: "Operario Uno",
    identityNumber: "1-1111-1111",
    category: "OPERARIO",
    status: "ACTIVO",
    isActive: true,
    currentRateId: "rate-1",
    currentHourlyRateCrc: 2000,
    nightMultiplier: 1.5,
    rateEffectiveFromUtc: "2026-10-01T06:00:00.000Z",
  };
}

function payrollReport() {
  const worker = workerProfile();
  return {
    version: "payroll-preparation-v1",
    timezone: "America/Costa_Rica",
    currencyCode: "CRC",
    legalScope: "GROSS_ESTIMATE_WITHOUT_LEGAL_DEDUCTIONS",
    period: { fromDate: "2026-10-19", toDate: "2026-10-25" },
    generatedAtUtc: "2026-10-25T18:00:00.000Z",
    workers: [
      {
        worker,
        confirmedMinutes: 480,
        completedShiftCount: 1,
        openShiftCount: 0,
        incidentCount: 0,
        baseAmountCrc: 16000,
        adjustmentAmountCrc: 0,
        calculatedGrossAmountCrc: 16000,
        authorizedGrossAmountCrc: 16500,
        grossDifferenceCrc: 500,
        estimatedGrossAmountCrc: 16500,
        missingRateMinutes: 0,
        grossAuthorization: {
          id: "authorization-1",
          fromDate: "2026-10-19",
          toDate: "2026-10-25",
          authorizedAmountCrc: 16500,
          reason: "Monto aprobado por gerencia",
          recordedByName: "Lucía",
          recordedAtUtc: "2026-10-25T18:00:00.000Z",
        },
        grossAuthorizations: [
          {
            id: "authorization-1",
            fromDate: "2026-10-19",
            toDate: "2026-10-25",
            authorizedAmountCrc: 16500,
            reason: "Monto aprobado por gerencia",
            recordedByName: "Lucía",
            recordedAtUtc: "2026-10-25T18:00:00.000Z",
          },
        ],
        adjustments: [
          {
            id: "adjustment-1",
            adjustmentDate: "2026-10-20",
            adjustmentType: "OVERTIME_HOURS",
            minutes: 60,
            amountCrc: null,
            note: "Presentó comprobante del hospital.",
            recordedAtUtc: "2026-10-20T20:00:00.000Z",
            calculatedAmountCrc: 0,
          },
        ],
        rates: [
          {
            id: "rate-1",
            regularHourlyRateCrc: 2000,
            nightMultiplier: 1.5,
            effectiveFromUtc: "2026-10-01T06:00:00.000Z",
            reason: "Tarifa inicial",
            createdAtUtc: "2026-10-01T06:00:00.000Z",
          },
        ],
        shifts: [],
      },
    ],
    summary: {
      workerCount: 1,
      workersReady: 1,
      workersMissingRate: 0,
      confirmedMinutes: 480,
      estimatedGrossAmountCrc: 16500,
    },
  };
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
