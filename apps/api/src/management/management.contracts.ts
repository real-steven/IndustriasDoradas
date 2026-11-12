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

export type ShipmentSort =
  "recent" | "oldest" | "cajuelas_desc" | "cajuelas_asc";

export interface ManagementShipmentFilters extends ManagementFilters {
  sort?: ShipmentSort;
  goldResult?: "recorded" | "pending";
  /** Código corto (8 caracteres) o UUID completo del cargamento. */
  shipmentCode?: string;
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
  /** Quilataje anotado con el oro vigente; null significa no registrado. */
  goldKarat: number | null;
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
  inputMovementId: string | null;
  remainderMovementId: string | null;
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

export type StatisticsBucket = "day" | "week" | "month";

export interface ManagementStatisticsQuery {
  fromUtc: string;
  toUtc: string;
  bucket: StatisticsBucket;
  plantId?: string;
  productionLineId?: string;
  supplierId?: string;
  comparePrevious: boolean;
}

export interface ManagementStatisticsDailyFact {
  localDate: string;
  plantId: string;
  productionLineId: string;
  productionLineName: string;
  productionLineOrder: number;
  supplierId: string;
  supplierName: string;
  completedShipments: number;
  totalCajuelas: number;
  sweepCount: number;
  goldShipments: number;
  goldGrams: number;
  goldCajuelas: number;
  durationSeconds: number;
}

export interface ManagementStatisticsMetrics {
  completedShipments: number;
  totalCajuelas: number;
  sweepCount: number;
  goldShipments: number;
  totalGoldGrams: number;
  includedCajuelas: number;
  gramsPerCajuela: number | null;
  goldCoveragePercentage: number;
  averageShipmentHours: number | null;
}

export interface ManagementStatisticsBreakdown extends ManagementStatisticsMetrics {
  id: string;
  name: string;
  displayOrder?: number;
}

export interface ManagementStatisticsPoint extends ManagementStatisticsMetrics {
  bucketStart: string;
}

export interface ManagementStatisticsResponse {
  generatedAtUtc: string;
  period: {
    fromUtc: string;
    toUtc: string;
    bucket: StatisticsBucket;
  };
  summary: ManagementStatisticsMetrics;
  previousSummary: ManagementStatisticsMetrics | null;
  timeline: ManagementStatisticsPoint[];
  previousTimeline: ManagementStatisticsPoint[];
  productionLines: ManagementStatisticsBreakdown[];
  suppliers: ManagementStatisticsBreakdown[];
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
    query: ManagementShipmentFilters,
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
  listStatisticsFacts(
    organizationId: string,
    query: Omit<ManagementStatisticsQuery, "bucket" | "comparePrevious">,
  ): Promise<ManagementStatisticsDailyFact[]>;
}
