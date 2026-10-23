import type {
  AttendanceHistoryEvent,
  AttendanceHoursIncident,
  AttendanceHoursAdjustment,
  AttendanceHoursReadModel,
  AttendanceHoursShift,
  AttendanceIncidentType,
  AttendanceWorkerHours,
} from "./attendance.contracts";

const EXPECTED_SHIFT_MILLISECONDS = 8 * 60 * 60 * 1_000;
const COSTA_RICA_OFFSET_MILLISECONDS = 6 * 60 * 60 * 1_000;

interface PeriodInput {
  fromDate: string;
  toDate: string;
  fromUtc: string;
  toUtc: string;
}

interface OpenShift {
  checkIn: AttendanceHistoryEvent;
}

export function projectAttendanceHoursV1(
  source: readonly AttendanceHistoryEvent[],
  period: PeriodInput,
  generatedAt: Date,
): AttendanceHoursReadModel {
  const generatedAtUtc = generatedAt.toISOString();
  const fromMilliseconds = Date.parse(period.fromUtc);
  const toMilliseconds = Date.parse(period.toUtc);
  const asOfMilliseconds = Math.min(generatedAt.getTime(), toMilliseconds);
  const confirmed = source.filter(isConfirmed);
  const superseded = findSupersededEventIds(confirmed);
  const valid = confirmed.filter((event) => !superseded.has(event.id));
  const workers = new Map<string, AttendanceHistoryEvent[]>();

  for (const event of valid) {
    const workerEvents = workers.get(event.workerId) ?? [];
    workerEvents.push(event);
    workers.set(event.workerId, workerEvents);
  }

  const shifts: AttendanceHoursShift[] = [];
  const incidents: AttendanceHoursIncident[] = [];
  for (const workerEvents of workers.values()) {
    projectWorker(
      workerEvents,
      fromMilliseconds,
      toMilliseconds,
      asOfMilliseconds,
      shifts,
      incidents,
    );
  }

  shifts.sort(
    (left, right) =>
      right.checkInAtUtc.localeCompare(left.checkInAtUtc) ||
      left.workerName.localeCompare(right.workerName) ||
      left.checkInEventId.localeCompare(right.checkInEventId),
  );
  incidents.sort(
    (left, right) =>
      right.detectedAtUtc.localeCompare(left.detectedAtUtc) ||
      left.workerName.localeCompare(right.workerName) ||
      left.eventId.localeCompare(right.eventId),
  );

  const workerSummaries = summarizeWorkers(shifts, incidents);
  const adjustments = confirmed
    .filter(isAdjustment)
    .filter((event) => {
      const occurrence = Date.parse(event.occurredAtUtc);
      return occurrence >= fromMilliseconds && occurrence < toMilliseconds;
    })
    .map(adjustment)
    .sort(
      (left, right) =>
        right.recordedAtUtc.localeCompare(left.recordedAtUtc) ||
        left.eventId.localeCompare(right.eventId),
    );
  const confirmedTimestamps = confirmed
    .map((event) => event.confirmedAtUtc)
    .filter((value): value is string => value !== null)
    .sort();
  const occurredTimestamps = valid.map((event) => event.occurredAtUtc).sort();
  const lastConfirmedAtUtc = confirmedTimestamps.at(-1) ?? null;
  const totalConfirmedMinutes = roundMinutes(
    shifts.reduce((total, shift) => total + (shift.minutesInPeriod ?? 0), 0),
  );

  return {
    version: "attendance-hours-v1",
    timezone: "America/Costa_Rica",
    period,
    summary: {
      workerCount: workerSummaries.length,
      confirmedShiftCount: shifts.filter(
        (shift) => shift.status === "COMPLETED",
      ).length,
      openShiftCount: shifts.filter((shift) => shift.status === "OPEN").length,
      incidentCount: incidents.length,
      adjustmentCount: adjustments.length,
      totalConfirmedMinutes,
    },
    workers: workerSummaries,
    shifts,
    incidents,
    adjustments,
    coverage: {
      status: "COMPLETE",
      eventsRead: source.length,
      confirmedEventsUsed: valid.length,
      excludedEvents: source.length - valid.length,
      eventsInPeriod: valid.filter((event) => {
        const occurrence = Date.parse(event.occurredAtUtc);
        return occurrence >= fromMilliseconds && occurrence < toMilliseconds;
      }).length,
      firstEventAtUtc: occurredTimestamps[0] ?? null,
      lastEventAtUtc: occurredTimestamps.at(-1) ?? null,
    },
    freshness: {
      generatedAtUtc,
      lastConfirmedAtUtc,
      lagSeconds:
        lastConfirmedAtUtc === null
          ? null
          : Math.max(
              0,
              Math.floor(
                (generatedAt.getTime() - Date.parse(lastConfirmedAtUtc)) /
                  1_000,
              ),
            ),
    },
  };
}

