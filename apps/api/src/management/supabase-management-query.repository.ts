import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  ManagementFilters,
  ManagementLatestChange,
  ManagementOperationLine,
  ManagementPageQuery,
  ManagementQueryRepository,
  ManagementShipment,
  ManagementSweepMercury,
} from "./management.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { PageResponse } from "../common/dto/page-query.dto";
import type { EnvironmentVariables } from "../config/environment";

type Row = Record<string, unknown>;

const OPERATION_SELECT = [
  "organization_id",
  "plant_id",
  "station_id",
  "station_name",
  "shipment_id",
  "feed_cycle_id",
  "production_line_id",
  "production_line_name",
  "production_line_order",
  "supplier_id",
  "supplier_name",
  "responsible_worker_id",
  "responsible_worker_name",
  "started_at_utc",
  "cajuela_total",
  "sweep_count",
  "swept_cajuelas",
  "cajuelas_since_last_sweep",
  "next_sweep_at",
  "sweep_pending",
  "last_activity_at_utc",
].join(",");

const SHIPMENT_SELECT = [
  OPERATION_SELECT,
  "status",
  "completed_at_utc",
  "gold_result_id",
  "gold_amount_grams",
  "gold_unit_code",
  "gold_recorded_at_utc",
  "gold_recorded_by_profile_id",
  "gold_revision_count",
  "has_gold_result",
].join(",");

const SWEEP_SELECT = [
  "organization_id",
  "shipment_id",
  "sweep_id",
  "swept_at_utc",
  "cajuela_count",
  "line_component_id",
  "line_component_name",
  "line_component_order",
  "input_grams",
  "remainder_grams",
  "has_input_record",
  "has_remainder_record",
].join(",");

