import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { AttendanceService } from "./attendance.service";
import type {
  PayrollAdjustment,
  PayrollFilters,
  PayrollGrossAuthorization,
  PayrollRateVersion,
  PayrollReadModel,
  PayrollRepository,
  PayrollWorkerProfile,
  PayrollWorkerResult,
} from "./payroll.contracts";
import { PAYROLL_REPOSITORY } from "./payroll.contracts";
import type {
  CreatePayrollAdjustmentDto,
  CreatePayrollGrossAuthorizationDto,
  CreatePayrollRateDto,
} from "./payroll.dto";
import { AUDIT_ACTIONS, type AuditActor } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import { ApplicationError } from "../common/errors/application-error";

interface MutationContext {
  auth: AuthenticatedContext;
  correlationId: string;
}

@Injectable()
export class PayrollService {
  constructor(
    @Inject(PAYROLL_REPOSITORY)
    private readonly repository: PayrollRepository,
    private readonly attendance: AttendanceService,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async workers(organizationId: string, search?: string) {
    try {
      return await this.repository.listWorkers(organizationId, search);
    } catch (error) {
      this.storageError(error);
    }
  }

  async report(
    organizationId: string,
    filters: PayrollFilters,
  ): Promise<PayrollReadModel> {
    const attendance = await this.attendance.hours(organizationId, filters);
    let profiles: readonly PayrollWorkerProfile[] = [];
    let rates: readonly PayrollRateVersion[] = [];
    let adjustments: readonly PayrollAdjustment[] = [];
    let authorizations: readonly PayrollGrossAuthorization[] = [];
    try {
      [profiles, rates, adjustments, authorizations] = await Promise.all([
        filters.workerId === undefined
          ? this.repository.listWorkers(organizationId)
          : this.requireWorker(organizationId, filters.workerId).then(
              (worker) => [worker],
            ),
        this.repository.listRates(organizationId, filters.workerId),
        this.repository.listAdjustments(organizationId, filters),
        this.repository.listGrossAuthorizations(organizationId, filters),
      ]);
    } catch (error) {
      this.storageError(error);
    }

    const results = profiles
      .map((worker) =>
        this.workerResult(
          worker,
          rates.filter((rate) => rate.workerId === worker.id),
          adjustments.filter((item) => item.workerId === worker.id),
          authorizations.filter((item) => item.workerId === worker.id),
          attendance.shifts.filter((shift) => shift.workerId === worker.id),
          attendance.incidents.filter(
            (incident) => incident.workerId === worker.id,
          ),
        ),
      )
      .sort((left, right) => left.worker.name.localeCompare(right.worker.name));
    const ready = results.filter(
      (worker) => worker.estimatedGrossAmountCrc !== null,
    );
    return {
      version: "payroll-preparation-v1",
      timezone: "America/Costa_Rica",
      currencyCode: "CRC",
      legalScope: "GROSS_ESTIMATE_WITHOUT_LEGAL_DEDUCTIONS",
      period: { fromDate: filters.fromDate, toDate: filters.toDate },
      generatedAtUtc: new Date().toISOString(),
      workers: results,
      summary: {
        workerCount: results.length,
        workersReady: ready.length,
        workersMissingRate: results.length - ready.length,
        confirmedMinutes: this.round(
          results.reduce((total, worker) => total + worker.confirmedMinutes, 0),
          3,
        ),
        estimatedGrossAmountCrc:
          ready.length !== results.length
            ? null
            : this.money(
                ready.reduce(
                  (total, worker) =>
                    total + (worker.estimatedGrossAmountCrc ?? 0),
                  0,
                ),
              ),
      },
    };
  }

  async updateProfile(
    organizationId: string,
    workerId: string,
    profile: {
      name: string;
      identityNumber: string | null;
      email: string | null;
      phone: string | null;
    },
    context: MutationContext,
  ) {
    const worker = await this.requireWorker(organizationId, workerId);
    const normalized = {
      name: profile.name.trim(),
      identityNumber: profile.identityNumber?.trim() || null,
      email: profile.email?.trim().toLowerCase() || null,
      phone: profile.phone?.trim() || null,
    };
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "payroll.profile",
        entityId: workerId,
        failureResult: "REJECTED",
        failureReasonCode: "PAYROLL_PROFILE_REJECTED",
        allowedChangeFields: [
          "name",
          "identity_number_configured",
          "email_configured",
          "phone_configured",
        ],
        changes: {
          name: { before: worker.name, after: normalized.name },
          identity_number_configured: {
            before: worker.identityNumber !== null,
            after: normalized.identityNumber !== null,
          },
          email_configured: {
            before: worker.email !== null,
            after: normalized.email !== null,
          },
          phone_configured: {
            before: worker.phone !== null,
            after: normalized.phone !== null,
          },
        },
      },
      async () => {
        try {
          await this.repository.updateProfile(
            organizationId,
            workerId,
            normalized,
          );
          return await this.requireWorker(organizationId, workerId);
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async createRate(
    organizationId: string,
    workerId: string,
    input: CreatePayrollRateDto,
    context: MutationContext,
  ) {
    const worker = await this.requireWorker(organizationId, workerId);
    const rate: Omit<PayrollRateVersion, "createdAtUtc"> = {
      id: randomUUID(),
      organizationId,
      workerId,
      regularHourlyRateCrc: input.regularHourlyRateCrc,
      nightMultiplier: input.nightMultiplier ?? 1.5,
      effectiveFromUtc: input.effectiveFromUtc ?? new Date().toISOString(),
      recordedByProfileId: context.auth.profile.id,
      reason: input.reason.trim(),
    };
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "payroll.rate",
        entityId: rate.id,
        failureResult: "REJECTED",
        failureReasonCode: "PAYROLL_RATE_REJECTED",
        allowedChangeFields: [
          "worker_id",
          "regular_hourly_rate_crc",
          "effective_from_utc",
        ],
        changes: {
          worker_id: { before: null, after: worker.id },
          regular_hourly_rate_crc: {
            before: worker.currentHourlyRateCrc,
            after: rate.regularHourlyRateCrc,
          },
          effective_from_utc: {
            before: worker.rateEffectiveFromUtc,
            after: rate.effectiveFromUtc,
          },
        },
      },
      async () => {
        try {
          await this.repository.createRate(rate);
          return await this.repository.listRates(organizationId, workerId);
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async createAdjustment(
    organizationId: string,
    workerId: string,
    input: CreatePayrollAdjustmentDto,
    context: MutationContext,
  ) {
    await this.requireWorker(organizationId, workerId);
    const adjustment: PayrollAdjustment = {
      id: randomUUID(),
      organizationId,
      workerId,
      adjustmentDate: input.adjustmentDate,
      adjustmentType: input.adjustmentType,
      minutes: input.minutes ?? null,
      amountCrc: input.amountCrc ?? null,
      note: input.note.trim(),
      recordedByProfileId: context.auth.profile.id,
      recordedAtUtc: new Date().toISOString(),
    };
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "payroll.adjustment",
        entityId: adjustment.id,
        failureResult: "REJECTED",
        failureReasonCode: "PAYROLL_ADJUSTMENT_REJECTED",
        allowedChangeFields: [
          "worker_id",
          "adjustment_type",
          "minutes",
          "amount_crc",
        ],
        changes: {
          worker_id: { before: null, after: workerId },
          adjustment_type: {
            before: null,
            after: adjustment.adjustmentType,
          },
          minutes: { before: null, after: adjustment.minutes },
          amount_crc: { before: null, after: adjustment.amountCrc },
        },
      },
      async () => {
        try {
          await this.repository.createAdjustment(adjustment);
          return adjustment;
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  async createGrossAuthorization(
    organizationId: string,
    workerId: string,
    input: CreatePayrollGrossAuthorizationDto,
    context: MutationContext,
  ) {
    await this.requireWorker(organizationId, workerId);
    if (input.toDate < input.fromDate) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PAYROLL_PERIOD_INVALID",
        "The payroll authorization period is invalid",
      );
    }
    const authorization: PayrollGrossAuthorization = {
      id: randomUUID(),
      organizationId,
      workerId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      authorizedAmountCrc: input.authorizedAmountCrc,
      reason: input.reason.trim(),
      recordedByProfileId: context.auth.profile.id,
      recordedByName: context.auth.profile.displayName,
      recordedAtUtc: new Date().toISOString(),
    };
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "WEB",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "payroll.gross_authorization",
        entityId: authorization.id,
        failureResult: "REJECTED",
        failureReasonCode: "PAYROLL_GROSS_AUTHORIZATION_REJECTED",
        allowedChangeFields: [
          "worker_id",
          "from_date",
          "to_date",
          "authorized_amount_crc",
        ],
        changes: {
          worker_id: { before: null, after: workerId },
          from_date: { before: null, after: authorization.fromDate },
          to_date: { before: null, after: authorization.toDate },
          authorized_amount_crc: {
            before: null,
            after: authorization.authorizedAmountCrc,
          },
        },
      },
      async () => {
        try {
          await this.repository.createGrossAuthorization(authorization);
          return authorization;
        } catch (error) {
          this.storageError(error);
        }
      },
    );
  }

  private workerResult(
    worker: PayrollWorkerProfile,
    rates: readonly PayrollRateVersion[],
    adjustments: readonly PayrollAdjustment[],
    authorizations: readonly PayrollGrossAuthorization[],
    shifts: PayrollWorkerResult["shifts"],
    incidents: PayrollWorkerResult["incidents"],
  ): PayrollWorkerResult {
    const confirmedMinutes = this.round(
      shifts.reduce((total, shift) => total + (shift.minutesInPeriod ?? 0), 0),
      3,
    );
    const missingRate =
      confirmedMinutes > 0 && worker.currentHourlyRateCrc === null;
    const calculatedGross = missingRate
      ? null
      : this.money(
          (confirmedMinutes / 60) * (worker.currentHourlyRateCrc ?? 0),
        );
    const authorization = authorizations[0] ?? null;
    const effectiveGross =
      authorization?.authorizedAmountCrc ?? calculatedGross;
    return {
      worker,
      confirmedMinutes,
      completedShiftCount: shifts.filter(
        (shift) => shift.status === "COMPLETED",
      ).length,
      openShiftCount: shifts.filter((shift) => shift.status === "OPEN").length,
      incidentCount: incidents.length,
      baseAmountCrc: calculatedGross,
      adjustmentAmountCrc: 0,
      calculatedGrossAmountCrc: calculatedGross,
      authorizedGrossAmountCrc: authorization?.authorizedAmountCrc ?? null,
      grossDifferenceCrc:
        calculatedGross === null || authorization === null
          ? null
          : this.money(authorization.authorizedAmountCrc - calculatedGross),
      estimatedGrossAmountCrc: effectiveGross,
      missingRateMinutes: missingRate ? confirmedMinutes : 0,
      grossAuthorization: authorization,
      grossAuthorizations: authorizations,
      adjustments: adjustments.map((adjustment) => ({
        ...adjustment,
        calculatedAmountCrc: 0,
      })),
      rates,
      shifts,
      incidents,
    };
  }

  private async requireWorker(organizationId: string, workerId: string) {
    try {
      const worker = await this.repository.findWorker(organizationId, workerId);
      if (worker !== null) return worker;
    } catch (error) {
      this.storageError(error);
    }
    throw new ApplicationError(
      HttpStatus.NOT_FOUND,
      "PAYROLL_WORKER_NOT_FOUND",
      "The payroll worker was not found",
    );
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

  private storageError(error: unknown): never {
    if (!(error instanceof SupabaseDataError)) throw error;
    if (error.databaseCode === "23505") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "PAYROLL_DUPLICATE",
        "The payroll value already exists",
      );
    }
    if (error.databaseCode === "23503") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "PAYROLL_REFERENCE_INVALID",
        "The payroll worker or responsible profile is unavailable",
      );
    }
    if (error.databaseCode === "23514") {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "PAYROLL_RULE_VIOLATION",
        "The payroll value does not satisfy the configured rules",
      );
    }
    throw new ApplicationError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "PAYROLL_STORAGE_UNAVAILABLE",
      "Payroll storage is temporarily unavailable",
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
