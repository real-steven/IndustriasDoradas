import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

import {
  SyncRepositoryError,
  type SyncItemResult,
  type SyncRepository,
  type SyncStationScope,
} from "./sync.contracts";
import type { EnvironmentVariables } from "../config/environment";

interface SupabaseErrorBody {
  code?: unknown;
}

type Scalar = string | number | boolean | null;
type Row = Record<string, Scalar>;

@Injectable()
export class SupabaseSyncRepository implements SyncRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async findActiveStationScope(input: {
    organizationId: string;
    plantId: string;
    stationId: string;
    profileId: string;
  }): Promise<SyncStationScope | null> {
    const station = await this.one(
      "stations",
      new URLSearchParams({
        organization_id: `eq.${input.organizationId}`,
        plant_id: `eq.${input.plantId}`,
        id: `eq.${input.stationId}`,
        is_active: "eq.true",
        limit: "1",
        select: "permission_version",
      }),
    );
    if (station === null) return null;
    const authorization = await this.one(
      "station_user_authorizations",
      new URLSearchParams({
        organization_id: `eq.${input.organizationId}`,
        plant_id: `eq.${input.plantId}`,
        station_id: `eq.${input.stationId}`,
        user_profile_id: `eq.${input.profileId}`,
        is_active: "eq.true",
        limit: "1",
        select: "id",
      }),
    );
    if (authorization === null) return null;
    const permissionVersion = station.permission_version;
    if (typeof permissionVersion !== "number") {
      throw new SyncRepositoryError("INVALID_ROW");
    }
    return { permissionVersion };
  }

  async ingestItem(
    input: Parameters<SyncRepository["ingestItem"]>[0],
  ): Promise<SyncItemResult> {
    const response = await this.request("rpc/ingest_sync_item_v1", {
      method: "POST",
      body: JSON.stringify({
        input_item: {
          organizationId: input.organizationId,
          plantId: input.plantId,
          stationId: input.stationId,
          correlationId: input.correlationId,
          receiptId: randomUUID(),
          auditEventId: randomUUID(),
          processedAtUtc: new Date().toISOString(),
          outboxMessageId: input.item.outboxMessageId,
          stationSequence: input.item.stationSequence,
          contentHash: input.item.contentHash,
          operationType: input.item.operationType,
          aggregateType: input.item.aggregateType,
          aggregateId: input.item.aggregateId,
          payloadSchemaVersion: input.item.payloadSchemaVersion,
          createdAtUtc: input.item.createdAtUtc,
          authorization: input.item.authorization,
          payload: input.item.payload,
          precheckCode: input.item.precheckCode,
        },
      }),
    });
    const result = (await response.json()) as unknown;
    if (!this.isSyncResult(result)) {
      throw new SyncRepositoryError("INVALID_RPC_RESPONSE");
    }
    return result;
  }

  private async one(
    table: string,
    parameters: URLSearchParams,
  ): Promise<Row | null> {
    const response = await this.request(`${table}?${parameters.toString()}`);
    const rows = (await response.json()) as Row[];
    return rows[0] ?? null;
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.restUrl}/${path}`, {
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
    } catch {
      throw new SyncRepositoryError("NETWORK_ERROR");
    }
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => ({}))) as SupabaseErrorBody;
      throw new SyncRepositoryError(
        typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
      );
    }
    return response;
  }

  private isSyncResult(value: unknown): value is SyncItemResult {
    if (value === null || typeof value !== "object") return false;
    const result = value as Record<string, unknown>;
    return (
      typeof result.outboxMessageId === "string" &&
      typeof result.stationSequence === "number" &&
      ["APPLIED", "ALREADY_APPLIED", "RETRY_LATER", "FAILED_REVIEW"].includes(
        String(result.status),
      ) &&
      (result.receiptId === undefined ||
        typeof result.receiptId === "string") &&
      typeof result.code === "string" &&
      typeof result.processedAtUtc === "string"
    );
  }
}
