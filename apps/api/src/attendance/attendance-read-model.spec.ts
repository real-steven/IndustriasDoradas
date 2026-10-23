import { projectAttendanceHoursV1 } from "./attendance-read-model";
import type { AttendanceHistoryEvent } from "./attendance.contracts";

describe("attendance-hours-v1", () => {
  it("matches a manual Costa Rica calculation to the minute and clips the period", () => {
    const result = projectAttendanceHoursV1(
      [
        event("01", "CHECK_IN", "2026-10-19T12:00:00.000Z", 1),
        event("02", "CHECK_OUT", "2026-10-19T20:30:00.000Z", 2),
        event("03", "CHECK_IN", "2026-10-20T23:00:00.000Z", 3),
        event("04", "CHECK_OUT", "2026-10-21T13:00:00.000Z", 4),
      ],
      period("2026-10-19", "2026-10-20"),
      new Date("2026-10-22T12:00:00.000Z"),
    );

    expect(result.period).toMatchObject({
      fromUtc: "2026-10-19T06:00:00.000Z",
      toUtc: "2026-10-21T06:00:00.000Z",
    });
    expect(result.summary).toEqual({
      workerCount: 1,
      confirmedShiftCount: 2,
      openShiftCount: 0,
      incidentCount: 0,
      adjustmentCount: 0,
      totalConfirmedMinutes: 930,
    });
    expect(result.shifts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkInEventId: id("01"),
          startedOn: "2026-10-19",
          durationMinutes: 510,
          minutesInPeriod: 510,
        }),
        expect.objectContaining({
          checkInEventId: id("03"),
          startedOn: "2026-10-20",
          durationMinutes: 840,
          minutesInPeriod: 420,
        }),
      ]),
    );
  });

  it("keeps an open shift explicit instead of converting it to zero hours", () => {
    const result = projectAttendanceHoursV1(
      [event("01", "CHECK_IN", "2026-10-20T12:00:00.000Z", 1)],
      period("2026-10-20", "2026-10-20"),
      new Date("2026-10-20T22:00:00.000Z"),
    );

    expect(result.summary).toMatchObject({
      confirmedShiftCount: 0,
      openShiftCount: 1,
      totalConfirmedMinutes: 0,
      incidentCount: 1,
    });
    expect(result.shifts[0]).toMatchObject({
      status: "OPEN",
      durationMinutes: null,
      minutesInPeriod: null,
    });
    expect(result.incidents[0]?.type).toBe("OPEN_SHIFT_EXCEEDED");
  });

  it("projects the Sprint 6 overnight pilot after a forgotten check-out correction", () => {
    const checkIn = event("81", "CHECK_IN", "2026-10-20T23:30:00.000Z", 1);
    const correctedCheckOut = {
      ...event(
        "82",
        "ADJUSTED_CHECK_OUT",
        "2026-10-21T13:15:00.000Z",
        2,
        checkIn.id,
      ),
      recordedAtUtc: "2026-10-21T14:00:00.000Z",
      confirmedAtUtc: "2026-10-21T14:00:02.000Z",
      correctionReason: "El trabajador olvidó registrar la salida.",
    };

    const result = projectAttendanceHoursV1(
      [checkIn, correctedCheckOut],
      period("2026-10-20", "2026-10-21"),
      new Date("2026-10-21T14:01:00.000Z"),
    );

    expect(result.summary).toMatchObject({
      confirmedShiftCount: 1,
      openShiftCount: 0,
      incidentCount: 0,
      adjustmentCount: 1,
      totalConfirmedMinutes: 825,
    });
    expect(result.shifts[0]).toMatchObject({
      startedOn: "2026-10-20",
      status: "COMPLETED",
      durationMinutes: 825,
      minutesInPeriod: 825,
    });
    expect(result.adjustments[0]).toMatchObject({
      eventId: correctedCheckOut.id,
      correctedByDisplayName: "Jefe ficticio",
      correctionReason: "El trabajador olvidó registrar la salida.",
    });
    expect(result.coverage.excludedEvents).toBe(0);
  });

  it("uses the latest same-direction correction without hiding omission completion", () => {
    const originalIn = event("01", "CHECK_IN", "2026-10-20T12:00:00.000Z", 1);
    const correctedIn = event(
      "02",
      "ADJUSTED_CHECK_IN",
      "2026-10-20T13:00:00.000Z",
      2,
      originalIn.id,
    );
    const completedOmission = event(
      "03",
      "ADJUSTED_CHECK_OUT",
      "2026-10-20T21:00:00.000Z",
      3,
      correctedIn.id,
    );

    const result = projectAttendanceHoursV1(
      [originalIn, correctedIn, completedOmission],
      period("2026-10-20", "2026-10-20"),
      new Date("2026-10-21T03:00:00.000Z"),
    );

    expect(result.summary.totalConfirmedMinutes).toBe(480);
    expect(result.shifts[0]).toMatchObject({
      checkInEventId: correctedIn.id,
      checkOutEventId: completedOmission.id,
      durationMinutes: 480,
    });
    expect(result.adjustments).toEqual([
      expect.objectContaining({
        eventId: completedOmission.id,
        correctedByDisplayName: "Jefe ficticio",
        correctionReason: "Ajuste",
      }),
      expect.objectContaining({ eventId: correctedIn.id }),
    ]);
  });

  it("reports invalid sequences and excludes unconfirmed local events", () => {
    const pending = {
      ...event("04", "CHECK_OUT", "2026-10-20T14:00:00.000Z", 4),
      confirmedAtUtc: null,
      syncStatus: "PENDING" as const,
    };
    const result = projectAttendanceHoursV1(
      [
        event("01", "CHECK_IN", "2026-10-20T12:00:00.000Z", 1),
        event("02", "CHECK_IN", "2026-10-20T13:00:00.000Z", 2),
        event("03", "CHECK_OUT", "2026-10-20T20:00:00.000Z", 3),
        pending,
      ],
      period("2026-10-20", "2026-10-20"),
      new Date("2026-10-21T03:00:00.000Z"),
    );

    expect(result.incidents.map((item) => item.type)).toEqual([
      "DUPLICATE_CHECK_IN",
    ]);
    expect(result.coverage).toMatchObject({
      status: "COMPLETE",
      eventsRead: 4,
      confirmedEventsUsed: 3,
      excludedEvents: 1,
    });
  });
});

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "31000000-0000-4000-8000-000000000001";
const STATION_ID = "34000000-0000-4000-8000-000000000001";
const WORKER_ID = "b1000000-0000-4000-8000-000000000001";

