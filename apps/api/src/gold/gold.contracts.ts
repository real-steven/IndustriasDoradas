export const GOLD_REPOSITORY = Symbol("GOLD_REPOSITORY");

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
}
