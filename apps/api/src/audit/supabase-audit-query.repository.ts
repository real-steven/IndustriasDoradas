import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AuditListItem, AuditQueryRepository } from "./audit.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import type { EnvironmentVariables } from "../config/environment";

type Row = Record<string, unknown>;

@Injectable()
export class SupabaseAuditQueryRepository implements AuditQueryRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async list(
    organizationId: string,
    query: {
      page: number;
      pageSize: number;
      search?: string;
      result?: AuditListItem["result"];
    },
  ): Promise<PageResponse<AuditListItem>> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
      order: "occurred_at.desc,id.asc",
      select:
        "id,correlation_id,organization_id,station_id,actor_display_name,actor_role_code,origin,action,entity_type,entity_id,result,reason_code,evidence_state,changed_fields,changes,occurred_at",
    });
    if (query.result !== undefined)
      parameters.set("result", `eq.${query.result}`);
    if (query.search?.trim())
      parameters.set(
        "or",
        `(action.ilike.*${this.escape(query.search)}*,entity_type.ilike.*${this.escape(query.search)}*)`,
      );
    const response = await fetch(`${this.restUrl}/audit_events?${parameters}`, {
      headers: {
        Accept: "application/json",
        "Accept-Profile": "app",
        apikey: this.secret,
        Authorization: `Bearer ${this.secret}`,
        Prefer: "count=exact",
      },
    });
    if (!response.ok)
      throw new SupabaseDataError(`HTTP_${response.status}`, "audit_events");
    const rows = (await response.json()) as Row[];
    const items = rows.map((row) => this.item(row));
    const range = response.headers.get("content-range")?.split("/")[1];
    const total =
      range !== undefined && /^\d+$/u.test(range)
        ? Number(range)
        : items.length;
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  private item(row: Row): AuditListItem {
    return {
      id: this.string(row, "id"),
      correlationId: this.string(row, "correlation_id"),
      organizationId: this.string(row, "organization_id"),
      stationId: this.nullable(row, "station_id"),
      actorDisplayName: this.nullable(row, "actor_display_name"),
      actorRoleCode: this.nullable(row, "actor_role_code"),
      origin: this.string(row, "origin") as AuditListItem["origin"],
      action: this.string(row, "action"),
      entityType: this.string(row, "entity_type"),
      entityId: this.nullable(row, "entity_id"),
      result: this.string(row, "result") as AuditListItem["result"],
      reasonCode: this.nullable(row, "reason_code"),
      evidenceState: this.string(
        row,
        "evidence_state",
      ) as AuditListItem["evidenceState"],
      changedFields: Array.isArray(row.changed_fields)
        ? row.changed_fields.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      changes:
        typeof row.changes === "object" && row.changes !== null
          ? (row.changes as AuditListItem["changes"])
          : {},
      occurredAt: this.string(row, "occurred_at"),
    };
  }
  private string(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }
  private nullable(row: Row, key: string): string | null {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }
  private escape(value: string): string {
    return value.trim().replace(/[\\%_(),]/gu, (match) => `\\${match}`);
  }
}