@Injectable()
export class SupabaseManagementQueryRepository implements ManagementQueryRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async findLatestChange(
    organizationId: string,
  ): Promise<ManagementLatestChange | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      order: "server_sequence.desc",
      limit: "1",
      select: "server_sequence,changed_at_utc",
    });
    const response = await this.request(`sync_changes?${parameters}`);
    const rows = (await response.json()) as Row[];
    const row = rows[0];
    return row === undefined
      ? null
      : {
          serverSequence: this.integerString(row, "server_sequence"),
          changedAtUtc: this.string(row, "changed_at_utc"),
        };
  }

  async listOperationLines(
    organizationId: string,
    query: ManagementFilters,
  ): Promise<PageResponse<ManagementOperationLine>> {
    const parameters = this.baseParameters(
      organizationId,
      query,
      OPERATION_SELECT,
      "production_line_order.asc,production_line_id.asc,shipment_id.asc",
    );
    this.appendFilters(parameters, query, "started_at_utc");
    return this.page("management_operation_lines", parameters, query, (row) =>
      this.operationLine(row),
    );
  }

  async listShipments(
    organizationId: string,
    query: ManagementFilters,
  ): Promise<PageResponse<ManagementShipment>> {
    const parameters = this.baseParameters(
      organizationId,
      query,
      SHIPMENT_SELECT,
      "completed_at_utc.desc,shipment_id.asc",
    );
    parameters.set("status", "eq.COMPLETED");
    this.appendFilters(parameters, query, "completed_at_utc");
    return this.page("management_shipment_facts", parameters, query, (row) =>
      this.shipment(row),
    );
  }

  async findShipment(
    organizationId: string,
    shipmentId: string,
  ): Promise<ManagementShipment | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      shipment_id: `eq.${shipmentId}`,
      status: "eq.COMPLETED",
      limit: "1",
      select: SHIPMENT_SELECT,
    });
    const response = await this.request(
      `management_shipment_facts?${parameters}`,
    );
    const rows = (await response.json()) as Row[];
    return rows[0] === undefined ? null : this.shipment(rows[0]);
  }

  async listShipmentSweeps(
    organizationId: string,
    shipmentId: string,
    query: ManagementPageQuery,
  ): Promise<PageResponse<ManagementSweepMercury>> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      shipment_id: `eq.${shipmentId}`,
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
      order:
        "swept_at_utc.desc,sweep_id.asc,line_component_order.asc,line_component_id.asc",
      select: SWEEP_SELECT,
    });
    return this.page("management_sweep_mercury", parameters, query, (row) =>
      this.sweep(row),
    );
  }

  private baseParameters(
    organizationId: string,
    query: ManagementPageQuery,
    select: string,
    order: string,
  ): URLSearchParams {
    return new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      limit: String(query.pageSize),
      offset: String((query.page - 1) * query.pageSize),
      order,
      select,
    });
  }

  private appendFilters(
    parameters: URLSearchParams,
    query: ManagementFilters,
    dateColumn: string,
  ): void {
    if (query.fromUtc !== undefined)
      parameters.append(dateColumn, `gte.${query.fromUtc}`);
    if (query.toUtc !== undefined)
      parameters.append(dateColumn, `lt.${query.toUtc}`);
    this.optionalEquality(parameters, "plant_id", query.plantId);
    this.optionalEquality(
      parameters,
      "production_line_id",
      query.productionLineId,
    );
    this.optionalEquality(parameters, "supplier_id", query.supplierId);
    this.optionalEquality(
      parameters,
      "responsible_worker_id",
      query.responsibleWorkerId,
    );
    this.optionalEquality(parameters, "shipment_id", query.shipmentId);
  }

  private optionalEquality(
    parameters: URLSearchParams,
    column: string,
    value: string | undefined,
  ): void {
    if (value !== undefined) parameters.set(column, `eq.${value}`);
  }

  private async page<T>(
    resource: string,
    parameters: URLSearchParams,
    query: ManagementPageQuery,
    map: (row: Row) => T,
  ): Promise<PageResponse<T>> {
    const response = await this.request(`${resource}?${parameters}`, {
      headers: { Prefer: "count=exact" },
    });
    const items = ((await response.json()) as Row[]).map(map);
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
        ...init.headers,
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

  private operationLine(row: Row): ManagementOperationLine {
    return {
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      stationId: this.string(row, "station_id"),
      stationName: this.string(row, "station_name"),
      shipmentId: this.string(row, "shipment_id"),
      feedCycleId: this.string(row, "feed_cycle_id"),
      productionLineId: this.string(row, "production_line_id"),
      productionLineName: this.string(row, "production_line_name"),
      productionLineOrder: this.number(row, "production_line_order"),
      supplierId: this.string(row, "supplier_id"),
      supplierName: this.string(row, "supplier_name"),
      responsibleWorkerId: this.nullableString(row, "responsible_worker_id"),
      responsibleWorkerName: this.nullableString(
        row,
        "responsible_worker_name",
      ),
      startedAtUtc: this.string(row, "started_at_utc"),
      cajuelaTotal: this.number(row, "cajuela_total"),
      sweepCount: this.number(row, "sweep_count"),
      sweptCajuelas: this.number(row, "swept_cajuelas"),
      cajuelasSinceLastSweep: this.number(row, "cajuelas_since_last_sweep"),
      nextSweepAt: this.number(row, "next_sweep_at"),
      sweepPending: this.boolean(row, "sweep_pending"),
      lastActivityAtUtc: this.string(row, "last_activity_at_utc"),
    };
  }

  private shipment(row: Row): ManagementShipment {
    const status = this.string(row, "status");
    if (status !== "COMPLETED")
      throw new SupabaseDataError("INVALID_ROW", "status");
    const goldUnitCode = this.nullableString(row, "gold_unit_code");
    if (goldUnitCode !== null && goldUnitCode !== "g")
      throw new SupabaseDataError("INVALID_ROW", "gold_unit_code");
    return {
      ...this.operationLine(row),
      status,
      completedAtUtc: this.string(row, "completed_at_utc"),
      goldResultId: this.nullableString(row, "gold_result_id"),
      goldAmountGrams: this.nullableNumber(row, "gold_amount_grams"),
      goldUnitCode,
      goldRecordedAtUtc: this.nullableString(row, "gold_recorded_at_utc"),
      goldRecordedByProfileId: this.nullableString(
        row,
        "gold_recorded_by_profile_id",
      ),
      goldRevisionCount: this.nullableNumber(row, "gold_revision_count"),
      hasGoldResult: this.boolean(row, "has_gold_result"),
    };
  }

  private sweep(row: Row): ManagementSweepMercury {
    return {
      organizationId: this.string(row, "organization_id"),
      shipmentId: this.string(row, "shipment_id"),
      sweepId: this.string(row, "sweep_id"),
      sweptAtUtc: this.string(row, "swept_at_utc"),
      cajuelaCount: this.number(row, "cajuela_count"),
      lineComponentId: this.string(row, "line_component_id"),
      lineComponentName: this.string(row, "line_component_name"),
      lineComponentOrder: this.number(row, "line_component_order"),
      inputGrams: this.nullableNumber(row, "input_grams"),
      remainderGrams: this.nullableNumber(row, "remainder_grams"),
      hasInputRecord: this.booleanOrFalse(row, "has_input_record"),
      hasRemainderRecord: this.booleanOrFalse(row, "has_remainder_record"),
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

  private number(row: Row, key: string): number {
    const value = row[key];
    const parsed = typeof value === "string" ? Number(value) : value;
    if (typeof parsed !== "number" || !Number.isFinite(parsed))
      throw new SupabaseDataError("INVALID_ROW", key);
    return parsed;
  }

  private integerString(row: Row, key: string): string {
    const value = row[key];
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new SupabaseDataError("INVALID_ROW", key);
    const normalized = typeof value === "number" ? String(value) : value;
    if (typeof normalized !== "string" || !/^\d+$/u.test(normalized))
      throw new SupabaseDataError("INVALID_ROW", key);
    return normalized;
  }

  private nullableNumber(row: Row, key: string): number | null {
    const value = row[key];
    return value === null || value === undefined ? null : this.number(row, key);
  }

  private boolean(row: Row, key: string): boolean {
    const value = row[key];
    if (typeof value !== "boolean")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private booleanOrFalse(row: Row, key: string): boolean {
    const value = row[key];
    if (value === null || value === undefined) return false;
    return this.boolean(row, key);
  }
}
