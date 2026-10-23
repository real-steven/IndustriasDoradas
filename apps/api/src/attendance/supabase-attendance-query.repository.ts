import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  AttendanceEventType,
  AttendanceHistoryEvent,
  AttendanceHistoryQuery,
  AttendanceQueryRepository,
  AttendanceSyncStatus,
} from "./attendance.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { EnvironmentVariables } from "../config/environment";

type Row = Record<string, unknown>;

const PAGE_SIZE = 1_000;
const MAX_EVENTS = 50_000;
const EVENT_SELECT = [
  "id",
  "organization_id",
  "plant_id",
  "station_id",
  "worker_id",
  "client_sequence",
  "event_type",
  "occurred_at_utc",
  "recorded_at_utc",
  "confirmed_at_utc",
  "sync_status",
  "corrected_by_profile_id",
  "correction_reason",
  "related_event_id",
].join(",");

@Injectable()
export class SupabaseAttendanceQueryRepository implements AttendanceQueryRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async listHistory(
    organizationId: string,
    query: AttendanceHistoryQuery,
  ): Promise<readonly AttendanceHistoryEvent[]> {
    const rows: Row[] = [];
    for (let offset = 0; offset < MAX_EVENTS; offset += PAGE_SIZE) {
      const parameters = new URLSearchParams({
        organization_id: `eq.${organizationId}`,
        order: "occurred_at_utc.asc,client_sequence.asc,id.asc",
        limit: String(PAGE_SIZE),
        offset: String(offset),
        select: EVENT_SELECT,
      });
      if (query.plantId !== undefined)
        parameters.set("plant_id", `eq.${query.plantId}`);
      if (query.workerId !== undefined)
        parameters.set("worker_id", `eq.${query.workerId}`);
      const response = await this.request(`attendance_events?${parameters}`);
      const page = (await response.json()) as Row[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      if (offset + PAGE_SIZE >= MAX_EVENTS) {
        throw new SupabaseDataError(
          "ATTENDANCE_HISTORY_LIMIT_EXCEEDED",
          "attendance_events",
        );
      }
    }

    const [workerNames, profileNames] = await Promise.all([
      this.names("workers", "name", organizationId, [
        ...new Set(rows.map((row) => this.string(row, "worker_id"))),
      ]),
      this.names("user_profiles", "display_name", organizationId, [
        ...new Set(
          rows
            .map((row) => this.nullableString(row, "corrected_by_profile_id"))
            .filter((value): value is string => value !== null),
        ),
      ]),
    ]);
    return rows.map((row) => this.event(row, workerNames, profileNames));
  }

  private async names(
    resource: "workers" | "user_profiles",
    nameColumn: "name" | "display_name",
    organizationId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `in.(${ids.join(",")})`,
      select: `id,${nameColumn}`,
    });
    const response = await this.request(`${resource}?${parameters}`);
    const rows = (await response.json()) as Row[];
    return new Map(
      rows.map((row) => [this.string(row, "id"), this.string(row, nameColumn)]),
    );
  }

  private async request(path: string): Promise<Response> {
    const response = await fetch(`${this.restUrl}/${path}`, {
      headers: {
        Accept: "application/json",
        "Accept-Profile": "app",
        apikey: this.secret,
        Authorization: `Bearer ${this.secret}`,
      },
    });
    if (!response.ok) {
      throw new SupabaseDataError(
        `HTTP_${response.status}`,
        path.split("?")[0] ?? path,
      );
    }
    return response;
  }

  private event(
    row: Row,
    workerNames: ReadonlyMap<string, string>,
    profileNames: ReadonlyMap<string, string>,
  ): AttendanceHistoryEvent {
    const workerId = this.string(row, "worker_id");
    const workerName = workerNames.get(workerId);
    if (workerName === undefined)
      throw new SupabaseDataError("INVALID_ROW", "worker_id");
    const correctedByProfileId = this.nullableString(
      row,
      "corrected_by_profile_id",
    );
    const correctedByDisplayName =
      correctedByProfileId === null
        ? null
        : profileNames.get(correctedByProfileId);
    if (correctedByProfileId !== null && correctedByDisplayName === undefined)
      throw new SupabaseDataError("INVALID_ROW", "corrected_by_profile_id");
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      stationId: this.string(row, "station_id"),
      workerId,
      workerName,
      clientSequence: this.integerString(row, "client_sequence"),
      eventType: this.eventType(row, "event_type"),
      occurredAtUtc: this.string(row, "occurred_at_utc"),
      recordedAtUtc: this.string(row, "recorded_at_utc"),
      confirmedAtUtc: this.nullableString(row, "confirmed_at_utc"),
      syncStatus: this.syncStatus(row, "sync_status"),
      correctedByProfileId,
      correctedByDisplayName: correctedByDisplayName ?? null,
      correctionReason: this.nullableString(row, "correction_reason"),
      relatedEventId: this.nullableString(row, "related_event_id"),
    };
  }

  private string(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private nullableString(row: Row, key: string): string | null {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private integerString(row: Row, key: string): string {
    const value = row[key];
    if (typeof value === "number" && Number.isSafeInteger(value))
      return String(value);
    if (typeof value === "string" && /^\d+$/u.test(value)) return value;
    throw new SupabaseDataError("INVALID_ROW", key);
  }

  private eventType(row: Row, key: string): AttendanceEventType {
    const value = this.string(row, key);
    if (
      value !== "CHECK_IN" &&
      value !== "CHECK_OUT" &&
      value !== "ADJUSTED_CHECK_IN" &&
      value !== "ADJUSTED_CHECK_OUT"
    ) {
      throw new SupabaseDataError("INVALID_ROW", key);
    }
    return value;
  }

  private syncStatus(row: Row, key: string): AttendanceSyncStatus {
    const value = this.string(row, key);
    if (
      value !== "PENDING" &&
      value !== "SYNCHRONIZED" &&
      value !== "REQUIRES_ATTENTION"
    ) {
      throw new SupabaseDataError("INVALID_ROW", key);
    }
    return value;
  }
}
