import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  ReportSettlement,
  ReportSettlementFilters,
  ReportSettlementRepository,
  ReportSettlementStatus,
  ReportWeeklySummary,
  SaveReportSettlement,
} from "./report-settlements.contracts";
import { REPORT_SETTLEMENT_REPOSITORY } from "./report-settlements.contracts";
import type {
  SaveReportSettlementDto,
  UpdateReportSettlementDto,
} from "./report-settlements.dto";
import { AUDIT_ACTIONS, type AuditActor } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import { ApplicationError } from "../common/errors/application-error";

export interface ReportSettlementMutationContext {
  auth: AuthenticatedContext;
  correlationId: string;
}

@Injectable()
export class ReportSettlementsService {
  constructor(
    @Inject(REPORT_SETTLEMENT_REPOSITORY)
    private readonly repository: ReportSettlementRepository,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async list(organizationId: string, filters: ReportSettlementFilters) {
    this.validateRange(filters);
    try {
      return await this.repository.list(organizationId, filters);
    } catch (error) {
      this.throwRepositoryError(error);
    }
  }

  async weeklySummary(
    organizationId: string,
    filters: ReportSettlementFilters,
  ): Promise<readonly ReportWeeklySummary[]> {
    const settlements = await this.list(organizationId, filters);
    const weeks = new Map<string, ReportWeeklySummary>();
    for (const settlement of settlements) {
      const current = weeks.get(settlement.weekStart) ?? {
        weekStart: settlement.weekStart,
        settlements: 0,
        totalGrams: 0,
        grossAmountCrc: 0,
        expensesCrc: 0,
        netAmountCrc: 0,
        receivedAmountCrc: 0,
      };
      current.settlements += 1;
      current.totalGrams = this.round(
        current.totalGrams + settlement.totalGrams,
        3,
      );
      current.grossAmountCrc = this.money(
        current.grossAmountCrc + settlement.grossAmountCrc,
      );
      current.expensesCrc = this.money(
        current.expensesCrc + settlement.expensesCrc,
      );
      current.netAmountCrc = this.money(
        current.netAmountCrc + settlement.netAmountCrc,
      );
      current.receivedAmountCrc = this.money(
        current.receivedAmountCrc + settlement.effectiveReceivedAmountCrc,
      );
      weeks.set(settlement.weekStart, current);
    }
    return [...weeks.values()].sort((left, right) =>
      right.weekStart.localeCompare(left.weekStart),
    );
  }

  async create(
    organizationId: string,
    input: SaveReportSettlementDto,
    context: ReportSettlementMutationContext,
  ): Promise<ReportSettlement> {
    const settlementId = randomUUID();
    const record = this.record(
      settlementId,
      organizationId,
      input,
      0,
      context.auth.profile.id,
    );
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "report.settlement",
        entityId: settlementId,
        failureResult: "REJECTED",
        failureReasonCode: "REPORT_SETTLEMENT_CREATE_REJECTED",
        allowedChangeFields: ["status", "supplier_id", "line_count"],
        changes: {
          status: { before: null, after: "DRAFT" },
          supplier_id: { before: null, after: input.supplierId },
          line_count: { before: 0, after: input.lines.length },
        },
      },
      () => this.persist(record),
    );
  }

  async update(
    organizationId: string,
    settlementId: string,
    input: UpdateReportSettlementDto,
    context: ReportSettlementMutationContext,
  ): Promise<ReportSettlement> {
    const current = await this.require(organizationId, settlementId);
    if (current.status !== "DRAFT") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "REPORT_SETTLEMENT_LOCKED",
        "Only a draft settlement can be edited",
      );
    }
    if (current.rowVersion !== input.rowVersion) this.conflict();
    const record = this.record(
      settlementId,
      organizationId,
      input,
      input.rowVersion,
      context.auth.profile.id,
    );
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "report.settlement",
        entityId: settlementId,
        failureResult: "REJECTED",
        failureReasonCode: "REPORT_SETTLEMENT_UPDATE_REJECTED",
        allowedChangeFields: [
          "row_version",
          "supplier_id",
          "line_count",
          "expense_count",
        ],
        changes: {
          row_version: {
            before: current.rowVersion,
            after: current.rowVersion + 1,
          },
          supplier_id: { before: current.supplierId, after: input.supplierId },
          line_count: {
            before: current.lines.length,
            after: input.lines.length,
          },
          expense_count: {
            before: current.expenses.length,
            after: input.expenses.length,
          },
        },
      },
      () => this.persist(record),
    );
  }

  async transition(
    organizationId: string,
    settlementId: string,
    rowVersion: number,
    targetStatus: ReportSettlementStatus,
    context: ReportSettlementMutationContext,
  ): Promise<ReportSettlement> {
    const current = await this.require(organizationId, settlementId);
    if (current.rowVersion !== rowVersion) this.conflict();
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "report.settlement",
        entityId: settlementId,
        failureResult: "REJECTED",
        failureReasonCode: "REPORT_SETTLEMENT_STATUS_REJECTED",
        allowedChangeFields: ["status", "row_version"],
        changes: {
          status: { before: current.status, after: targetStatus },
          row_version: { before: rowVersion, after: rowVersion + 1 },
        },
      },
      async () => {
        try {
          await this.repository.transition({
            organizationId,
            settlementId,
            rowVersion,
            targetStatus,
            actorProfileId: context.auth.profile.id,
          });
          return await this.require(organizationId, settlementId);
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
  }

  async createCorrection(
    organizationId: string,
    sourceSettlementId: string,
    context: ReportSettlementMutationContext,
  ): Promise<ReportSettlement> {
    const source = await this.require(organizationId, sourceSettlementId);
    if (source.status !== "APPROVED" && source.status !== "CLOSED") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "REPORT_CORRECTION_SOURCE_INVALID",
        "Only an approved or closed settlement can be corrected",
      );
    }
    const correctionSettlementId = randomUUID();
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "report.settlement",
        entityId: correctionSettlementId,
        failureResult: "REJECTED",
        failureReasonCode: "REPORT_SETTLEMENT_CORRECTION_REJECTED",
        allowedChangeFields: ["status", "revision", "source_revision"],
        changes: {
          status: { before: source.status, after: "DRAFT" },
          revision: { before: source.revision, after: source.revision + 1 },
          source_revision: { before: null, after: source.revision },
        },
      },
      async () => {
        try {
          await this.repository.createCorrection({
            organizationId,
            sourceSettlementId,
            correctionSettlementId,
            actorProfileId: context.auth.profile.id,
          });
          return await this.require(organizationId, correctionSettlementId);
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
  }

  private record(
    id: string,
    organizationId: string,
    input: SaveReportSettlementDto,
    rowVersion: number,
    actorProfileId: string,
  ): SaveReportSettlement {
    const buyerName = input.buyerName.trim();
    if (buyerName === "") this.invalid("Buyer name is required");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.weekStart))
      this.invalid("weekStart must be a calendar date");
    return {
      id,
      organizationId,
      supplierId: input.supplierId,
      weekStart: input.weekStart,
      buyerName,
      destination: this.optionalText(input.destination),
      participationPercentage: input.participationPercentage,
      receivedAmountCrc: input.receivedAmountCrc ?? null,
      notes: this.optionalText(input.notes),
      rowVersion,
      actorProfileId,
      lines: input.lines.map((line, index) => ({
        id: randomUUID(),
        shipmentId: line.shipmentId,
        assayLabel: this.optionalText(line.assayLabel),
        karat: line.karat,
        gramsLiquidated: line.gramsLiquidated,
        pricePerKaratCrc: line.pricePerKaratCrc ?? null,
        pricePerGramCrc: line.pricePerGramCrc,
        displayOrder: index + 1,
      })),
      expenses: input.expenses.map((expense, index) => ({
        id: randomUUID(),
        category: expense.category,
        concept: expense.concept.trim(),
        amountCrc: expense.amountCrc,
        occurredOn: expense.occurredOn,
        responsibleName: this.optionalText(expense.responsibleName),
        displayOrder: index + 1,
      })),
    };
  }

  private async persist(input: SaveReportSettlement) {
    try {
      await this.repository.save(input);
      return await this.require(input.organizationId, input.id);
    } catch (error) {
      this.throwRepositoryError(error);
    }
  }

  private async require(organizationId: string, settlementId: string) {
    try {
      const settlement = await this.repository.find(
        organizationId,
        settlementId,
      );
      if (settlement !== null) return settlement;
    } catch (error) {
      this.throwRepositoryError(error);
    }
    throw new ApplicationError(
      HttpStatus.NOT_FOUND,
      "REPORT_SETTLEMENT_NOT_FOUND",
      "The financial settlement was not found",
    );
  }

  private validateRange(filters: ReportSettlementFilters): void {
    const from = Date.parse(filters.fromDate);
    const to = Date.parse(filters.toDate);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to)
      this.invalid("The financial report date range is invalid");
    if (to - from > 366 * 5 * 24 * 60 * 60 * 1000)
      this.invalid("The financial report date range cannot exceed five years");
  }

  private actor(auth: AuthenticatedContext): AuditActor {
    return {
      kind: "AUTHENTICATED_USER",
      profileId: auth.profile.id,
      authUserId: auth.profile.authUserId,
      displayName: auth.profile.displayName,
      roleCode: auth.profile.role.code,
    };
  }

  private optionalText(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized === undefined || normalized === "" ? null : normalized;
  }

  private conflict(): never {
    throw new ApplicationError(
      HttpStatus.CONFLICT,
      "REPORT_SETTLEMENT_CONFLICT",
      "The settlement changed; reload it before trying again",
    );
  }

  private invalid(message: string): never {
    throw new ApplicationError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "REPORT_SETTLEMENT_INVALID",
      message,
    );
  }

  private throwRepositoryError(error: unknown): never {
    if (!(error instanceof SupabaseDataError)) throw error;
    if (error.databaseCode === "40001") this.conflict();
    if (error.databaseCode === "23505") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "REPORT_SETTLEMENT_CORRECTION_EXISTS",
        "A correction draft already exists for this settlement",
      );
    }
    if (error.databaseCode === "P0002") {
      throw new ApplicationError(
        HttpStatus.NOT_FOUND,
        "REPORT_SETTLEMENT_NOT_FOUND",
        "The financial settlement was not found",
      );
    }
    if (error.databaseCode === "23514") {
      const ruleCode =
        error.databaseMessage?.startsWith("REPORT_") === true
          ? error.databaseMessage
          : "REPORT_SETTLEMENT_RULE_VIOLATION";
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ruleCode,
        "The settlement violates a financial reporting rule",
      );
    }
    if (error.databaseCode === "23503") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "REPORT_SETTLEMENT_REFERENCE_INVALID",
        "A supplier, shipment or profile is no longer available",
      );
    }
    throw new ApplicationError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "REPORT_SETTLEMENT_STORAGE_UNAVAILABLE",
      "Financial settlement storage is temporarily unavailable",
    );
  }

  private money(value: number): number {
    return this.round(value, 2);
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }
}
