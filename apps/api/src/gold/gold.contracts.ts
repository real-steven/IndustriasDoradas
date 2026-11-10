export const GOLD_REPOSITORY = Symbol("GOLD_REPOSITORY");

export type GoldReviewDisposition = "PENDING" | "ACKNOWLEDGED" | "OMITTED";

export interface GoldFilters {
  fromUtc?: string;
  toUtc?: string;
  plantId?: string;
  productionLineId?: string;
  supplierId?: string;
  responsibleWorkerId?: string;
}

export interface GoldShipmentFact {
  shipmentId: string;
  supplierId: string;
  supplierName: string;
  cajuelaTotal: number;
  hasGoldResult: boolean;
  goldAmountGrams: number | null;
  reviewEntryId: string | null;
  reviewDisposition: GoldReviewDisposition;
}

export interface GoldReviewEntry {
  id: string;
  organizationId: string;
  shipmentId: string;
  disposition: GoldReviewDisposition;
  recordedAtUtc: string;
  recordedByProfileId: string;
  recordedByDisplayName: string;
  supersedesEntryId: string | null;
  reason: string | null;
}

export interface CreateGoldReviewEntry extends Omit<
  GoldReviewEntry,
  "recordedByDisplayName"
> {
  recordedByDisplayName: string;
}

export interface CreateMercuryMovement {
  id: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  productionLineId: string;
  feedCycleId: string;
  shipmentId: string;
  lineComponentId: string;
  sweepId: string;
  clientInstanceId: string;
  clientSequence: number;
  movementKind: "SWEEP_INPUT" | "SWEEP_REMAINDER";
  amountGrams: number;
  occurredAtUtc: string;
  recordedAtUtc: string;
  recordedByProfileId: string;
  supersedesMovementId: string | null;
  notes: string | null;
}

export interface GoldResultEntry {
  id: string;
  organizationId: string;
  shipmentId: string;
  amountGrams: number;
  unitCode: "g";
  recordedAtUtc: string;
  recordedByProfileId: string;
  recordedByDisplayName: string;
  supersedesResultId: string | null;
  correctionReason: string | null;
}

export interface CreateGoldResultEntry {
  id: string;
  organizationId: string;
  shipmentId: string;
  amountGrams: number;
  recordedAtUtc: string;
  recordedByProfileId: string;
  recordedByDisplayName: string;
  supersedesResultId: string | null;
  correctionReason: string | null;
}

export interface GoldSupplierCoverage {
  supplierId: string;
  supplierName: string;
  totalShipments: number;
  registeredShipments: number;
  excludedShipments: number;
  coveragePercentage: number;
  totalGoldGrams: number;
  includedCajuelas: number;
  gramsPerCajuela: number | null;
}

export interface GoldSummary {
  totalShipments: number;
  registeredShipments: number;
  excludedShipments: number;
  pendingShipments: number;
  acknowledgedShipments: number;
  acknowledgedShipmentIds: readonly string[];
  omittedShipments: number;
  omittedShipmentIds: readonly string[];
  coveragePercentage: number;
  totalGoldGrams: number;
  includedCajuelas: number;
  gramsPerCajuela: number | null;
  suppliers: readonly GoldSupplierCoverage[];
}

export interface GoldRepository {
  listShipmentFacts(
    organizationId: string,
    filters: GoldFilters,
  ): Promise<readonly GoldShipmentFact[]>;
  listResults(
    organizationId: string,
    shipmentId: string,
  ): Promise<readonly GoldResultEntry[]>;
  createResult(input: CreateGoldResultEntry): Promise<GoldResultEntry>;
  listReviews(
    organizationId: string,
    shipmentId: string,
  ): Promise<readonly GoldReviewEntry[]>;
  createReview(input: CreateGoldReviewEntry): Promise<GoldReviewEntry>;
  createMercuryMovements(
    inputs: readonly CreateMercuryMovement[],
  ): Promise<void>;
}
