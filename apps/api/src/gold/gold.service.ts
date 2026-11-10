import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomInt, randomUUID } from "node:crypto";

import {
  GOLD_REPOSITORY,
  type GoldFilters,
  type GoldRepository,
  type GoldShipmentFact,
  type GoldSummary,
  type GoldSupplierCoverage,
} from "./gold.contracts";
import { AUDIT_ACTIONS, type AuditActor } from "../audit/audit.contracts";
import { AuditTrailService } from "../audit/audit-trail.service";
import type { AuthenticatedContext } from "../auth/auth.contracts";
import { SupabaseDataError } from "../catalogs/supabase-catalog.repository";
import { ApplicationError } from "../common/errors/application-error";
import {
  MANAGEMENT_QUERY_REPOSITORY,
  type ManagementQueryRepository,
  type ManagementShipment,
} from "../management/management.contracts";

export interface GoldMutationContext {
  auth: AuthenticatedContext;
  correlationId: string;
}

interface CoverageAccumulator {
  supplierId: string;
  supplierName: string;
  totalShipments: number;
  registeredShipments: number;
  totalGoldCentigrams: number;
  includedCajuelas: number;
}

@Injectable()
export class GoldService {
  constructor(
    @Inject(GOLD_REPOSITORY)
    private readonly repository: GoldRepository,
    @Inject(MANAGEMENT_QUERY_REPOSITORY)
    private readonly management: ManagementQueryRepository,
    private readonly auditTrail: AuditTrailService,
  ) {}

  async summary(
    organizationId: string,
    filters: GoldFilters,
  ): Promise<GoldSummary> {
    this.validateDateRange(filters);
    try {
      return this.aggregate(
        await this.repository.listShipmentFacts(organizationId, filters),
      );
    } catch (error) {
      this.throwRepositoryError(error);
    }
  }

  async history(organizationId: string, shipmentId: string) {
    await this.requireShipment(organizationId, shipmentId);
    try {
      return await this.repository.listResults(organizationId, shipmentId);
    } catch (error) {
      this.throwRepositoryError(error);
    }
  }

  async reviewHistory(organizationId: string, shipmentId: string) {
    await this.requireShipment(organizationId, shipmentId);
    try {
      return await this.repository.listReviews(organizationId, shipmentId);
    } catch (error) {
      this.throwRepositoryError(error);
    }
  }

