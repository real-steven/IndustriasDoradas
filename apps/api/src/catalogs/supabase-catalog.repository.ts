import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  CatalogItem,
  CatalogListQuery,
  CatalogRepository,
  CatalogResource,
  ComponentTypeItem,
  CreateCatalogRecord,
  UpdateCatalogRecord,
} from "./catalogs.contracts";
import type { PageResponse } from "../common/dto/page-query.dto";
import type { EnvironmentVariables } from "../config/environment";

interface SupabaseErrorBody {
  code?: unknown;
  message?: unknown;
}

type DatabaseScalar = string | number | boolean | null;
type DatabaseRow = Record<string, DatabaseScalar>;

export class SupabaseDataError extends Error {
  constructor(
    readonly databaseCode: string,
    readonly source: string,
  ) {
    super("Supabase data operation failed");
  }
}

@Injectable()
export class SupabaseCatalogRepository implements CatalogRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async list(
    resource: CatalogResource,
    organizationId: string,
    query: CatalogListQuery,
  ): Promise<PageResponse<CatalogItem>> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
      order:
        resource === "production_lines" || resource === "line_components"
          ? "display_order.asc,id.asc"
          : "name.asc,id.asc",
      select: "*",
    });

    if (query.search?.trim()) {
      parameters.set("name", `ilike.*${this.escapeLike(query.search.trim())}*`);
    }
    if (query.state !== "all") {
      parameters.set("is_active", `eq.${query.state === "active"}`);
    }
    if (query.plantId !== undefined) {
      parameters.set("plant_id", `eq.${query.plantId}`);
    }
    if (query.productionLineId !== undefined) {
      parameters.set("production_line_id", `eq.${query.productionLineId}`);
    }

    const response = await this.request(resource, parameters, {
      headers: { Prefer: "count=exact" },
    });
    const rows = (await response.json()) as DatabaseRow[];
    const total = this.readTotal(
      response.headers.get("content-range"),
      rows.length,
    );

    return {
      items: rows.map((row) => this.toItem(resource, row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async findById(
    resource: CatalogResource,
    organizationId: string,
    id: string,
  ): Promise<CatalogItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${id}`,
      limit: "1",
      select: "*",
    });
    const response = await this.request(resource, parameters);
    const rows = (await response.json()) as DatabaseRow[];
    return rows[0] === undefined ? null : this.toItem(resource, rows[0]);
  }

  async create(
    resource: CatalogResource,
    record: CreateCatalogRecord,
  ): Promise<CatalogItem> {
    const response = await this.request(resource, undefined, {
      body: JSON.stringify(this.toCreateRow(resource, record)),
      headers: { Prefer: "return=representation" },
      method: "POST",
    });
    const rows = (await response.json()) as DatabaseRow[];
    return this.toItem(resource, this.requireReturnedRow(resource, rows));
  }

  async update(
    resource: CatalogResource,
    organizationId: string,
    id: string,
    changes: UpdateCatalogRecord,
  ): Promise<CatalogItem | null> {
    return this.patch(
      resource,
      organizationId,
      id,
      this.toUpdateRow(resource, changes),
    );
  }

  async setActive(
    resource: CatalogResource,
    organizationId: string,
    id: string,
    active: boolean,
  ): Promise<CatalogItem | null> {
    return this.patch(resource, organizationId, id, {
      is_active: active,
      deactivated_at: active ? null : new Date().toISOString(),
    });
  }

  async listComponentTypes(): Promise<readonly ComponentTypeItem[]> {
    const parameters = new URLSearchParams({
      is_active: "eq.true",
      order: "code.asc",
      select: "id,code,name_es,name_en,is_active",
    });
    const response = await this.request("line_component_types", parameters);
    const rows = (await response.json()) as DatabaseRow[];
    return rows.map((row) => ({
      id: this.string(row, "id"),
      code: this.string(row, "code"),
      nameEs: this.string(row, "name_es"),
      nameEn: this.string(row, "name_en"),
      isActive: this.boolean(row, "is_active"),
    }));
  }

  private async patch(
    resource: CatalogResource,
    organizationId: string,
    id: string,
    changes: DatabaseRow,
  ): Promise<CatalogItem | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${id}`,
    });
    const response = await this.request(resource, parameters, {
      body: JSON.stringify(changes),
      headers: { Prefer: "return=representation" },
      method: "PATCH",
    });
    const rows = (await response.json()) as DatabaseRow[];
    return rows[0] === undefined ? null : this.toItem(resource, rows[0]);
  }

  private async request(
    resource: CatalogResource | "line_component_types",
    parameters?: URLSearchParams,
    init: RequestInit = {},
  ): Promise<Response> {
    const query = parameters === undefined ? "" : `?${parameters.toString()}`;
    const response = await fetch(`${this.restUrl}/${resource}${query}`, {
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
      const body = (await response
        .json()
        .catch(() => ({}))) as SupabaseErrorBody;
      throw new SupabaseDataError(
        typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
        resource,
      );
    }

    return response;
  }

  private toCreateRow(
    resource: CatalogResource,
    record: CreateCatalogRecord,
  ): DatabaseRow {
    const common: DatabaseRow = {
      id: record.id,
      organization_id: record.organizationId,
      name: record.name,
    };
    if (record.code !== undefined) common.code = record.code;
    if (record.plantId !== undefined) common.plant_id = record.plantId;
    if (record.productionLineId !== undefined) {
      common.production_line_id = record.productionLineId;
    }
    if (record.componentTypeId !== undefined) {
      common.component_type_id = record.componentTypeId;
    }
    if (record.displayOrder !== undefined)
      common.display_order = record.displayOrder;
    if (record.timezone !== undefined) common.timezone = record.timezone;
    if (record.deviceKey !== undefined) common.device_key = record.deviceKey;
    if (resource === "stations") common.permission_version = 1;
    if (resource === "suppliers") {
      common.email = record.email ?? null;
      common.phone = record.phone ?? null;
    }
    return common;
  }

  private toUpdateRow(
    resource: CatalogResource,
    changes: UpdateCatalogRecord,
  ): DatabaseRow {
    const row: DatabaseRow = {};
    if (changes.code !== undefined) row.code = changes.code;
    if (changes.name !== undefined) row.name = changes.name;
    if (changes.componentTypeId !== undefined) {
      row.component_type_id = changes.componentTypeId;
    }
    if (changes.displayOrder !== undefined)
      row.display_order = changes.displayOrder;
    if (changes.timezone !== undefined) row.timezone = changes.timezone;
    if (changes.deviceKey !== undefined) row.device_key = changes.deviceKey;
    if (resource === "suppliers") {
      if (changes.email !== undefined) row.email = changes.email;
      if (changes.phone !== undefined) row.phone = changes.phone;
    }
    return row;
  }

  private toItem(resource: CatalogResource, row: DatabaseRow): CatalogItem {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      ...(typeof row.code === "string" ? { code: row.code } : {}),
      name: this.string(row, "name"),
      isActive: this.boolean(row, "is_active"),
      deactivatedAt: this.nullableString(row, "deactivated_at"),
      ...(typeof row.plant_id === "string" ? { plantId: row.plant_id } : {}),
      ...(typeof row.production_line_id === "string"
        ? { productionLineId: row.production_line_id }
        : {}),
      ...(typeof row.component_type_id === "string"
        ? { componentTypeId: row.component_type_id }
        : {}),
      ...(typeof row.display_order === "number"
        ? { displayOrder: row.display_order }
        : {}),
      ...(typeof row.timezone === "string" ? { timezone: row.timezone } : {}),
      ...(typeof row.permission_version === "number"
        ? { permissionVersion: row.permission_version }
        : {}),
      ...(resource === "suppliers"
        ? {
            email: this.nullableString(row, "email"),
            phone: this.nullableString(row, "phone"),
          }
        : {}),
      createdAt: this.string(row, "created_at"),
      updatedAt: this.string(row, "updated_at"),
    };
  }

  private requireReturnedRow(
    resource: string,
    rows: DatabaseRow[],
  ): DatabaseRow {
    const row = rows[0];
    if (row === undefined)
      throw new SupabaseDataError("EMPTY_RESPONSE", resource);
    return row;
  }

  private string(row: DatabaseRow, key: string): string {
    const value = row[key];
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private nullableString(row: DatabaseRow, key: string): string | null {
    const value = row[key];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private boolean(row: DatabaseRow, key: string): boolean {
    const value = row[key];
    if (typeof value !== "boolean")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
  }

  private readTotal(contentRange: string | null, fallback: number): number {
    const total = contentRange?.split("/")[1];
    return total !== undefined && /^\d+$/u.test(total)
      ? Number(total)
      : fallback;
  }
}
