export const REPORT_SETTLEMENT_REPOSITORY = Symbol(
  "REPORT_SETTLEMENT_REPOSITORY",
);

export const REPORT_SETTLEMENT_STATUSES = [
  "DRAFT",
  "REVIEWED",
  "APPROVED",
  "CLOSED",
] as const;

export const REPORT_EXPENSE_CATEGORIES = [
  "TRANSPORT",
  "BAGS",
  "PLANT",
  "SALARY",
  "FINCA",
  "OTHER",
] as const;

export type ReportSettlementStatus =
  (typeof REPORT_SETTLEMENT_STATUSES)[number];
export type ReportExpenseCategory = (typeof REPORT_EXPENSE_CATEGORIES)[number];

export interface ReportSettlementLine {
  id: string;
  shipmentId: string;
  assayLabel: string | null;
  karat: number;
  gramsLiquidated: number;
  pricePerKaratCrc: number | null;
  pricePerGramCrc: number;
  grossAmountCrc: number;
  displayOrder: number;
}

export interface ReportSettlementExpense {
  id: string;
  category: ReportExpenseCategory;
  concept: string;
  amountCrc: number;
  occurredOn: string;
  responsibleName: string | null;
  displayOrder: number;
}

export interface ReportSettlement {
  id: string;
  organizationId: string;
  supplierId: string;
  supplierName: string;
  weekStart: string;
  buyerName: string;
  destination: string | null;
  currencyCode: "CRC";
  participationPercentage: number;
  receivedAmountCrc: number | null;
  notes: string | null;
  status: ReportSettlementStatus;
  revision: number;
  supersedesSettlementId: string | null;
  rowVersion: number;
  createdByProfileId: string;
  updatedByProfileId: string;
  approvedByProfileId: string | null;
  approvedAtUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  totalGrams: number;
  grossAmountCrc: number;
  expensesCrc: number;
  netAmountCrc: number;
  participationAmountCrc: number;
  effectiveReceivedAmountCrc: number;
  lines: readonly ReportSettlementLine[];
  expenses: readonly ReportSettlementExpense[];
}

export interface ReportSettlementFilters {
  fromDate: string;
  toDate: string;
  supplierId?: string;
  status?: ReportSettlementStatus;
}

export interface SaveReportSettlement {
  id: string;
  organizationId: string;
  supplierId: string;
  weekStart: string;
  buyerName: string;
  destination: string | null;
  participationPercentage: number;
  receivedAmountCrc: number | null;
  notes: string | null;
  rowVersion: number;
  actorProfileId: string;
  lines: readonly Omit<ReportSettlementLine, "grossAmountCrc">[];
  expenses: readonly ReportSettlementExpense[];
}

export interface ReportSettlementRepository {
  list(
    organizationId: string,
    filters: ReportSettlementFilters,
  ): Promise<readonly ReportSettlement[]>;
  find(
    organizationId: string,
    settlementId: string,
  ): Promise<ReportSettlement | null>;
  save(input: SaveReportSettlement): Promise<string>;
  transition(input: {
    organizationId: string;
    settlementId: string;
    rowVersion: number;
    targetStatus: ReportSettlementStatus;
    actorProfileId: string;
  }): Promise<string>;
  createCorrection(input: {
    organizationId: string;
    sourceSettlementId: string;
    correctionSettlementId: string;
    actorProfileId: string;
  }): Promise<string>;
}

export interface ReportWeeklySummary {
  weekStart: string;
  settlements: number;
  totalGrams: number;
  grossAmountCrc: number;
  expensesCrc: number;
  netAmountCrc: number;
  receivedAmountCrc: number;
}