  async review(
    organizationId: string,
    shipmentId: string,
    input: {
      disposition: "PENDING" | "ACKNOWLEDGED" | "OMITTED";
      reason?: string;
    },
    context: GoldMutationContext,
  ) {
    const shipment = await this.requireShipment(organizationId, shipmentId);
    if (shipment.hasGoldResult && input.disposition !== "PENDING") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "GOLD_REVIEW_ALREADY_RECORDED",
        "A shipment with a gold result cannot be marked without data",
      );
    }
    const history = await this.repository.listReviews(
      organizationId,
      shipmentId,
    );
    const current = history[0] ?? null;
    if ((current?.disposition ?? "PENDING") === input.disposition) {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "GOLD_REVIEW_UNCHANGED",
        "The gold review disposition is unchanged",
      );
    }
    const reason = input.reason?.trim();
    if (input.disposition === "OMITTED" && reason === undefined) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "GOLD_REVIEW_REASON_REQUIRED",
        "A reason is required when reviewing a shipment without data",
      );
    }
    const changes = {
      gold_review_disposition: {
        before: current?.disposition ?? "PENDING",
        after: input.disposition,
      },
      ...(reason === undefined
        ? {}
        : { gold_review_reason: { before: null, after: reason } }),
    };
    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "shipment",
        entityId: shipmentId,
        failureResult: "REJECTED",
        failureReasonCode: "GOLD_REVIEW_REJECTED",
        allowedChangeFields: Object.keys(changes),
        changes,
      },
      async () => {
        try {
          return await this.repository.createReview({
            id: randomUUID(),
            organizationId,
            shipmentId,
            disposition: input.disposition,
            recordedAtUtc: new Date().toISOString(),
            recordedByProfileId: context.auth.profile.id,
            recordedByDisplayName: context.auth.profile.displayName,
            supersedesEntryId: current?.id ?? null,
            reason: reason ?? null,
          });
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
  }

  async recordMercury(
    organizationId: string,
    shipmentId: string,
    sweepId: string,
    input: {
      measurements: readonly {
        lineComponentId: string;
        inputGrams?: number;
        remainderGrams?: number;
      }[];
      correctionReason?: string;
    },
    context: GoldMutationContext,
  ) {
    const shipment = await this.requireShipment(organizationId, shipmentId);
    const sweeps = await this.management.listShipmentSweeps(
      organizationId,
      shipmentId,
      { page: 1, pageSize: 1000 },
    );
    const components = sweeps.items.filter((item) => item.sweepId === sweepId);
    if (components.length === 0) {
      throw new ApplicationError(
        HttpStatus.NOT_FOUND,
        "MERCURY_SWEEP_NOT_FOUND",
        "The production sweep was not found",
      );
    }
    const reason = input.correctionReason?.trim();
    const recordedAtUtc = new Date().toISOString();
    const sequenceBase = Date.now() * 1000 + randomInt(0, 100);
    const movements = input.measurements.flatMap((measurement) => {
      const component = components.find(
        (candidate) =>
          candidate.lineComponentId === measurement.lineComponentId,
      );
      if (component === undefined) {
        throw new ApplicationError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "MERCURY_COMPONENT_INVALID",
          "The component does not belong to the selected sweep",
        );
      }
      const values = [
        {
          kind: "SWEEP_INPUT" as const,
          value: measurement.inputGrams,
          previous: component.inputGrams,
          previousId: component.inputMovementId,
        },
        {
          kind: "SWEEP_REMAINDER" as const,
          value: measurement.remainderGrams,
          previous: component.remainderGrams,
          previousId: component.remainderMovementId,
        },
      ];
      return values.flatMap((value) => {
        if (value.value === undefined || value.value === value.previous)
          return [];
        this.validateAmount(value.value);
        if (value.previousId !== null && reason === undefined) {
          throw new ApplicationError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "MERCURY_CORRECTION_REASON_REQUIRED",
            "A reason is required to correct mercury data",
          );
        }
        return [
          {
            id: randomUUID(),
            organizationId,
            plantId: shipment.plantId,
            stationId: shipment.stationId,
            productionLineId: shipment.productionLineId,
            feedCycleId: shipment.feedCycleId,
            shipmentId,
            lineComponentId: component.lineComponentId,
            sweepId,
            clientInstanceId: context.auth.profile.id,
            clientSequence: sequenceBase,
            movementKind: value.kind,
            amountGrams: value.value,
            occurredAtUtc: component.sweptAtUtc,
            recordedAtUtc,
            recordedByProfileId: context.auth.profile.id,
            supersedesMovementId: value.previousId,
            notes: reason ?? null,
          },
        ];
      });
    });
    movements.forEach((movement, index) => {
      movement.clientSequence = sequenceBase + index;
    });
    if (movements.length === 0) {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "MERCURY_VALUES_UNCHANGED",
        "No mercury values changed",
      );
    }
    const changes = Object.fromEntries(
      movements.map((movement) => {
        const component = components.find(
          (candidate) => candidate.lineComponentId === movement.lineComponentId,
        );
        const before =
          movement.movementKind === "SWEEP_INPUT"
            ? (component?.inputGrams ?? null)
            : (component?.remainderGrams ?? null);
        return [
          `mercury_${movement.lineComponentId}_${movement.movementKind.toLowerCase()}`,
          { before, after: movement.amountGrams },
        ];
      }),
    );
    await this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "production_sweep",
        entityId: sweepId,
        failureResult: "REJECTED",
        failureReasonCode: "MERCURY_MEASUREMENT_REJECTED",
        allowedChangeFields: Object.keys(changes),
        changes,
      },
      async () => {
        try {
          await this.repository.createMercuryMovements(movements);
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
    return this.management.listShipmentSweeps(organizationId, shipmentId, {
      page: 1,
      pageSize: 1000,
    });
  }

  async record(
    organizationId: string,
    shipmentId: string,
    input: { amountGrams: number; correctionReason?: string },
    context: GoldMutationContext,
  ) {
    this.validateAmount(input.amountGrams);
    const shipment = await this.requireShipment(organizationId, shipmentId);
    const previous = this.currentAmount(shipment);
    const reason = input.correctionReason?.trim();

    if (previous === null && reason !== undefined) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "GOLD_INITIAL_REASON_NOT_ALLOWED",
        "An initial gold result must not include a correction reason",
      );
    }
    if (previous !== null && reason === undefined) {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "GOLD_CORRECTION_REASON_REQUIRED",
        "A correction reason is required",
      );
    }
    if (
      previous !== null &&
      this.centigrams(previous) === this.centigrams(input.amountGrams)
    ) {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "GOLD_AMOUNT_UNCHANGED",
        "The corrected gold amount must be different",
      );
    }

    const id = randomUUID();
    const changes = {
      gold_amount_grams: { before: previous, after: input.amountGrams },
      ...(reason === undefined
        ? {}
        : {
            gold_correction_reason: { before: null, after: reason },
          }),
    };

    return this.auditTrail.execute(
      {
        correlationId: context.correlationId,
        organizationId,
        actor: this.actor(context.auth),
        origin: "API",
        action: AUDIT_ACTIONS.BUSINESS_MUTATION,
        entityType: "shipment",
        entityId: shipmentId,
        failureResult: "REJECTED",
        failureReasonCode: "GOLD_RESULT_REJECTED",
        allowedChangeFields: Object.keys(changes),
        changes,
      },
      async () => {
        try {
          return await this.repository.createResult({
            id,
            organizationId,
            shipmentId,
            amountGrams: input.amountGrams,
            recordedAtUtc: new Date().toISOString(),
            recordedByProfileId: context.auth.profile.id,
            recordedByDisplayName: context.auth.profile.displayName,
            supersedesResultId: shipment.goldResultId,
            correctionReason: reason ?? null,
          });
        } catch (error) {
          this.throwRepositoryError(error);
        }
      },
    );
  }

  private aggregate(facts: readonly GoldShipmentFact[]): GoldSummary {
    const suppliers = new Map<string, CoverageAccumulator>();
    let registeredShipments = 0;
    let pendingShipments = 0;
    let acknowledgedShipments = 0;
    let omittedShipments = 0;
    let totalGoldCentigrams = 0;
    let includedCajuelas = 0;

    for (const fact of facts) {
      const current = suppliers.get(fact.supplierId) ?? {
        supplierId: fact.supplierId,
        supplierName: fact.supplierName,
        totalShipments: 0,
        registeredShipments: 0,
        totalGoldCentigrams: 0,
        includedCajuelas: 0,
      };
      current.totalShipments += 1;
      if (fact.hasGoldResult && fact.goldAmountGrams !== null) {
        const amount = this.centigrams(fact.goldAmountGrams);
        current.registeredShipments += 1;
        current.totalGoldCentigrams += amount;
        current.includedCajuelas += fact.cajuelaTotal;
        registeredShipments += 1;
        totalGoldCentigrams += amount;
        includedCajuelas += fact.cajuelaTotal;
      } else if (fact.reviewDisposition === "OMITTED") {
        omittedShipments += 1;
      } else if (fact.reviewDisposition === "ACKNOWLEDGED") {
        acknowledgedShipments += 1;
      } else {
        pendingShipments += 1;
      }
      suppliers.set(fact.supplierId, current);
    }

    return {
      totalShipments: facts.length,
      registeredShipments,
      excludedShipments: facts.length - registeredShipments,
      pendingShipments,
      acknowledgedShipments,
      acknowledgedShipmentIds: facts
        .filter((fact) => fact.reviewDisposition === "ACKNOWLEDGED")
        .map((fact) => fact.shipmentId),
      omittedShipments,
      omittedShipmentIds: facts
        .filter((fact) => fact.reviewDisposition === "OMITTED")
        .map((fact) => fact.shipmentId),
      coveragePercentage: this.percentage(registeredShipments, facts.length),
      totalGoldGrams: this.grams(totalGoldCentigrams),
      includedCajuelas,
      gramsPerCajuela: this.ratio(totalGoldCentigrams, includedCajuelas),
      suppliers: [...suppliers.values()]
        .map((supplier) => this.supplierCoverage(supplier))
        .sort(
          (left, right) =>
            right.gramsPerCajuela! - left.gramsPerCajuela! ||
            left.supplierName.localeCompare(right.supplierName, "es"),
        ),
    };
  }

  private supplierCoverage(
    supplier: CoverageAccumulator,
  ): GoldSupplierCoverage {
    return {
      supplierId: supplier.supplierId,
      supplierName: supplier.supplierName,
      totalShipments: supplier.totalShipments,
      registeredShipments: supplier.registeredShipments,
      excludedShipments: supplier.totalShipments - supplier.registeredShipments,
      coveragePercentage: this.percentage(
        supplier.registeredShipments,
        supplier.totalShipments,
      ),
      totalGoldGrams: this.grams(supplier.totalGoldCentigrams),
      includedCajuelas: supplier.includedCajuelas,
      gramsPerCajuela: this.ratio(
        supplier.totalGoldCentigrams,
        supplier.includedCajuelas,
      ),
    };
  }

  private async requireShipment(
    organizationId: string,
    shipmentId: string,
  ): Promise<ManagementShipment> {
    try {
      const shipment = await this.management.findShipment(
        organizationId,
        shipmentId,
      );
      if (shipment !== null) return shipment;
    } catch (error) {
      this.throwRepositoryError(error);
    }
    throw new ApplicationError(
      HttpStatus.NOT_FOUND,
      "GOLD_SHIPMENT_NOT_FOUND",
      "A completed shipment was not found",
    );
  }

  private currentAmount(shipment: ManagementShipment): number | null {
    if (!shipment.hasGoldResult) return null;
    if (
      shipment.goldResultId === null ||
      shipment.goldAmountGrams === null ||
      shipment.goldUnitCode !== "g"
    ) {
      throw new ApplicationError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "GOLD_PROJECTION_INVALID",
        "The current gold projection is inconsistent",
      );
    }
    return shipment.goldAmountGrams;
  }

  private validateAmount(amount: number): void {
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8
    ) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "GOLD_AMOUNT_INVALID",
        "Gold amount must be non-negative with at most two decimals",
      );
    }
  }

  private validateDateRange(filters: GoldFilters): void {
    if (
      filters.fromUtc !== undefined &&
      filters.toUtc !== undefined &&
      Date.parse(filters.fromUtc) >= Date.parse(filters.toUtc)
    ) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "INVALID_GOLD_DATE_RANGE",
        "fromUtc must be earlier than toUtc",
      );
    }
  }

  private centigrams(amount: number): number {
    return Math.round(amount * 100);
  }

  private grams(centigrams: number): number {
    return centigrams / 100;
  }

  private percentage(part: number, total: number): number {
    return total === 0 ? 0 : Number(((part / total) * 100).toFixed(2));
  }

  private ratio(centigrams: number, cajuelas: number): number | null {
    return cajuelas === 0
      ? null
      : Number((this.grams(centigrams) / cajuelas).toFixed(4));
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

  private throwRepositoryError(error: unknown): never {
    if (!(error instanceof SupabaseDataError)) throw error;
    if (error.databaseCode === "23505") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "GOLD_RESULT_CONFLICT",
        "The gold result changed concurrently; reload before retrying",
      );
    }
    if (error.databaseCode === "23514") {
      throw new ApplicationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "GOLD_RESULT_RULE_VIOLATION",
        "The gold result violates a business restriction",
      );
    }
    if (error.databaseCode === "23503") {
      throw new ApplicationError(
        HttpStatus.CONFLICT,
        "GOLD_RESULT_REFERENCE_INVALID",
        "The shipment or author is no longer available",
      );
    }
    throw new ApplicationError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "GOLD_STORAGE_UNAVAILABLE",
      "Gold result storage is temporarily unavailable",
    );
  }
}
