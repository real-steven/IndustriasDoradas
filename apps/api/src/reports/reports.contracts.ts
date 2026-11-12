import type {
  ReportSettlement,
  ReportWeeklySummary,
} from "./report-settlements.contracts";

export type ReportLanguage = "es" | "en";
export type ProductionReportSection = "summary" | "shipments" | "financial";
export type ProductionReportField =
  | "date"
  | "shipment"
  | "supplier"
  | "line"
  | "gold"
  | "karat"
  | "cajuelas"
  | "palos"
  | "responsible"
  | "sweeps";

export interface ProductionReportQuery {
  fromUtc: string;
  toUtc: string;
  plantId?: string;
  productionLineId?: string;
  supplierId?: string;
  language: ReportLanguage;
  sections?: ProductionReportSection[];
  fields?: ProductionReportField[];
}

export interface ProductionReportMetrics {
  completedShipments: number;
  totalCajuelas: number;
  sweepCount: number;
  goldShipments: number;
  pendingGoldShipments: number;
  totalGoldGrams: number;
  includedCajuelas: number;
  gramsPerCajuela: number | null;
  palosPerCajuela: number | null;
  goldCoveragePercentage: number;
}

export interface ProductionReportSupplier extends ProductionReportMetrics {
  supplierId: string;
  supplierName: string;
}

export interface ProductionReportShipment {
  shipmentId: string;
  shipmentCode: string;
  plantId: string;
  stationName: string;
  productionLineId: string;
  productionLineName: string;
  productionLineOrder: number;
  supplierId: string;
  supplierName: string;
  responsibleWorkerName: string | null;
  startedAtUtc: string;
  completedAtUtc: string;
  durationHours: number;
  cajuelaTotal: number;
  sweepCount: number;
  goldStatus: "REGISTERED" | "PENDING";
  goldAmountGrams: number | null;
  /** Quilataje vigente del registro de oro; null significa no registrado. */
  goldKarat: number | null;
  gramsPerCajuela: number | null;
  palosPerCajuela: number | null;
}

export interface ProductionReport {
  version: "production-gold-v1";
  language: ReportLanguage;
  timezone: "America/Costa_Rica";
  generatedAtUtc: string;
  sections: ProductionReportSection[];
  fields: ProductionReportField[];
  period: {
    fromUtc: string;
    toUtc: string;
  };
  filters: {
    plantId: string | null;
    productionLineId: string | null;
    supplierId: string | null;
  };
  summary: ProductionReportMetrics;
  suppliers: ProductionReportSupplier[];
  shipments: ProductionReportShipment[];
  financialSettlements: readonly ReportSettlement[];
  weeklyFinancialSummary: readonly ReportWeeklySummary[];
  financialSummary: {
    settlements: number;
    totalGrams: number;
    grossAmountCrc: number;
    expensesCrc: number;
    netAmountCrc: number;
    receivedAmountCrc: number;
  };
  definitions: {
    goldCoverage: string;
    gramsPerCajuela: string;
    palosPerCajuela: string;
    missingGold: string;
    financialCalculation: string;
  };
}