function projectWorker(
  workerEvents: AttendanceHistoryEvent[],
  fromMilliseconds: number,
  toMilliseconds: number,
  asOfMilliseconds: number,
  shifts: AttendanceHoursShift[],
  incidents: AttendanceHoursIncident[],
): void {
  workerEvents.sort(
    (left, right) =>
      Date.parse(left.occurredAtUtc) - Date.parse(right.occurredAtUtc) ||
      compareIntegerStrings(left.clientSequence, right.clientSequence) ||
      left.id.localeCompare(right.id),
  );
  let open: OpenShift | null = null;

  for (const event of workerEvents) {
    const occurrence = Date.parse(event.occurredAtUtc);
    if (isCheckIn(event)) {
      if (open === null) {
        open = { checkIn: event };
      } else if (
        occurrence >= fromMilliseconds &&
        occurrence < toMilliseconds
      ) {
        incidents.push(
          incident(
            "DUPLICATE_CHECK_IN",
            event,
            event.recordedAtUtc,
            "Se registró una segunda entrada mientras existía una jornada abierta.",
          ),
        );
      }
      continue;
    }

    if (open === null) {
      if (occurrence >= fromMilliseconds && occurrence < toMilliseconds) {
        incidents.push(
          incident(
            "CHECK_OUT_WITHOUT_CHECK_IN",
            event,
            event.recordedAtUtc,
            "Se registró una salida sin una entrada abierta.",
          ),
        );
      }
      continue;
    }

    const completed = shift(
      open.checkIn,
      event,
      fromMilliseconds,
      toMilliseconds,
    );
    if (completed !== null) shifts.push(completed);
    open = null;
  }

  if (open === null) return;
  const openedAt = Date.parse(open.checkIn.occurredAtUtc);
  if (openedAt < toMilliseconds) {
    shifts.push(openShift(open.checkIn));
  }
  if (
    openedAt < toMilliseconds &&
    asOfMilliseconds >= fromMilliseconds &&
    asOfMilliseconds - openedAt > EXPECTED_SHIFT_MILLISECONDS
  ) {
    incidents.push(
      incident(
        "OPEN_SHIFT_EXCEEDED",
        open.checkIn,
        new Date(asOfMilliseconds).toISOString(),
        "La jornada continúa abierta después de ocho horas.",
      ),
    );
  }
}

function shift(
  checkIn: AttendanceHistoryEvent,
  checkOut: AttendanceHistoryEvent,
  fromMilliseconds: number,
  toMilliseconds: number,
): AttendanceHoursShift | null {
  const checkInMilliseconds = Date.parse(checkIn.occurredAtUtc);
  const checkOutMilliseconds = Date.parse(checkOut.occurredAtUtc);
  if (
    checkOutMilliseconds <= fromMilliseconds ||
    checkInMilliseconds >= toMilliseconds
  ) {
    return null;
  }
  const overlapStart = Math.max(checkInMilliseconds, fromMilliseconds);
  const overlapEnd = Math.min(checkOutMilliseconds, toMilliseconds);
  return {
    workerId: checkIn.workerId,
    workerName: checkIn.workerName,
    plantId: checkIn.plantId,
    status: "COMPLETED",
    startedOn: costaRicaDate(checkInMilliseconds),
    checkInEventId: checkIn.id,
    checkInAtUtc: checkIn.occurredAtUtc,
    checkOutEventId: checkOut.id,
    checkOutAtUtc: checkOut.occurredAtUtc,
    durationMinutes: roundMinutes(
      (checkOutMilliseconds - checkInMilliseconds) / 60_000,
    ),
    minutesInPeriod: roundMinutes((overlapEnd - overlapStart) / 60_000),
  };
}

function openShift(checkIn: AttendanceHistoryEvent): AttendanceHoursShift {
  return {
    workerId: checkIn.workerId,
    workerName: checkIn.workerName,
    plantId: checkIn.plantId,
    status: "OPEN",
    startedOn: costaRicaDate(Date.parse(checkIn.occurredAtUtc)),
    checkInEventId: checkIn.id,
    checkInAtUtc: checkIn.occurredAtUtc,
    checkOutEventId: null,
    checkOutAtUtc: null,
    durationMinutes: null,
    minutesInPeriod: null,
  };
}

