import { HttpStatus } from "@nestjs/common";

import type {
  ManagementQueryRepository,
  ManagementShipment,
  ManagementStatisticsResponse,
} from "../management/management.contracts";
import type { ManagementService } from "../management/management.service";
import type { ReportSettlementsService } from "./report-settlements.service";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  let management: jest.Mocked<ManagementService>;
  let repository: jest.Mocked<ManagementQueryRepository>;
  let settlements: jest.Mocked<ReportSettlementsService>;
  let service: ReportsService;

  beforeEach(() => {
    management = {
      statistics: jest.fn(),
    } as unknown as jest.Mocked<ManagementService>;
    repository = {
      findLatestChange: jest.fn(),
      listOperationLines: jest.fn(),
      listShipments: jest.fn(),
      findShipment: jest.fn(),
      listShipmentSweeps: jest.fn(),
      listStatisticsFacts: jest.fn(),
    };
    settlements = {
      list: jest.fn().mockResolvedValue([]),
      weeklySummary: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ReportSettlementsService>;
    service = new ReportsService(management, repository, settlements);
  });

  it("builds the report across all pages and preserves pending versus recorded zero", async () => {
    management.statistics.mockResolvedValue(statistics());
    repository.listShipments
      .mockResolvedValueOnce({
        items: [shipment({ goldAmountGrams: 0, hasGoldResult: true })],
        page: 1,
        pageSize: 100,
        total: 2,
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        items: [
          shipment({
            shipmentId: "42000000-0000-4000-8000-000000000002",
            goldAmountGrams: null,
            hasGoldResult: false,
          }),
        ],
        page: 2,
        pageSize: 100,
        total: 2,
        totalPages: 2,
      });

    const report = await service.production("organization-id", query());

    expect(repository.listShipments.mock.calls[1]).toEqual([
      "organization-id",
      expect.objectContaining({ page: 2, pageSize: 100 }),
    ]);
    expect(report.summary).toMatchObject({
      palosPerCajuela: 5,
      pendingGoldShipments: 1,
    });
    expect(report.shipments).toHaveLength(2);
    expect(report.shipments[0]).toMatchObject({
      goldAmountGrams: 0,
      goldStatus: "REGISTERED",
      gramsPerCajuela: 0,
      palosPerCajuela: 0,
    });
    expect(report.shipments[1]).toMatchObject({
      goldAmountGrams: null,
      goldStatus: "PENDING",
      gramsPerCajuela: null,
      palosPerCajuela: null,
    });
  });

  it("rejects an invalid range before querying management data", async () => {
    await expect(
      service.production("organization-id", {
        ...query(),
        fromUtc: "2026-11-02T06:00:00.000Z",
        toUtc: "2026-11-01T06:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      response: { code: "INVALID_REPORT_DATE_RANGE" },
    });
    expect(management.statistics.mock.calls).toHaveLength(0);
    expect(repository.listShipments.mock.calls).toHaveLength(0);
  });

  it("stops oversized exports instead of returning a partial report", async () => {
    management.statistics.mockResolvedValue(statistics());
    repository.listShipments.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 100,
      total: 5_001,
      totalPages: 51,
    });

    await expect(
      service.production("organization-id", query()),
    ).rejects.toMatchObject({
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      response: { code: "REPORT_ROW_LIMIT_EXCEEDED" },
    });
    expect(repository.listShipments.mock.calls).toHaveLength(1);
  });
});

function query() {
  return {
    fromUtc: "2026-11-01T06:00:00.000Z",
    toUtc: "2026-12-01T06:00:00.000Z",
    language: "es" as const,
  };
}

function statistics(): ManagementStatisticsResponse {
  const metrics = {
    completedShipments: 2,
    totalCajuelas: 300,
    sweepCount: 3,
    goldShipments: 1,
    totalGoldGrams: 150,
    includedCajuelas: 300,
    gramsPerCajuela: 0.5,
    goldCoveragePercentage: 50,
    averageShipmentHours: 6,
  };
  return {
    generatedAtUtc: "2026-11-04T18:00:00.000Z",
    period: { ...query(), bucket: "day" },
    summary: metrics,
    previousSummary: null,
    timeline: [],
    previousTimeline: [],
    productionLines: [],
    suppliers: [{ id: "supplier-id", name: "Proveedor Norte", ...metrics }],
  };
}

function shipment(
  overrides: Partial<ManagementShipment> = {},
): ManagementShipment {
  return {
    organizationId: "organization-id",
    plantId: "plant-id",
    stationId: "station-id",
    stationName: "Estación Central",
    shipmentId: "42000000-0000-4000-8000-000000000001",
    feedCycleId: "feed-cycle-id",
    productionLineId: "line-id",
    productionLineName: "Línea Norte",
    productionLineOrder: 1,
    supplierId: "supplier-id",
    supplierName: "Proveedor Norte",
    responsibleWorkerId: "worker-id",
    responsibleWorkerName: "Responsable Uno",
    startedAtUtc: "2026-11-03T12:00:00.000Z",
    completedAtUtc: "2026-11-03T18:00:00.000Z",
    cajuelaTotal: 150,
    sweepCount: 2,
    sweptCajuelas: 150,
    cajuelasSinceLastSweep: 0,
    nextSweepAt: 400,
    sweepPending: false,
    lastActivityAtUtc: "2026-11-03T18:00:00.000Z",
    status: "COMPLETED",
    goldResultId: "gold-result-id",
    goldAmountGrams: 75,
    goldUnitCode: "g",
    goldRecordedAtUtc: "2026-11-03T19:00:00.000Z",
    goldRecordedByProfileId: "profile-id",
    goldRevisionCount: 0,
    hasGoldResult: true,
    ...overrides,
  };
}
