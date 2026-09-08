import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

import type {
  PinAttemptResult,
  StationRepository,
  StationSnapshot,
} from "./station.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { EnvironmentVariables } from "../config/environment";

type Scalar = string | number | boolean | null;
type Row = Record<string, Scalar>;
interface ErrorBody {
  code?: unknown;
}

@Injectable()
export class SupabaseStationRepository implements StationRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async getSnapshot(input: {
    organizationId: string;
    stationId: string;
    profileId: string;
    observedAt: string;
  }): Promise<StationSnapshot | null> {
    const authorization = await this.one(
      "station_user_authorizations",
      new URLSearchParams({
        organization_id: `eq.${input.organizationId}`,
        station_id: `eq.${input.stationId}`,
        user_profile_id: `eq.${input.profileId}`,
        is_active: "eq.true",
        limit: "1",
        select: "plant_id",
      }),
    );
    if (authorization === null) return null;
    const station = await this.one(
      "stations",
      new URLSearchParams({
        organization_id: `eq.${input.organizationId}`,
        id: `eq.${input.stationId}`,
        is_active: "eq.true",
        limit: "1",
        select: "id,plant_id,name,permission_version",
      }),
    );
    const credential = await this.one(
      "user_pin_credentials",
      new URLSearchParams({
        organization_id: `eq.${input.organizationId}`,
        user_profile_id: `eq.${input.profileId}`,
        limit: "1",
        select: "verifier",
      }),
    );
    if (station === null || credential === null) return null;
    const observed = new Date(input.observedAt);
    return {
      stationId: this.string(station, "id"),
      plantId: this.string(station, "plant_id"),
      organizationId: input.organizationId,
      stationName: this.string(station, "name"),
      permissionVersion: this.number(station, "permission_version"),
      pinVerifier: this.string(credential, "verifier"),
      validatedAt: observed.toISOString(),
      offlineValidUntil: new Date(
        observed.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }

  async recordPinAttempt(input: {
    organizationId: string;
    profileId: string;
    succeeded: boolean;
    observedAt: string;
  }): Promise<PinAttemptResult> {
    const response = await this.request("rpc/record_pin_attempt", {
      method: "POST",
      body: JSON.stringify({
        target_organization_id: input.organizationId,
        target_profile_id: input.profileId,
        verification_succeeded: input.succeeded,
        observed_at: input.observedAt,
      }),
    });
    return (await response.json()) as PinAttemptResult;
  }

  async setPinVerifier(input: {
    organizationId: string;
    profileId: string;
    verifier: string;
    observedAt: string;
  }): Promise<void> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${input.organizationId}`,
      user_profile_id: `eq.${input.profileId}`,
    });
    const response = await this.request(`user_pin_credentials?${parameters}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        verifier: input.verifier,
        verifier_version: 1,
        reset_required: false,
        second_block_requires_reset: false,
        failed_attempt_count: 0,
        attempt_window_started_at: null,
        blocked_until: null,
        changed_at: input.observedAt,
        updated_at: input.observedAt,
      }),
    });
    const rows = (await response.json()) as Row[];
    if (rows.length > 0) return;
    await this.request("user_pin_credentials", {
      method: "POST",
      body: JSON.stringify({
        id: randomUUID(),
        organization_id: input.organizationId,
        user_profile_id: input.profileId,
        verifier: input.verifier,
        verifier_version: 1,
        changed_by_profile_id: input.profileId,
        changed_at: input.observedAt,
      }),
    });
  }

  async resetPinBlocks(
    organizationId: string,
    profileId: string,
    observedAt: string,
  ): Promise<void> {
    await this.request("rpc/reset_pin_blocks", {
      method: "POST",
      body: JSON.stringify({
        target_organization_id: organizationId,
        target_profile_id: profileId,
        observed_at: observedAt,
      }),
    });
  }

  private async one(
    table: string,
    parameters: URLSearchParams,
  ): Promise<Row | null> {
    const response = await this.request(`${table}?${parameters}`);
    const rows = (await response.json()) as Row[];
    return rows[0] ?? null;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(`${this.restUrl}/${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Accept-Profile": "app",
        apikey: this.secret,
        Authorization: `Bearer ${this.secret}`,
        "Content-Profile": "app",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      throw new SupabaseDataError(
        typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
        path.split("?")[0] ?? path,
      );
    }
    return response;
  }

  private string(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }
  private number(row: Row, key: string): number {
    const value = row[key];
    if (typeof value !== "number")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }
}