function period(fromDate: string, toDate: string) {
  const next = new Date(`${toDate}T06:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    fromDate,
    toDate,
    fromUtc: `${fromDate}T06:00:00.000Z`,
    toUtc: next.toISOString(),
  };
}

function event(
  suffix: string,
  eventType: AttendanceHistoryEvent["eventType"],
  occurredAtUtc: string,
  sequence: number,
  relatedEventId: string | null = null,
): AttendanceHistoryEvent {
  return {
    id: id(suffix),
    organizationId: ORGANIZATION_ID,
    plantId: PLANT_ID,
    stationId: STATION_ID,
    workerId: WORKER_ID,
    workerName: "Operario ficticio",
    clientSequence: String(sequence),
    eventType,
    occurredAtUtc,
    recordedAtUtc: occurredAtUtc,
    confirmedAtUtc: occurredAtUtc,
    syncStatus: "SYNCHRONIZED",
    correctedByProfileId: eventType.startsWith("ADJUSTED_")
      ? "a1000000-0000-4000-8000-000000000001"
      : null,
    correctedByDisplayName: eventType.startsWith("ADJUSTED_")
      ? "Jefe ficticio"
      : null,
    correctionReason: eventType.startsWith("ADJUSTED_") ? "Ajuste" : null,
    relatedEventId,
  };
}

function id(suffix: string): string {
  return `61000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
}
