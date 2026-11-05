import type {
  AttendanceHoursShift,
  AttendanceHoursIncident,
} from "./attendance.contracts";

export const PAYROLL_REPOSITORY = Symbol("PAYROLL_REPOSITORY");

export const PAYROLL_ADJUSTMENT_TYPES = [
  "PAID_LEAVE_HOURS",
  "OVERTIME_HOURS",
  "HOLIDAY_HOURS",
  "REST_DAY_HOURS",
  "OTHER_EARNING",
  "OTHER_DEDUCTION",
] as const;

export type PayrollAdjustmentType = (typeof PAYROLL_ADJUSTMENT_TYPES)[number];

export interface PayrollWorkerProfile {
  id: string;
  organizationId: string;
  plantId: string;
  name: string;
  identityNumber: string | null;
  category: string;
  status: string;
  isActive: boolean;
  currentRateId: string | null;
  currentHourlyRateCrc: number | null;
  nightMultiplier: number | null;
  rateEffectiveFromUtc: string | null;
}

export interface PayrollRateVersion {
  id: string;
  organizationId: string;
  workerId: string;
  regularHourlyRateCrc: number;
  nightMultiplier: number;
  effectiveFromUtc: string;
  recordedByProfileId: string;
  reason: string;
  createdAtUtc: string;
}

export interface PayrollAdjustment {
  id: string;
  organizationId: string;
  workerId: string;
  adjustmentDate: string;
  adjustmentType: PayrollAdjustmentType;
  minutes: number | null;
  amountCrc: number | null;
  note: string;
  recordedByProfileId: string;
  recordedAtUtc: string;
}

export interface PayrollFilters {
  fromDate: string;
  toDate: string;
  workerId?: string;
}

export interface PayrollWorkerResult {
  worker: PayrollWorkerProfile;
  confirmedMinutes: number;
  completedShiftCount: number;
  openShiftCount: number;
  incidentCount: number;
  baseAmountCrc: number | null;
  adjustmentAmountCrc: number | null;
  estimatedGrossAmountCrc: number | null;
  missingRateMinutes: number;
  adjustments: readonly (PayrollAdjustment & {
    calculatedAmountCrc: number | null;
  })[];
  rates: readonly PayrollRateVersion[];
  shifts: readonly AttendanceHoursShift[];
  incidents: readonly AttendanceHoursIncident[];
}

export interface PayrollReadModel {
  version: "payroll-preparation-v1";
  timezone: "America/Costa_Rica";
  currencyCode: "CRC";
  legalScope: "GROSS_ESTIMATE_WITHOUT_LEGAL_DEDUCTIONS";
  period: { fromDate: string; toDate: string };
  generatedAtUtc: string;
  workers: readonly PayrollWorkerResult[];
  summary: {
    workerCount: number;
    workersReady: number;
    workersMissingRate: number;
    confirmedMinutes: number;
    estimatedGrossAmountCrc: number | null;
  };
}

export interface PayrollRepository {
  listWorkers(
    organizationId: string,
    search?: string,
  ): Promise<readonly PayrollWorkerProfile[]>;
  findWorker(
    organizationId: string,
    workerId: string,
  ): Promise<PayrollWorkerProfile | null>;
  updateIdentity(
    organizationId: string,
    workerId: string,
    identityNumber: string | null,
  ): Promise<void>;
  listRates(
    organizationId: string,
    workerId?: string,
  ): Promise<readonly PayrollRateVersion[]>;
  createRate(input: Omit<PayrollRateVersion, "createdAtUtc">): Promise<void>;
  listAdjustments(
    organizationId: string,
    filters: PayrollFilters,
  ): Promise<readonly PayrollAdjustment[]>;
  createAdjustment(input: PayrollAdjustment): Promise<void>;
}
