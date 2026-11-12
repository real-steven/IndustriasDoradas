import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  AuditCategory,
  AuditListItem,
  AuditQueryRepository,
} from "./audit.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import type { EnvironmentVariables } from "../config/environment";
import {
  SHIPMENT_CODE_PATTERN,
  shipmentCodeRange,
} from "../management/shipment-code";

type Row = Record<string, unknown>;

const inventoryEntityTypes = [
  "inventory_review",
  "inventory_movement",
  "inventory_item_type",
  "inventory_unit",
  "inventory_item",
  "rastra_component_change",
  "operational_novelty_change",
] as const;

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
      category?: AuditCategory;
      kinds?: string;
      workerId?: string;
      productionLineId?: string;
      action?: string;
      entityType?: string;
      result?: AuditListItem["result"];
      inventory?: "include" | "exclude";
      fromUtc?: string;
      toUtc?: string;
      routine?: "include" | "exclude";
    },
  ): Promise<PageResponse<AuditListItem>> {
    // La vista clasifica cada hecho por área y tipo; el filtrado y la paginación
    // ocurren en la base, nunca descargando el historial completo.
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
      order: "occurred_at.desc,id.asc",
      select:
        "id,correlation_id,organization_id,station_id,actor_display_name,actor_role_code,origin,action,entity_type,entity_id,result,reason_code,evidence_state,changed_fields,changes,occurred_at,recorded_at,audit_area,audit_kind,subject_worker_id,subject_name,subject_occurred_at_utc,production_line_id",
    });
    if (query.action !== undefined)
      parameters.set("action", `eq.${query.action}`);
    if (query.category !== undefined)
      parameters.set("audit_area", `eq.${query.category}`);
    if (query.kinds !== undefined)
      parameters.set("audit_kind", `in.(${query.kinds})`);
    if (query.workerId !== undefined)
      parameters.set("subject_worker_id", `eq.${query.workerId}`);
    if (query.productionLineId !== undefined)
      parameters.set("production_line_id", `eq.${query.productionLineId}`);
    if (query.entityType !== undefined)
      parameters.set("entity_type", `eq.${query.entityType}`);
    if (
      query.inventory === "exclude" &&
      query.entityType === undefined &&
      query.category !== "operation"
    )
      parameters.set(
        "entity_type",
        `not.in.(${inventoryEntityTypes.join(",")})`,
      );
    if (query.result !== undefined)
      parameters.set("result", `eq.${query.result}`);
    if (query.fromUtc !== undefined)
      parameters.set("occurred_at", `gte.${query.fromUtc}`);
    if (query.toUtc !== undefined)
      parameters.append("occurred_at", `lt.${query.toUtc}`);
    // Rutina: accesos técnicos y cajuelas individuales. Se conservan, pero no
    // saturan la auditoría gerencial normal.
    if (query.routine === "exclude") parameters.set("is_routine", "is.false");
    if (query.search?.trim()) {
      const search = this.escape(query.search);
      const clauses = [
        `action.ilike.*${search}*`,
        `entity_type.ilike.*${search}*`,
        `actor_display_name.ilike.*${search}*`,
        `subject_name.ilike.*${search}*`,
        `reason_code.ilike.*${search}*`,
        ...this.shipmentCodeClauses(query.search),
        ...this.managerSearchAliases(query.search),
      ];
      parameters.set("or", `(${clauses.join(",")})`);
    }
    const response = await fetch(
      `${this.restUrl}/management_audit_entries?${parameters}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Profile": "app",
          apikey: this.secret,
          Authorization: `Bearer ${this.secret}`,
          Prefer: "count=exact",
        },
      },
    );
    if (!response.ok)
      throw new SupabaseDataError(
        `HTTP_${response.status}`,
        "management_audit_entries",
      );
    const rows = (await response.json()) as Row[];
    const items = rows.map((row) => this.item(row));
    const shipmentStatuses = await this.shipmentStatuses(organizationId, items);
    const range = response.headers.get("content-range")?.split("/")[1];
    const total =
      range !== undefined && /^\d+$/u.test(range)
        ? Number(range)
        : items.length;
    return {
      items: items.map((item) => ({
        ...item,
        shipmentStatus:
          item.entityType === "shipment" && item.entityId !== null
            ? (shipmentStatuses.get(item.entityId) ?? null)
            : null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  private async shipmentStatuses(
    organizationId: string,
    items: readonly AuditListItem[],
  ): Promise<ReadonlyMap<string, "ACTIVE" | "COMPLETED">> {
    const shipmentIds = [
      ...new Set(
        items.flatMap((item) =>
          item.entityType === "shipment" &&
          item.entityId !== null &&
          item.result === "SUCCEEDED"
            ? [item.entityId]
            : [],
        ),
      ),
    ];
    const statuses = new Map<string, "ACTIVE" | "COMPLETED">();
    if (shipmentIds.length === 0) return statuses;

    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      shipment_id: `in.(${shipmentIds.join(",")})`,
      select: "shipment_id,status",
    });
    const response = await fetch(
      `${this.restUrl}/management_shipment_facts?${parameters}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Profile": "app",
          apikey: this.secret,
          Authorization: `Bearer ${this.secret}`,
        },
      },
    );
    if (!response.ok) return statuses;

    const rows = (await response.json()) as Row[];
    for (const row of rows) {
      const id = row.shipment_id;
      const status = row.status;
      if (
        typeof id === "string" &&
        (status === "ACTIVE" || status === "COMPLETED")
      )
        statuses.set(id, status);
    }
    return statuses;
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
      auditArea: this.area(row.audit_area),
      auditKind: this.nullable(row, "audit_kind") ?? "OTHER",
      subjectWorkerId: this.nullable(row, "subject_worker_id"),
      subjectName: this.nullable(row, "subject_name"),
      subjectOccurredAtUtc: this.nullable(row, "subject_occurred_at_utc"),
      productionLineId: this.nullable(row, "production_line_id"),
      occurredAt: this.string(row, "occurred_at"),
      recordedAt: this.string(row, "recorded_at"),
    };
  }
  private area(value: unknown): AuditCategory | null {
    return value === "operation" ||
      value === "people" ||
      value === "security" ||
      value === "administration"
      ? value
      : null;
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
  // UUID completo o código corto del cargamento (primeros 8 caracteres del
  // UUID, igual que en desktop, web y reportes), sin importar mayúsculas.
  private shipmentCodeClauses(value: string): string[] {
    const normalized = value.trim().toLowerCase();
    if (!SHIPMENT_CODE_PATTERN.test(normalized)) return [];
    const [first, last] = shipmentCodeRange(normalized);
    return first === last
      ? [`entity_id.eq.${first}`]
      : [`and(entity_id.gte.${first},entity_id.lte.${last})`];
  }

  private escape(value: string): string {
    return value.trim().replace(/[\\%_(),]/gu, (match) => `\\${match}`);
  }

  private managerSearchAliases(value: string): string[] {
    const normalized = value.trim().toLocaleLowerCase("es");
    if (/oro|gold/u.test(normalized))
      return ["changed_fields.cs.{gold_amount_grams}"];
    if (/trabajador|empleado|worker/u.test(normalized))
      return ["entity_type.ilike.*worker*"];
    if (/usuario|cuenta|user|account/u.test(normalized))
      return ["entity_type.ilike.*user_profile*"];
    if (/proveedor|supplier/u.test(normalized))
      return ["entity_type.ilike.*supplier*"];
    if (/cargamento|shipment/u.test(normalized))
      return ["entity_type.eq.shipment"];
    if (/inventario|inventory/u.test(normalized))
      return ["entity_type.ilike.*inventory*"];
    return [];
  }
}
