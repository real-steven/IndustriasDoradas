import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  PayrollAdjustment,
  PayrollAdjustmentType,
  PayrollFilters,
  PayrollGrossAuthorization,
  PayrollRateVersion,
  PayrollRepository,
  PayrollWorkerProfile,
} from "./payroll.contracts";
import { PAYROLL_ADJUSTMENT_TYPES } from "./payroll.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { EnvironmentVariables } from "../config/environment";

type Row = Record<string, unknown>;

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

@Injectable()
export class SupabasePayrollRepository implements PayrollRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async listWorkers(
    organizationId: string,
    search?: string,
  ): Promise<readonly PayrollWorkerProfile[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      order: "name.asc,id.asc",
      limit: "500",
      select: "*",
    });
    const response = await this.request(
      `management_worker_payroll_profiles?${parameters}`,
    );
    const workers = ((await response.json()) as Row[]).map((row) =>
      this.worker(row),
    );
    const term = search?.trim().toLocaleLowerCase("es-CR");
    if (term === undefined || term === "") return workers;
    return workers.filter(
      (worker) =>
        worker.name.toLocaleLowerCase("es-CR").includes(term) ||
        worker.identityNumber?.toLocaleLowerCase("es-CR").includes(term) ===
          true,
    );
  }

  async findWorker(
    organizationId: string,
    workerId: string,
  ): Promise<PayrollWorkerProfile | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${workerId}`,
      limit: "1",
      select: "*",
    });
    const response = await this.request(
      `management_worker_payroll_profiles?${parameters}`,
    );
    const row = ((await response.json()) as Row[])[0];
    return row === undefined ? null : this.worker(row);
  }

  async updateIdentity(
    organizationId: string,
    workerId: string,
    identityNumber: string | null,
  ): Promise<void> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${workerId}`,
    });
    await this.request(`workers?${parameters}`, {
      method: "PATCH",
      body: JSON.stringify({ identity_number: identityNumber }),
    });
  }

  async listRates(
    organizationId: string,
    workerId?: string,
  ): Promise<readonly PayrollRateVersion[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      order: "effective_from_utc.desc,created_at.desc,id.asc",
      limit: "5000",
      select: "*",
    });
    if (workerId !== undefined) parameters.set("worker_id", `eq.${workerId}`);
    const response = await this.request(
      `worker_pay_rate_versions?${parameters}`,
    );
    return ((await response.json()) as Row[]).map((row) => this.rate(row));
  }

  async createRate(
    input: Omit<PayrollRateVersion, "createdAtUtc">,
  ): Promise<void> {
    await this.request("worker_pay_rate_versions", {
      method: "POST",
      body: JSON.stringify({
        id: input.id,
        organization_id: input.organizationId,
        worker_id: input.workerId,
        regular_hourly_rate: input.regularHourlyRateCrc,
        night_multiplier: input.nightMultiplier,
        effective_from_utc: input.effectiveFromUtc,
        recorded_by_profile_id: input.recordedByProfileId,
        reason: input.reason,
      }),
    });
  }

  async listAdjustments(
    organizationId: string,
    filters: PayrollFilters,
  ): Promise<readonly PayrollAdjustment[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      order: "adjustment_date.desc,recorded_at_utc.desc,id.asc",
      limit: "5000",
      select: "*",
      adjustment_date: `gte.${filters.fromDate}`,
    });
    parameters.append("adjustment_date", `lte.${filters.toDate}`);
    if (filters.workerId !== undefined)
      parameters.set("worker_id", `eq.${filters.workerId}`);
    const response = await this.request(`payroll_adjustments?${parameters}`);
    return ((await response.json()) as Row[]).map((row) =>
      this.adjustment(row),
    );
  }

  async createAdjustment(input: PayrollAdjustment): Promise<void> {
    await this.request("payroll_adjustments", {
      method: "POST",
      body: JSON.stringify({
        id: input.id,
        organization_id: input.organizationId,
        worker_id: input.workerId,
        adjustment_date: input.adjustmentDate,
        adjustment_type: input.adjustmentType,
        minutes: input.minutes,
        amount_crc: input.amountCrc,
        note: input.note,
        recorded_by_profile_id: input.recordedByProfileId,
        recorded_at_utc: input.recordedAtUtc,
      }),
    });
  }

  async listGrossAuthorizations(
    organizationId: string,
    filters: PayrollFilters,
  ): Promise<readonly PayrollGrossAuthorization[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      from_date: `eq.${filters.fromDate}`,
      to_date: `eq.${filters.toDate}`,
      order: "recorded_at_utc.desc,id.desc",
      limit: "5000",
      select: "*",
    });
    if (filters.workerId !== undefined)
      parameters.set("worker_id", `eq.${filters.workerId}`);
    const response = await this.request(
      `management_payroll_gross_authorizations?${parameters}`,
    );
    return ((await response.json()) as Row[]).map((row) =>
      this.grossAuthorization(row),
    );
  }

  async createGrossAuthorization(
    input: PayrollGrossAuthorization,
  ): Promise<void> {
    await this.request("payroll_gross_authorizations", {
      method: "POST",
      body: JSON.stringify({
        id: input.id,
        organization_id: input.organizationId,
        worker_id: input.workerId,
        from_date: input.fromDate,
        to_date: input.toDate,
        authorized_amount_crc: input.authorizedAmountCrc,
        reason: input.reason,
        recorded_by_profile_id: input.recordedByProfileId,
        recorded_at_utc: input.recordedAtUtc,
      }),
    });
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
        Prefer: "return=minimal",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ErrorBody;
      throw new SupabaseDataError(
        typeof body.code === "string" ? body.code : `HTTP_${response.status}`,
        path.split("?")[0] ?? path,
        typeof body.message === "string" ? body.message : undefined,
      );
    }
    return response;
  }

  private worker(row: Row): PayrollWorkerProfile {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      plantId: this.string(row, "plant_id"),
      name: this.string(row, "name"),
      identityNumber: this.nullableString(row, "identity_number"),
      category: this.string(row, "category"),
      status: this.string(row, "status"),
      isActive: this.boolean(row, "is_active"),
      currentRateId: this.nullableString(row, "current_rate_id"),
      currentHourlyRateCrc: this.nullableNumber(row, "current_hourly_rate_crc"),
      nightMultiplier: this.nullableNumber(row, "night_multiplier"),
      rateEffectiveFromUtc: this.nullableString(row, "rate_effective_from_utc"),
    };
  }

  private rate(row: Row): PayrollRateVersion {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      workerId: this.string(row, "worker_id"),
      regularHourlyRateCrc: this.number(row, "regular_hourly_rate"),
      nightMultiplier: this.number(row, "night_multiplier"),
      effectiveFromUtc: this.string(row, "effective_from_utc"),
      recordedByProfileId: this.string(row, "recorded_by_profile_id"),
      reason: this.string(row, "reason"),
      createdAtUtc: this.string(row, "created_at"),
    };
  }

  private adjustment(row: Row): PayrollAdjustment {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      workerId: this.string(row, "worker_id"),
      adjustmentDate: this.string(row, "adjustment_date"),
      adjustmentType: this.adjustmentType(row, "adjustment_type"),
      minutes: this.nullableNumber(row, "minutes"),
      amountCrc: this.nullableNumber(row, "amount_crc"),
      note: this.string(row, "note"),
      recordedByProfileId: this.string(row, "recorded_by_profile_id"),
      recordedAtUtc: this.string(row, "recorded_at_utc"),
    };
  }

  private grossAuthorization(row: Row): PayrollGrossAuthorization {
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      workerId: this.string(row, "worker_id"),
      fromDate: this.string(row, "from_date"),
      toDate: this.string(row, "to_date"),
      authorizedAmountCrc: this.number(row, "authorized_amount_crc"),
      reason: this.string(row, "reason"),
      recordedByProfileId: this.string(row, "recorded_by_profile_id"),
      recordedByName: this.string(row, "recorded_by_name"),
      recordedAtUtc: this.string(row, "recorded_at_utc"),
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

  private nullableNumber(row: Row, key: string): number | null {
    if (row[key] === null || row[key] === undefined) return null;
    return this.number(row, key);
  }

  private boolean(row: Row, key: string): boolean {
    const value = row[key];
    if (typeof value !== "boolean")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private adjustmentType(row: Row, key: string): PayrollAdjustmentType {
    const value = this.string(row, key);
    if (!PAYROLL_ADJUSTMENT_TYPES.includes(value as PayrollAdjustmentType))
      throw new SupabaseDataError("INVALID_ROW", key);
    return value as PayrollAdjustmentType;
  }
}
