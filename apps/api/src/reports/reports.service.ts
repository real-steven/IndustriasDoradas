import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { ReportSettlementsService } from "./report-settlements.service";
import type {
  ProductionReport,
  ProductionReportMetrics,
  ProductionReportQuery,
  ProductionReportShipment,
} from "./reports.contracts";
import { ApplicationError } from "../common/errors/application-error";
import {
  MANAGEMENT_QUERY_REPOSITORY,
  type ManagementQueryRepository,
  type ManagementShipment,
  type ManagementStatisticsMetrics,
} from "../management/management.contracts";
import { ManagementService } from "../management/management.service";

const MAX_REPORT_SHIPMENTS = 5_000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly management: ManagementService,
    @Inject(MANAGEMENT_QUERY_REPOSITORY)
    private readonly repository: ManagementQueryRepository,
    private readonly settlements: ReportSettlementsService,
  ) {}

  async production(
    organizationId: string,
    query: ProductionReportQuery,
  ): Promise<ProductionReport> {
    this.validateRange(query);
    const [statistics, shipments, allFinancialSettlements] = await Promise.all([
      this.management.statistics(organizationId, {
        fromUtc: query.fromUtc,
        toUtc: query.toUtc,
        bucket: "day",
        plantId: query.plantId,
        productionLineId: query.productionLineId,
        supplierId: query.supplierId,
        comparePrevious: false,
      }),
      this.listShipments(organizationId, query),
      this.settlements.list(organizationId, {
        fromDate: this.localDate(query.fromUtc),
        toDate: this.localDate(new Date(Date.parse(query.toUtc) - 1)),
        ...(query.supplierId === undefined
          ? {}
          : { supplierId: query.supplierId }),
      }),
    ]);
    const financialSettlements = this.officialSettlements(
      allFinancialSettlements,
    );
    const weeklyFinancialSummary =
      this.weeklyFinancialSummary(financialSettlements);

    return {
      version: "production-gold-v1",
      language: query.language,
      timezone: "America/Costa_Rica",
      generatedAtUtc: new Date().toISOString(),
      period: { fromUtc: query.fromUtc, toUtc: query.toUtc },
      filters: {
        plantId: query.plantId ?? null,
        productionLineId: query.productionLineId ?? null,
        supplierId: query.supplierId ?? null,
      },
      summary: this.metrics(statistics.summary),
      suppliers: statistics.suppliers.map((supplier) => ({
        supplierId: supplier.id,
        supplierName: supplier.name,
        ...this.metrics(supplier),
      })),
      shipments: shipments.map((shipment) => this.shipment(shipment)),
      financialSettlements,
      weeklyFinancialSummary,
      financialSummary: financialSettlements.reduce(
        (total, settlement) => ({
          settlements: total.settlements + 1,
          totalGrams: this.round(total.totalGrams + settlement.totalGrams, 3),
          grossAmountCrc: this.round(
            total.grossAmountCrc + settlement.grossAmountCrc,
            2,
          ),
          expensesCrc: this.round(
            total.expensesCrc + settlement.expensesCrc,
            2,
          ),
          netAmountCrc: this.round(
            total.netAmountCrc + settlement.netAmountCrc,
            2,
          ),
          receivedAmountCrc: this.round(
            total.receivedAmountCrc + settlement.effectiveReceivedAmountCrc,
            2,
          ),
        }),
        {
          settlements: 0,
          totalGrams: 0,
          grossAmountCrc: 0,
          expensesCrc: 0,
          netAmountCrc: 0,
          receivedAmountCrc: 0,
        },
      ),
      definitions: this.definitions(query.language),
    };
  }

  private async listShipments(
    organizationId: string,
    query: ProductionReportQuery,
  ): Promise<ManagementShipment[]> {
    const filters = {
      fromUtc: query.fromUtc,
      toUtc: query.toUtc,
      plantId: query.plantId,
      productionLineId: query.productionLineId,
      supplierId: query.supplierId,
      page: 1,
      pageSize: 100,
    };
    const first = await this.repository.listShipments(organizationId, filters);
    if (first.total > MAX_REPORT_SHIPMENTS) {
      throw new ApplicationError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        "REPORT_ROW_LIMIT_EXCEEDED",
        `The report cannot exceed ${MAX_REPORT_SHIPMENTS} shipments`,
      );
    }
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const result = await this.repository.listShipments(organizationId, {
        ...filters,
        page,
      });
      items.push(...result.items);
    }
    return items;
  }

  private metrics(
    metrics: ManagementStatisticsMetrics,
  ): ProductionReportMetrics {
    return {
      completedShipments: metrics.completedShipments,
      totalCajuelas: metrics.totalCajuelas,
      sweepCount: metrics.sweepCount,
      goldShipments: metrics.goldShipments,
      pendingGoldShipments: metrics.completedShipments - metrics.goldShipments,
      totalGoldGrams: metrics.totalGoldGrams,
      includedCajuelas: metrics.includedCajuelas,
      gramsPerCajuela: metrics.gramsPerCajuela,
      palosPerCajuela:
        metrics.gramsPerCajuela === null
          ? null
          : this.round(metrics.gramsPerCajuela * 10, 4),
      goldCoveragePercentage: metrics.goldCoveragePercentage,
    };
  }

  private shipment(shipment: ManagementShipment): ProductionReportShipment {
    const goldAmount =
      shipment.hasGoldResult && shipment.goldAmountGrams !== null
        ? shipment.goldAmountGrams
        : null;
    const gramsPerCajuela =
      goldAmount === null || shipment.cajuelaTotal === 0
        ? null
        : this.round(goldAmount / shipment.cajuelaTotal, 4);
    return {
      shipmentId: shipment.shipmentId,
      shipmentCode: shipment.shipmentId.slice(0, 8).toUpperCase(),
      plantId: shipment.plantId,
      stationName: shipment.stationName,
      productionLineId: shipment.productionLineId,
      productionLineName: shipment.productionLineName,
      productionLineOrder: shipment.productionLineOrder,
      supplierId: shipment.supplierId,
      supplierName: shipment.supplierName,
      responsibleWorkerName: shipment.responsibleWorkerName,
      startedAtUtc: shipment.startedAtUtc,
      completedAtUtc: shipment.completedAtUtc,
      durationHours: this.round(
        (Date.parse(shipment.completedAtUtc) -
          Date.parse(shipment.startedAtUtc)) /
          3_600_000,
        2,
      ),
      cajuelaTotal: shipment.cajuelaTotal,
      sweepCount: shipment.sweepCount,
      goldStatus: goldAmount === null ? "PENDING" : "REGISTERED",
      goldAmountGrams: goldAmount,
      gramsPerCajuela,
      palosPerCajuela:
        gramsPerCajuela === null ? null : this.round(gramsPerCajuela * 10, 4),
    };
  }

  private definitions(language: "es" | "en") {
    return language === "es"
      ? {
          goldCoverage:
            "Porcentaje de cargamentos finalizados que tienen un resultado de oro registrado.",
          gramsPerCajuela:
            "Gramos de oro registrados divididos entre las cajuelas de los cargamentos incluidos.",
          palosPerCajuela:
            "Rendimiento tradicional calculado como gramos por cajuela multiplicados por 10; 1 palo equivale a 0,10 g.",
          missingGold:
            "Un resultado pendiente se excluye del oro y del rendimiento. Un resultado registrado en cero se conserva como cero.",
          financialCalculation:
            "Solo se consolidan liquidaciones aprobadas o cerradas en su revisión vigente. El total bruto es gramos liquidados por precio por gramo. El neto descuenta los gastos y el total recibido usa la participación configurada, salvo que gerencia registre un monto recibido manual.",
        }
      : {
          goldCoverage:
            "Percentage of completed shipments with a recorded gold result.",
          gramsPerCajuela:
            "Recorded gold grams divided by the cajuelas from included shipments.",
          palosPerCajuela:
            "Traditional yield calculated as grams per cajuela multiplied by 10; 1 palo equals 0.10 g.",
          missingGold:
            "A pending result is excluded from gold and yield. A recorded zero remains zero.",
          financialCalculation:
            "Only approved or closed settlements in their current revision are consolidated. Gross total is liquidated grams multiplied by price per gram. Net total deducts expenses, and received total uses the configured participation unless management records a manual received amount.",
        };
  }

  private validateRange(query: ProductionReportQuery): void {
    const from = Date.parse(query.fromUtc);
    const to = Date.parse(query.toUtc);
    if (from >= to) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "INVALID_REPORT_DATE_RANGE",
        "fromUtc must be earlier than toUtc",
      );
    }
    if (to - from > 366 * 5 * 24 * 60 * 60 * 1000) {
      throw new ApplicationError(
        HttpStatus.BAD_REQUEST,
        "REPORT_RANGE_TOO_LARGE",
        "Report date range cannot exceed five years",
      );
    }
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private officialSettlements(
    settlements: Awaited<ReturnType<ReportSettlementsService["list"]>>,
  ) {
    const approved = settlements.filter(
      (settlement) =>
        settlement.status === "APPROVED" || settlement.status === "CLOSED",
    );
    const superseded = new Set(
      approved.flatMap((settlement) =>
        settlement.supersedesSettlementId === null
          ? []
          : [settlement.supersedesSettlementId],
      ),
    );
    return approved.filter((settlement) => !superseded.has(settlement.id));
  }

  private weeklyFinancialSummary(
    settlements: Awaited<ReturnType<ReportSettlementsService["list"]>>,
  ) {
    const weeks = new Map<
      string,
      {
        weekStart: string;
        settlements: number;
        totalGrams: number;
        grossAmountCrc: number;
        expensesCrc: number;
        netAmountCrc: number;
        receivedAmountCrc: number;
      }
    >();
    for (const settlement of settlements) {
      const week = weeks.get(settlement.weekStart) ?? {
        weekStart: settlement.weekStart,
        settlements: 0,
        totalGrams: 0,
        grossAmountCrc: 0,
        expensesCrc: 0,
        netAmountCrc: 0,
        receivedAmountCrc: 0,
      };
      week.settlements += 1;
      week.totalGrams = this.round(week.totalGrams + settlement.totalGrams, 3);
      week.grossAmountCrc = this.round(
        week.grossAmountCrc + settlement.grossAmountCrc,
        2,
      );
      week.expensesCrc = this.round(
        week.expensesCrc + settlement.expensesCrc,
        2,
      );
      week.netAmountCrc = this.round(
        week.netAmountCrc + settlement.netAmountCrc,
        2,
      );
      week.receivedAmountCrc = this.round(
        week.receivedAmountCrc + settlement.effectiveReceivedAmountCrc,
        2,
      );
      weeks.set(settlement.weekStart, week);
    }
    return [...weeks.values()].sort((left, right) =>
      right.weekStart.localeCompare(left.weekStart),
    );
  }

  private localDate(value: string | Date): string {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Costa_Rica",
      year: "numeric",
    }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
}
