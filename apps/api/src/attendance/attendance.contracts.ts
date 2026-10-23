export const ATTENDANCE_QUERY_REPOSITORY = Symbol(
  "ATTENDANCE_QUERY_REPOSITORY",
);

export type AttendanceEventType =
  "CHECK_IN" | "CHECK_OUT" | "ADJUSTED_CHECK_IN" | "ADJUSTED_CHECK_OUT";

export type AttendanceSyncStatus =
  "PENDING" | "SYNCHRONIZED" | "REQUIRES_ATTENTION";

export interface AttendanceHistoryEvent {
  id: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  workerId: string;
  workerName: string;
  clientSequence: string;
  eventType: AttendanceEventType;
  occurredAtUtc: string;
  recordedAtUtc: string;
  confirmedAtUtc: string | null;
  syncStatus: AttendanceSyncStatus;
  correctedByProfileId: string | null;
  correctedByDisplayName: string | null;
  correctionReason: string | null;
  relatedEventId: string | null;
}

export interface AttendanceHistoryQuery {
  plantId?: string;
  workerId?: string;
}

export interface AttendanceQueryRepository {
  listHistory(
    organizationId: string,
    query: AttendanceHistoryQuery,
  ): Promise<readonly AttendanceHistoryEvent[]>;
}

export interface AttendanceHoursFilters {
  fromDate: string;
  toDate: string;
  plantId?: string;
  workerId?: string;
}

export type AttendanceShiftStatus = "COMPLETED" | "OPEN";
export type AttendanceIncidentType =
  "DUPLICATE_CHECK_IN" | "CHECK_OUT_WITHOUT_CHECK_IN" | "OPEN_SHIFT_EXCEEDED";

export interface AttendanceHoursShift {
  workerId: string;
  workerName: string;
  plantId: string;
  status: AttendanceShiftStatus;
  startedOn: string;
  checkInEventId: string;
  checkInAtUtc: string;
  checkOutEventId: string | null;
  checkOutAtUtc: string | null;
  durationMinutes: number | null;
  minutesInPeriod: number | null;
}

export interface AttendanceHoursIncident {
  type: AttendanceIncidentType;
  workerId: string;
  workerName: string;
  eventId: string;
  detectedAtUtc: string;
  description: string;
}

export interface AttendanceWorkerHours {
  workerId: string;
  workerName: string;
  confirmedMinutes: number;
  completedShiftCount: number;
  openShiftCount: number;
  incidentCount: number;
}

export interface AttendanceHoursAdjustment {
  eventId: string;
  eventType: "ADJUSTED_CHECK_IN" | "ADJUSTED_CHECK_OUT";
  workerId: string;
  workerName: string;
  plantId: string;
  occurredAtUtc: string;
  recordedAtUtc: string;
  confirmedAtUtc: string;
  correctedByProfileId: string;
  correctedByDisplayName: string;
  correctionReason: string;
  relatedEventId: string;
}

export interface AttendanceHoursReadModel {
  version: "attendance-hours-v1";
  timezone: "America/Costa_Rica";
  period: {
    fromDate: string;
    toDate: string;
    fromUtc: string;
    toUtc: string;
  };
  summary: {
    workerCount: number;
    confirmedShiftCount: number;
    openShiftCount: number;
    incidentCount: number;
    adjustmentCount: number;
    totalConfirmedMinutes: number;
  };
  workers: AttendanceWorkerHours[];
  shifts: AttendanceHoursShift[];
  incidents: AttendanceHoursIncident[];
  adjustments: AttendanceHoursAdjustment[];
  coverage: {
    status: "COMPLETE";
    eventsRead: number;
    confirmedEventsUsed: number;
    excludedEvents: number;
    eventsInPeriod: number;
    firstEventAtUtc: string | null;
    lastEventAtUtc: string | null;
  };
  freshness: {
    generatedAtUtc: string;
    lastConfirmedAtUtc: string | null;
    lagSeconds: number | null;
  };
}
