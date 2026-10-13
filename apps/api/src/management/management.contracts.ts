import type { PageResponse } from "../common/dto/page-query.dto";

export const MANAGEMENT_QUERY_REPOSITORY = Symbol(
  "MANAGEMENT_QUERY_REPOSITORY",
);

export interface ManagementPageQuery {
  page: number;
  pageSize: number;
}

export interface ManagementFilters extends ManagementPageQuery {
  fromUtc?: string;
  toUtc?: string;
  plantId?: string;
  productionLineId?: string;
  supplierId?: string;
  responsibleWorkerId?: string;
  shipmentId?: string;
}

export interface ManagementOperationLine {
  organizationId: string;
  plantId: string;
  stationId: string;
  stationName: string;
  shipmentId: string;
  feedCycleId: string;
  productionLineId: string;
  productionLineName: string;
  productionLineOrder: number;
  supplierId: string;
  supplierName: string;
  responsibleWorkerId: string | null;
  responsibleWorkerName: string | null;
  startedAtUtc: string;
  cajuelaTotal: number;
  sweepCount: number;
  sweptCajuelas: number;
  cajuelasSinceLastSweep: number;
  nextSweepAt: number;
  sweepPending: boolean;
  lastActivityAtUtc: string;
}

export interface ManagementShipment extends ManagementOperationLine {
  status: "COMPLETED";
  completedAtUtc: string;
  goldResultId: string | null;
  goldAmountGrams: number | null;
  goldUnitCode: "g" | null;
  goldRecordedAtUtc: string | null;
  goldRecordedByProfileId: string | null;
  goldRevisionCount: number | null;
  hasGoldResult: boolean;
}

export interface ManagementSweepMercury {
  organizationId: string;
  shipmentId: string;
  sweepId: string;
  sweptAtUtc: string;
  cajuelaCount: number;
  lineComponentId: string;
  lineComponentName: string;
  lineComponentOrder: number;
  inputGrams: number | null;
  remainderGrams: number | null;
  hasInputRecord: boolean;
  hasRemainderRecord: boolean;
}

export interface ManagementLatestChange {
  serverSequence: string;
  changedAtUtc: string;
}

export interface ManagementFreshness {
  cursor: string;
  hasChanges: boolean;
  effectiveAtUtc: string | null;
  serverTimeUtc: string;
  pollAfterSeconds: number;
}

export interface ManagementQueryRepository {
  findLatestChange(
    organizationId: string,
  ): Promise<ManagementLatestChange | null>;
  listOperationLines(
    organizationId: string,
    query: ManagementFilters,
  ): Promise<PageResponse<ManagementOperationLine>>;
  listShipments(
    organizationId: string,
    query: ManagementFilters,
  ): Promise<PageResponse<ManagementShipment>>;
  findShipment(
    organizationId: string,
    shipmentId: string,
  ): Promise<ManagementShipment | null>;
  listShipmentSweeps(
    organizationId: string,
    shipmentId: string,
    query: ManagementPageQuery,
  ): Promise<PageResponse<ManagementSweepMercury>>;
}
