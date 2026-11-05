import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  ReportExpenseCategory,
  ReportSettlement,
  ReportSettlementExpense,
  ReportSettlementFilters,
  ReportSettlementLine,
  ReportSettlementRepository,
  ReportSettlementStatus,
  SaveReportSettlement,
} from "./report-settlements.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import type { EnvironmentVariables } from "../config/environment";

type Row = Record<string, unknown>;

interface SupabaseErrorBody {
  code?: unknown;
  message?: unknown;
}

@Injectable()
export class SupabaseReportSettlementRepository implements ReportSettlementRepository {
  private readonly restUrl: string;
  private readonly secret: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.restUrl = `${config.get("SUPABASE_URL", { infer: true })}/rest/v1`;
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
  }

  async list(
    organizationId: string,
    filters: ReportSettlementFilters,
  ): Promise<readonly ReportSettlement[]> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      week_start: `gte.${filters.fromDate}`,
      order: "week_start.desc,created_at.desc,id.asc",
      select: "*",
    });
    parameters.append("week_start", `lte.${filters.toDate}`);
    if (filters.supplierId !== undefined)
      parameters.set("supplier_id", `eq.${filters.supplierId}`);
    if (filters.status !== undefined)
      parameters.set("status", `eq.${filters.status}`);
    const response = await this.request(
      `management_report_settlements?${parameters}`,
    );
    const rows = (await response.json()) as Row[];
    return rows.map((row) => this.settlement(row));
  }

  async find(
    organizationId: string,
    settlementId: string,
  ): Promise<ReportSettlement | null> {
    const parameters = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      id: `eq.${settlementId}`,
      limit: "1",
      select: "*",
    });
    const response = await this.request(
      `management_report_settlements?${parameters}`,
    );
    const rows = (await response.json()) as Row[];
    return rows[0] === undefined ? null : this.settlement(rows[0]);
  }

  async save(input: SaveReportSettlement): Promise<string> {
    const response = await this.request("rpc/save_report_settlement_v1", {
      body: JSON.stringify({
        target_settlement: {
          id: input.id,
          organizationId: input.organizationId,
          supplierId: input.supplierId,
          weekStart: input.weekStart,
          buyerName: input.buyerName,
          destination: input.destination,
          participationPercentage: input.participationPercentage,
          receivedAmountCrc: input.receivedAmountCrc,
          notes: input.notes,
          rowVersion: input.rowVersion,
          actorProfileId: input.actorProfileId,
        },
        target_lines: input.lines.map((line) => ({
          id: line.id,
          shipmentId: line.shipmentId,
          assayLabel: line.assayLabel,
          karat: line.karat,
          gramsLiquidated: line.gramsLiquidated,
          pricePerKaratCrc: line.pricePerKaratCrc,
          pricePerGramCrc: line.pricePerGramCrc,
        })),
        target_expenses: input.expenses.map((expense) => ({
          id: expense.id,
          category: expense.category,
          concept: expense.concept,
          amountCrc: expense.amountCrc,
          occurredOn: expense.occurredOn,
          responsibleName: expense.responsibleName,
        })),
      }),
      method: "POST",
    });
    return this.uuidResponse(response, "save_report_settlement_v1");
  }

  async transition(input: {
    organizationId: string;
    settlementId: string;
    rowVersion: number;
    targetStatus: ReportSettlementStatus;
    actorProfileId: string;
  }): Promise<string> {
    const response = await this.request("rpc/transition_report_settlement_v1", {
      body: JSON.stringify({
        target_organization_id: input.organizationId,
        target_settlement_id: input.settlementId,
        expected_version: input.rowVersion,
        target_status: input.targetStatus,
        actor_profile_id: input.actorProfileId,
      }),
      method: "POST",
    });
    return this.uuidResponse(response, "transition_report_settlement_v1");
  }

  async createCorrection(input: {
    organizationId: string;
    sourceSettlementId: string;
    correctionSettlementId: string;
    actorProfileId: string;
  }): Promise<string> {
    const response = await this.request(
      "rpc/create_report_settlement_correction_v1",
      {
        body: JSON.stringify({
          target_organization_id: input.organizationId,
          source_settlement_id: input.sourceSettlementId,
          correction_settlement_id: input.correctionSettlementId,
          actor_profile_id: input.actorProfileId,
        }),
        method: "POST",
      },
    );
    return this.uuidResponse(
      response,
      "create_report_settlement_correction_v1",
    );
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
        typeof body.message === "string" ? body.message : undefined,
      );
    }
    return response;
  }

  private async uuidResponse(
    response: Response,
    source: string,
  ): Promise<string> {
    const value = (await response.json()) as unknown;
    if (typeof value !== "string" || !/^[0-9a-f-]{36}$/iu.test(value))
      throw new SupabaseDataError("INVALID_ROW", source);
    return value;
  }

  private settlement(row: Row): ReportSettlement {
    const status = this.string(row, "status");
    if (!this.isStatus(status))
      throw new SupabaseDataError("INVALID_ROW", "status");
    const currency = this.string(row, "currency_code");
    if (currency !== "CRC")
      throw new SupabaseDataError("INVALID_ROW", "currency_code");
    return {
      id: this.string(row, "id"),
      organizationId: this.string(row, "organization_id"),
      supplierId: this.string(row, "supplier_id"),
      supplierName: this.string(row, "supplier_name"),
      weekStart: this.string(row, "week_start"),
      buyerName: this.string(row, "buyer_name"),
      destination: this.nullableString(row, "destination"),
      currencyCode: currency,
      participationPercentage: this.number(row, "participation_percentage"),
      receivedAmountCrc: this.nullableNumber(row, "received_amount_crc"),
      notes: this.nullableString(row, "notes"),
      status,
      revision: this.number(row, "revision"),
      supersedesSettlementId: this.nullableString(
        row,
        "supersedes_settlement_id",
      ),
      rowVersion: this.number(row, "row_version"),
      createdByProfileId: this.string(row, "created_by_profile_id"),
      updatedByProfileId: this.string(row, "updated_by_profile_id"),
      approvedByProfileId: this.nullableString(row, "approved_by_profile_id"),
      approvedAtUtc: this.nullableString(row, "approved_at_utc"),
      createdAtUtc: this.string(row, "created_at"),
      updatedAtUtc: this.string(row, "updated_at"),
      totalGrams: this.number(row, "total_grams"),
      grossAmountCrc: this.number(row, "gross_amount_crc"),
      expensesCrc: this.number(row, "expenses_crc"),
      netAmountCrc: this.number(row, "net_amount_crc"),
      participationAmountCrc: this.number(row, "participation_amount_crc"),
      effectiveReceivedAmountCrc: this.number(
        row,
        "effective_received_amount_crc",
      ),
      lines: this.array(row, "lines").map((item) => this.line(item)),
      expenses: this.array(row, "expenses").map((item) => this.expense(item)),
    };
  }

  private line(row: Row): ReportSettlementLine {
    return {
      id: this.string(row, "id"),
      shipmentId: this.string(row, "shipmentId"),
      assayLabel: this.nullableString(row, "assayLabel"),
      karat: this.number(row, "karat"),
      gramsLiquidated: this.number(row, "gramsLiquidated"),
      pricePerKaratCrc: this.nullableNumber(row, "pricePerKaratCrc"),
      pricePerGramCrc: this.number(row, "pricePerGramCrc"),
      grossAmountCrc: this.number(row, "grossAmountCrc"),
      displayOrder: this.number(row, "displayOrder"),
    };
  }

  private expense(row: Row): ReportSettlementExpense {
    const category = this.string(row, "category");
    if (!this.isExpenseCategory(category))
      throw new SupabaseDataError("INVALID_ROW", "category");
    return {
      id: this.string(row, "id"),
      category,
      concept: this.string(row, "concept"),
      amountCrc: this.number(row, "amountCrc"),
      occurredOn: this.string(row, "occurredOn"),
      responsibleName: this.nullableString(row, "responsibleName"),
      displayOrder: this.number(row, "displayOrder"),
    };
  }

  private array(row: Row, key: string): Row[] {
    const value = row[key];
    if (!Array.isArray(value) || value.some((item) => !this.isRow(item)))
      throw new SupabaseDataError("INVALID_ROW", key);
    return value as Row[];
  }

  private isRow(value: unknown): value is Row {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private string(row: Row, key: string): string {
    const value = row[key];
    if (typeof value !== "string")
      throw new SupabaseDataError("INVALID_ROW", key);
    return value;
  }

  private nullableString(row: Row, key: string): string | null {
    const value = row[key];
    return value === null || value === undefined ? null : this.string(row, key);
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

  private isStatus(value: string): value is ReportSettlementStatus {
    return ["DRAFT", "REVIEWED", "APPROVED", "CLOSED"].includes(value);
  }

  private isExpenseCategory(value: string): value is ReportExpenseCategory {
    return ["TRANSPORT", "BAGS", "PLANT", "SALARY", "FINCA", "OTHER"].includes(
      value,
    );
  }
}
