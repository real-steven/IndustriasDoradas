import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

import {
  SyncRepositoryError,
  type SyncChange,
  type SyncItemResult,
  type SyncRepository,
  type SyncStationScope,
} from "./sync.contracts";
import type { EnvironmentVariables } from "../config/environment";

interface SupabaseErrorBody {
  code?: unknown;
}

type Row = Record<string, unknown>;

@Injectable()
export class SupabaseSyncRepository implements SyncRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async findPushStationScope(input: {
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

  async findActivePullScope(input: {
    organizationId: string;
    stationId: string;
    profileId: string;
  }): Promise<SyncStationScope | null> {
    const station = await this.one(
      "stations",
      new URLSearchParams({
        organization_id: `eq.${input.organizationId}`,
        id: `eq.${input.stationId}`,
        is_active: "eq.true",
        limit: "1",
        select: "plant_id,permission_version",
      }),
    );
    if (station === null) return null;
    const plantId = station.plant_id;
    const permissionVersion = station.permission_version;
    if (typeof plantId !== "string" || typeof permissionVersion !== "number") {
      throw new SyncRepositoryError("INVALID_ROW");
    }
    const authorization = await this.one(
      "station_user_authorizations",
      new URLSearchParams({
        organization_id: `eq.${input.organizationId}`,
        plant_id: `eq.${plantId}`,
        station_id: `eq.${input.stationId}`,
        user_profile_id: `eq.${input.profileId}`,
        is_active: "eq.true",
        limit: "1",
        select: "id",
      }),
    );
    return authorization === null ? null : { plantId, permissionVersion };
  }

  async listChanges(
    input: Parameters<SyncRepository["listChanges"]>[0],
  ): Promise<SyncChange[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${input.organizationId}`,
      server_sequence: `gt.${input.afterSequence}`,
      order: "server_sequence.asc",
      limit: String(input.limit),
      select:
        "change_id,server_sequence,entity_type,entity_id,entity_version,action,changed_at_utc,payload_schema_version,payload",
    });
    parameters.append(
      "and",
      `(or(plant_id.is.null,plant_id.eq.${input.plantId}),or(station_id.is.null,station_id.eq.${input.stationId}))`,
    );
    const response = await this.request(
      `sync_changes?${parameters.toString()}`,
    );
    const rows = (await response.json()) as Row[];
    return rows.map((row) => this.toSyncChange(row));
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
          batchId: input.batchId,
          clientApplication: input.clientApplication,
          clientApplicationVersion: input.clientApplicationVersion,
          clientSentAtUtc: input.clientSentAtUtc,
          receiptId: randomUUID(),
          auditEventId: randomUUID(),
          processedAtUtc: input.serverReceivedAtUtc,
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

  private toSyncChange(row: Row): SyncChange {
    const serverSequence = this.safeInteger(row.server_sequence);
    const entityVersion = this.safeInteger(row.entity_version);
    const action = row.action;
    if (
      typeof row.change_id !== "string" ||
      serverSequence === null ||
      typeof row.entity_type !== "string" ||
      typeof row.entity_id !== "string" ||
      entityVersion === null ||
      !["UPSERT", "DEACTIVATE", "CORRECTION_APPENDED"].includes(
        String(action),
      ) ||
      typeof row.changed_at_utc !== "string" ||
      typeof row.payload_schema_version !== "number" ||
      row.payload === null ||
      typeof row.payload !== "object" ||
      Array.isArray(row.payload)
    ) {
      throw new SyncRepositoryError("INVALID_ROW");
    }
    return {
      changeId: row.change_id,
      serverSequence,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityVersion,
      action: action as SyncChange["action"],
      changedAtUtc: row.changed_at_utc,
      payloadSchemaVersion: row.payload_schema_version,
      payload: row.payload as Record<string, unknown>,
    };
  }

  private safeInteger(value: unknown): number | null {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
}