function summarizeWorkers(
  shifts: readonly AttendanceHoursShift[],
  incidents: readonly AttendanceHoursIncident[],
): AttendanceWorkerHours[] {
  const summary = new Map<string, AttendanceWorkerHours>();
  const ensure = (
    workerId: string,
    workerName: string,
  ): AttendanceWorkerHours => {
    const existing = summary.get(workerId);
    if (existing !== undefined) return existing;
    const created: AttendanceWorkerHours = {
      workerId,
      workerName,
      confirmedMinutes: 0,
      completedShiftCount: 0,
      openShiftCount: 0,
      incidentCount: 0,
    };
    summary.set(workerId, created);
    return created;
  };

  for (const item of shifts) {
    const worker = ensure(item.workerId, item.workerName);
    if (item.status === "COMPLETED") {
      worker.completedShiftCount += 1;
      worker.confirmedMinutes = roundMinutes(
        worker.confirmedMinutes + (item.minutesInPeriod ?? 0),
      );
    } else {
      worker.openShiftCount += 1;
    }
  }
  for (const item of incidents) {
    ensure(item.workerId, item.workerName).incidentCount += 1;
  }
  return [...summary.values()].sort(
    (left, right) =>
      left.workerName.localeCompare(right.workerName) ||
      left.workerId.localeCompare(right.workerId),
  );
}

function findSupersededEventIds(
  events: readonly AttendanceHistoryEvent[],
): Set<string> {
  const byId = new Map(events.map((event) => [event.id, event]));
  const superseded = new Set<string>();
  for (const event of events) {
    if (
      !event.eventType.startsWith("ADJUSTED_") ||
      event.relatedEventId === null
    )
      continue;
    const related = byId.get(event.relatedEventId);
    if (related !== undefined && isCheckIn(related) === isCheckIn(event)) {
      superseded.add(related.id);
    }
  }
  return superseded;
}

function isConfirmed(event: AttendanceHistoryEvent): boolean {
  return event.syncStatus === "SYNCHRONIZED" && event.confirmedAtUtc !== null;
}

function isCheckIn(event: AttendanceHistoryEvent): boolean {
  return (
    event.eventType === "CHECK_IN" || event.eventType === "ADJUSTED_CHECK_IN"
  );
}

function isAdjustment(event: AttendanceHistoryEvent): boolean {
  return event.eventType.startsWith("ADJUSTED_");
}

function adjustment(event: AttendanceHistoryEvent): AttendanceHoursAdjustment {
  if (
    (event.eventType !== "ADJUSTED_CHECK_IN" &&
      event.eventType !== "ADJUSTED_CHECK_OUT") ||
    event.confirmedAtUtc === null ||
    event.correctedByProfileId === null ||
    event.correctedByDisplayName === null ||
    event.correctionReason === null ||
    event.relatedEventId === null
  ) {
    throw new Error("A confirmed attendance adjustment is incomplete");
  }
  return {
    eventId: event.id,
    eventType: event.eventType,
    workerId: event.workerId,
    workerName: event.workerName,
    plantId: event.plantId,
    occurredAtUtc: event.occurredAtUtc,
    recordedAtUtc: event.recordedAtUtc,
    confirmedAtUtc: event.confirmedAtUtc,
    correctedByProfileId: event.correctedByProfileId,
    correctedByDisplayName: event.correctedByDisplayName,
    correctionReason: event.correctionReason,
    relatedEventId: event.relatedEventId,
  };
}

function incident(
  type: AttendanceIncidentType,
  event: AttendanceHistoryEvent,
  detectedAtUtc: string,
  description: string,
): AttendanceHoursIncident {
  return {
    type,
    workerId: event.workerId,
    workerName: event.workerName,
    eventId: event.id,
    detectedAtUtc,
    description,
  };
}

function costaRicaDate(utcMilliseconds: number): string {
  return new Date(utcMilliseconds - COSTA_RICA_OFFSET_MILLISECONDS)
    .toISOString()
    .slice(0, 10);
}

function compareIntegerStrings(left: string, right: string): number {
  return BigInt(left) < BigInt(right)
    ? -1
    : BigInt(left) > BigInt(right)
      ? 1
      : 0;
}

function roundMinutes(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
