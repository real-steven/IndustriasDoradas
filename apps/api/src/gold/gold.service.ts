import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

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
      }
      suppliers.set(fact.supplierId, current);
    }

    return {
      totalShipments: facts.length,
      registeredShipments,
      excludedShipments: facts.length - registeredShipments,
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
