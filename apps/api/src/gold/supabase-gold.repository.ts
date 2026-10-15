import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  CreateGoldResultEntry,
  GoldFilters,
  GoldRepository,
  GoldResultEntry,
  GoldShipmentFact,
} from "./gold.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { EnvironmentVariables } from "../config/environment";

type Row = Record<string, unknown>;

interface SupabaseErrorBody {
  code?: unknown;
}

const PAGE_SIZE = 1000;

@Injectable()
export class SupabaseGoldRepository implements GoldRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async listShipmentFacts(
    organizationId: string,
    filters: GoldFilters,
  ): Promise<readonly GoldShipmentFact[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      status: "eq.COMPLETED",
      order: "shipment_id.asc",
      select:
        "shipment_id,supplier_id,supplier_name,cajuela_total,has_gold_result,gold_amount_grams",
    });
    this.appendFilters(parameters, filters);
    const rows = await this.allRows("management_shipment_facts", parameters);
    return rows.map((row) => this.shipmentFact(row));
  }

  async listResults(
    organizationId: string,
    shipmentId: string,
  ): Promise<readonly GoldResultEntry[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      shipment_id: `eq.${shipmentId}`,
      order: "recorded_at_utc.desc,id.desc",
      select:
        "id,organization_id,shipment_id,amount_grams,unit_code,recorded_at_utc,recorded_by_profile_id,supersedes_result_id,correction_reason",
    });
    const rows = await this.allRows("shipment_gold_result_entries", parameters);
    const names = await this.profileNames(
      organizationId,
      rows.map((row) => this.string(row, "recorded_by_profile_id")),
    );
    return rows.map((row) =>
      this.result(
        row,
        names.get(this.string(row, "recorded_by_profile_id")) ??
          "Cuenta gerencial",
      ),
    );
  }

  async createResult(input: CreateGoldResultEntry): Promise<GoldResultEntry> {
    const response = await this.request("shipment_gold_result_entries", {
      body: JSON.stringify({
        id: input.id,
        organization_id: input.organizationId,
        shipment_id: input.shipmentId,
        amount_grams: input.amountGrams,
        unit_code: "g",
        recorded_at_utc: input.recordedAtUtc,
        recorded_by_profile_id: input.recordedByProfileId,
        supersedes_result_id: input.supersedesResultId,
        correction_reason: input.correctionReason,
      }),
      headers: { Prefer: "return=representation" },
      method: "POST",
    });
    const rows = (await response.json()) as Row[];
    const row = rows[0];
    if (row === undefined)
      throw new SupabaseDataError(
        "EMPTY_RESPONSE",
        "shipment_gold_result_entries",
      );
    return this.result(row, input.recordedByDisplayName);
  }

  private async profileNames(
    organizationId: string,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `in.(${unique.join(",")})`,
      select: "id,display_name",
      limit: String(PAGE_SIZE),
    });
    const response = await this.request(`user_profiles?${parameters}`);
    const rows = (await response.json()) as Row[];
    return new Map(
      rows.map((row) => [
        this.string(row, "id"),
        this.string(row, "display_name"),
      ]),
    );
  }

  private async allRows(
    resource: string,
    parameters: URLSearchParams,
  ): Promise<Row[]> {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = new URLSearchParams(parameters);
      page.set("limit", String(PAGE_SIZE));
      page.set("offset", String(offset));
      const response = await this.request(`${resource}?${page}`);
      const batch = (await response.json()) as Row[];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) return rows;
    }
  }

  private appendFilters(
    parameters: URLSearchParams,
    filters: GoldFilters,
  ): void {
    if (filters.fromUtc !== undefined)
      parameters.append("completed_at_utc", `gte.${filters.fromUtc}`);
    if (filters.toUtc !== undefined)
      parameters.append("completed_at_utc", `lt.${filters.toUtc}`);
    this.optional(parameters, "plant_id", filters.plantId);
    this.optional(parameters, "production_line_id", filters.productionLineId);
    this.optional(parameters, "supplier_id", filters.supplierId);
    this.optional(
      parameters,
      "responsible_worker_id",
      filters.responsibleWorkerId,
    );
  }

  private optional(
    parameters: URLSearchParams,
    column: string,
    value: string | undefined,
  ): void {
    if (value !== undefined) parameters.set(column, `eq.${value}`);
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
      const body = (await response
        .json()
        .catch(() => ({}))) as SupabaseErrorBody;
      throw new SupabaseDataError(
        typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
        path.split("?")[0] ?? path,
      );
    }
    return response;
  }

  private result(row: Row, displayName: string): GoldResultEntry {
    const unitCode = this.string(row, "unit_code");
    if (unitCode !== "g")
      throw new SupabaseDataError("INVALID_ROW", "unit_code");
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      shipmentId: this.string(row, "shipment_id"),
      amountGrams: this.number(row, "amount_grams"),
      unitCode,
      recordedAtUtc: this.string(row, "recorded_at_utc"),
      recordedByProfileId: this.string(row, "recorded_by_profile_id"),
      recordedByDisplayName: displayName,
      supersedesResultId: this.nullableString(row, "supersedes_result_id"),
      correctionReason: this.nullableString(row, "correction_reason"),
    };
  }

  private shipmentFact(row: Row): GoldShipmentFact {
    const hasGoldResult = this.boolean(row, "has_gold_result");
    const goldAmountGrams = this.nullableNumber(row, "gold_amount_grams");
    if (hasGoldResult !== (goldAmountGrams !== null))
      throw new SupabaseDataError("INVALID_ROW", "has_gold_result");
    return {
      shipmentId: this.string(row, "shipment_id"),
      supplierId: this.string(row, "supplier_id"),
      supplierName: this.string(row, "supplier_name"),
      cajuelaTotal: this.number(row, "cajuela_total"),
      hasGoldResult,
      goldAmountGrams,
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
    return this.string(row, key);
  }

  private number(row: Row, key: string): number {
    const value = row[key];
    const parsed = typeof value === "string" ? Number(value) : value;
    if (typeof parsed !== "number" || !Number.isFinite(parsed))
      throw new SupabaseDataError("INVALID_ROW", key);
    return parsed;
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
}
